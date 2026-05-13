package services

import (
	"database/sql"
	"errors"
	"log"
	"time"

	"air-quality-api/models"
	"github.com/google/uuid"
)

type SensorService struct {
	db *sql.DB
}

func NewSensorService(db *sql.DB) *SensorService {
	return &SensorService{db: db}
}

// GetList trả về danh sách sensor theo quyền của caller:
//   - Không có auth (userID rỗng): trả về tất cả (public)
//   - role admin/manager: trả về tất cả
//   - role user: chỉ trả về sensor đã được grant access
func (s *SensorService) GetList(callerID, callerRole string, limit int, cursor string) ([]models.Sensor, *string, error) {
	if limit == 0 || limit > 100 {
		limit = 50
	}

	var query string
	var args []interface{}

	isPrivileged := callerRole == "admin" || callerRole == "manager"

	if callerID == "" || isPrivileged {
		// Không auth hoặc admin/manager → tất cả sensors
		query = `
			SELECT sensor_id, name, device_id, topic_path, customer_id,
			       latitude, longitude, owner_id, type, status, created_at, updated_at
			FROM sensors`
		if cursor != "" {
			query += ` WHERE created_at < (SELECT created_at FROM sensors WHERE sensor_id = $1)`
			args = append(args, cursor)
		}
		query += ` ORDER BY created_at DESC LIMIT $` + nextArg(len(args))
		args = append(args, limit+1)
	} else {
		// User thường → chỉ sensor được grant
		query = `
			SELECT s.sensor_id, s.name, s.device_id, s.topic_path, s.customer_id,
			       s.latitude, s.longitude, s.owner_id, s.type, s.status, s.created_at, s.updated_at
			FROM sensors s
			INNER JOIN sensor_access sa ON sa.sensor_id = s.sensor_id
			WHERE sa.user_id = $1`
		args = append(args, callerID)
		if cursor != "" {
			query += ` AND s.created_at < (SELECT created_at FROM sensors WHERE sensor_id = $2)`
			args = append(args, cursor)
		}
		query += ` ORDER BY s.created_at DESC LIMIT $` + nextArg(len(args))
		args = append(args, limit+1)
	}

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	var sensors []models.Sensor
	for rows.Next() {
		var sensor models.Sensor
		var deviceID, topicPath, customerID sql.NullString
		if err := rows.Scan(
			&sensor.SensorID, &sensor.Name,
			&deviceID, &topicPath, &customerID,
			&sensor.Location.Latitude, &sensor.Location.Longitude,
			&sensor.OwnerID, &sensor.Type, &sensor.Status,
			&sensor.CreatedAt, &sensor.UpdatedAt,
		); err != nil {
			return nil, nil, err
		}
		sensor.DeviceID = deviceID.String
		sensor.TopicPath = topicPath.String
		sensor.CustomerID = customerID.String
		sensors = append(sensors, sensor)
	}

	var nextCursor *string
	if len(sensors) > limit {
		sensors = sensors[:limit]
		nextCursor = &sensors[limit-1].SensorID
	}
	return sensors, nextCursor, nil
}

func (s *SensorService) GetByID(sensorID string) (*models.Sensor, error) {
	var sensor models.Sensor
	var deviceID, topicPath, customerID sql.NullString
	err := s.db.QueryRow(`
		SELECT sensor_id, name, device_id, topic_path, customer_id,
		       latitude, longitude, owner_id, type, status, created_at, updated_at
		FROM sensors WHERE sensor_id = $1`, sensorID).Scan(
		&sensor.SensorID, &sensor.Name,
		&deviceID, &topicPath, &customerID,
		&sensor.Location.Latitude, &sensor.Location.Longitude,
		&sensor.OwnerID, &sensor.Type, &sensor.Status,
		&sensor.CreatedAt, &sensor.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, errors.New("sensor not found")
	}
	if err != nil {
		return nil, err
	}
	sensor.DeviceID = deviceID.String
	sensor.TopicPath = topicPath.String
	sensor.CustomerID = customerID.String
	return &sensor, nil
}

// Delete xóa sensor. Chỉ admin hoặc manager được phép.
// Trả về deviceID để caller có thể báo poller dừng poll.
func (s *SensorService) Delete(sensorID string) (string, error) {
	var deviceID sql.NullString
	err := s.db.QueryRow(`SELECT device_id FROM sensors WHERE sensor_id = $1`, sensorID).Scan(&deviceID)
	if err == sql.ErrNoRows {
		return "", nil // caller xử lý 404
	}
	if err != nil {
		return "", err
	}

	if _, err := s.db.Exec(`DELETE FROM sensors WHERE sensor_id = $1`, sensorID); err != nil {
		log.Printf("[SENSOR] Error deleting sensor %s: %v", sensorID, err)
		return "", err
	}

	log.Printf("[SENSOR] Deleted sensor: id=%s deviceId=%s", sensorID, deviceID.String)
	return deviceID.String, nil
}

// ==================== Sensor Access ====================

// GetAccessList trả về danh sách users có quyền truy cập sensor.
func (s *SensorService) GetAccessList(sensorID string) ([]models.SensorAccess, error) {
	rows, err := s.db.Query(`
		SELECT sa.id, sa.sensor_id, sa.user_id, u.email, sa.granted_by, sa.created_at
		FROM sensor_access sa
		INNER JOIN users u ON u.user_id = sa.user_id
		WHERE sa.sensor_id = $1
		ORDER BY sa.created_at DESC`, sensorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []models.SensorAccess
	for rows.Next() {
		var a models.SensorAccess
		if err := rows.Scan(&a.ID, &a.SensorID, &a.UserID, &a.UserEmail, &a.GrantedBy, &a.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, a)
	}
	return list, nil
}

// GrantAccess cấp quyền cho user xem sensor. Idempotent — không lỗi nếu đã tồn tại.
func (s *SensorService) GrantAccess(sensorID, userID, grantedBy string) (*models.SensorAccess, error) {
	// Kiểm tra sensor tồn tại
	var exists bool
	if err := s.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM sensors WHERE sensor_id = $1)`, sensorID).Scan(&exists); err != nil {
		return nil, err
	}
	if !exists {
		return nil, nil // caller xử lý 404
	}

	// Kiểm tra user tồn tại
	if err := s.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM users WHERE user_id = $1)`, userID).Scan(&exists); err != nil {
		return nil, err
	}
	if !exists {
		return nil, errors.New("user not found")
	}

	id := uuid.New().String()
	now := time.Now()

	// ON CONFLICT DO NOTHING — idempotent
	_, err := s.db.Exec(`
		INSERT INTO sensor_access (id, sensor_id, user_id, granted_by, created_at)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (sensor_id, user_id) DO NOTHING`,
		id, sensorID, userID, grantedBy, now,
	)
	if err != nil {
		return nil, err
	}

	// Lấy bản ghi (có thể đã tồn tại từ trước)
	var a models.SensorAccess
	err = s.db.QueryRow(`
		SELECT sa.id, sa.sensor_id, sa.user_id, u.email, sa.granted_by, sa.created_at
		FROM sensor_access sa
		INNER JOIN users u ON u.user_id = sa.user_id
		WHERE sa.sensor_id = $1 AND sa.user_id = $2`, sensorID, userID,
	).Scan(&a.ID, &a.SensorID, &a.UserID, &a.UserEmail, &a.GrantedBy, &a.CreatedAt)
	if err != nil {
		return nil, err
	}

	return &a, nil
}

// RevokeAccess thu hồi quyền của user với sensor.
// Trả về false nếu bản ghi không tồn tại (không lỗi).
func (s *SensorService) RevokeAccess(sensorID, userID string) (bool, error) {
	result, err := s.db.Exec(
		`DELETE FROM sensor_access WHERE sensor_id = $1 AND user_id = $2`,
		sensorID, userID,
	)
	if err != nil {
		return false, err
	}
	n, _ := result.RowsAffected()
	return n > 0, nil
}

// HasAccess kiểm tra user có quyền xem sensor không.
// admin/manager luôn có quyền — caller nên kiểm tra role trước khi gọi hàm này.
func (s *SensorService) HasAccess(sensorID, userID string) (bool, error) {
	var exists bool
	err := s.db.QueryRow(
		`SELECT EXISTS(SELECT 1 FROM sensor_access WHERE sensor_id = $1 AND user_id = $2)`,
		sensorID, userID,
	).Scan(&exists)
	return exists, err
}

// ==================== Poller helpers ====================

func (s *SensorService) GetAllSensorNodes() ([]string, error) {
	rows, err := s.db.Query(`
		SELECT device_id FROM sensors
		WHERE status = 'active' AND device_id IS NOT NULL AND device_id != ''`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var nodes []string
	for rows.Next() {
		var node string
		if err := rows.Scan(&node); err != nil {
			continue
		}
		nodes = append(nodes, node)
	}
	return nodes, nil
}

func (s *SensorService) GetDeviceIDToSensorIDMap() (map[string]string, error) {
	rows, err := s.db.Query(`
		SELECT device_id, sensor_id FROM sensors
		WHERE status = 'active' AND device_id IS NOT NULL AND device_id != ''`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	m := make(map[string]string)
	for rows.Next() {
		var deviceID, sensorID string
		if err := rows.Scan(&deviceID, &sensorID); err != nil {
			log.Printf("[SENSOR] Error scanning device->sensor map: %v", err)
			continue
		}
		m[deviceID] = sensorID
	}
	return m, nil
}

func (s *SensorService) Create(ownerID string, req models.SensorInput) (*models.Sensor, error) {
	sensorID := uuid.New().String()
	now := time.Now()

	_, err := s.db.Exec(`
		INSERT INTO sensors (sensor_id, name, device_id, topic_path, customer_id,
		                     latitude, longitude, owner_id, type, status, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		sensorID, req.Name, req.DeviceID, req.TopicPath, req.CustomerID,
		req.Location.Latitude, req.Location.Longitude,
		ownerID, req.Type, "active", now, now,
	)
	if err != nil {
		log.Println("Error creating sensor:", err)
		return nil, errors.New("failed to create sensor")
	}

	return &models.Sensor{
		SensorID:   sensorID,
		Name:       req.Name,
		DeviceID:   req.DeviceID,
		TopicPath:  req.TopicPath,
		CustomerID: req.CustomerID,
		Location:   req.Location,
		OwnerID:    ownerID,
		Type:       req.Type,
		Status:     "active",
		CreatedAt:  now,
		UpdatedAt:  now,
	}, nil
}

// nextArg trả về $N cho query param tiếp theo (1-indexed).
func nextArg(currentCount int) string {
	n := currentCount + 1
	switch n {
	case 1:
		return "1"
	case 2:
		return "2"
	case 3:
		return "3"
	case 4:
		return "4"
	case 5:
		return "5"
	}
	result := ""
	for n > 0 {
		result = string(rune('0'+n%10)) + result
		n /= 10
	}
	return result
}
