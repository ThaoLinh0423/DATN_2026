package services

import (
	"database/sql"
	"errors"
	"log"
	"time"

	"air-quality-api/models"
)

type AdminService struct {
	db *sql.DB
}

func NewAdminService(db *sql.DB) *AdminService {
	return &AdminService{db: db}
}

// ListUsers trả về danh sách tất cả users, hỗ trợ cursor-based pagination và lọc theo role.
func (s *AdminService) ListUsers(role string, limit int, cursor string) ([]models.AdminUser, *string, int, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	// Đếm tổng (theo filter role nếu có)
	countQuery := `SELECT COUNT(*) FROM users WHERE 1=1`
	countArgs := []interface{}{}
	if role != "" && role != "all" {
		countArgs = append(countArgs, role)
		countQuery += ` AND role = $1`
	}
	var total int
	if err := s.db.QueryRow(countQuery, countArgs...).Scan(&total); err != nil {
		log.Printf("[ADMIN] Error counting users: %v", err)
		return nil, nil, 0, err
	}

	// Query với cursor + role filter
	query := `
		SELECT user_id, email, COALESCE(name,''), COALESCE(phone,''), role, timezone, created_at, updated_at
		FROM users
		WHERE 1=1`
	args := []interface{}{}
	argIdx := 1

	if role != "" && role != "all" {
		query += ` AND role = $` + itoa(argIdx)
		args = append(args, role)
		argIdx++
	}

	if cursor != "" {
		query += ` AND created_at < (SELECT created_at FROM users WHERE user_id = $` + itoa(argIdx) + `)`
		args = append(args, cursor)
		argIdx++
	}

	query += ` ORDER BY created_at DESC LIMIT $` + itoa(argIdx)
	args = append(args, limit+1)

	rows, err := s.db.Query(query, args...)
	if err != nil {
		log.Printf("[ADMIN] Error listing users: %v", err)
		return nil, nil, 0, err
	}
	defer rows.Close()

	var users []models.AdminUser
	for rows.Next() {
		var u models.AdminUser
		if err := rows.Scan(
			&u.UserID, &u.Email, &u.Name, &u.Phone,
			&u.Role, &u.Timezone, &u.CreatedAt, &u.UpdatedAt,
		); err != nil {
			log.Printf("[ADMIN] Error scanning user: %v", err)
			return nil, nil, 0, err
		}
		if len(users) < limit {
			users = append(users, u)
		}
	}

	var nextCursor *string
	if len(users) == limit {
		// Có thêm dữ liệu — lấy thêm 1 để biết
		extraRows, _ := s.db.Query(query, args...)
		count := 0
		if extraRows != nil {
			for extraRows.Next() {
				count++
			}
			extraRows.Close()
		}
		if count > limit {
			lastID := users[len(users)-1].UserID
			nextCursor = &lastID
		}
	}

	return users, nextCursor, total, nil
}

// GetUserByID trả về thông tin user theo ID (dùng cho admin xem chi tiết).
func (s *AdminService) GetUserByID(userID string) (*models.AdminUser, error) {
	var u models.AdminUser
	err := s.db.QueryRow(`
		SELECT user_id, email, COALESCE(name,''), COALESCE(phone,''), role, timezone, created_at, updated_at
		FROM users WHERE user_id = $1`, userID,
	).Scan(&u.UserID, &u.Email, &u.Name, &u.Phone, &u.Role, &u.Timezone, &u.CreatedAt, &u.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// GetUserDetail trả về thông tin user kèm danh sách sensors có quyền truy cập.
func (s *AdminService) GetUserDetail(userID string) (*models.AdminUserDetail, error) {
	// Lấy thông tin user cơ bản
	user, err := s.GetUserByID(userID)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, nil
	}

	// Lấy danh sách sensors user có quyền truy cập
	rows, err := s.db.Query(`
		SELECT s.sensor_id, s.name
		FROM sensor_access sa
		INNER JOIN sensors s ON s.sensor_id = sa.sensor_id
		WHERE sa.user_id = $1
		ORDER BY s.name`, userID)
	if err != nil {
		log.Printf("[ADMIN] Error fetching user sensors: %v", err)
		// Vẫn trả về user với danh sách rỗng thay vì fail
		return &models.AdminUserDetail{
			AdminUser: *user,
			Sensors:   []models.SensorInfo{},
		}, nil
	}
	defer rows.Close()

	var sensors []models.SensorInfo
	for rows.Next() {
		var si models.SensorInfo
		if err := rows.Scan(&si.SensorID, &si.Name); err != nil {
			log.Printf("[ADMIN] Error scanning sensor: %v", err)
			continue
		}
		sensors = append(sensors, si)
	}

	if sensors == nil {
		sensors = []models.SensorInfo{}
	}

	return &models.AdminUserDetail{
		AdminUser: *user,
		Sensors:   sensors,
	}, nil
}

// UpdateRole đổi role của user. Admin không thể tự hạ quyền chính mình.
func (s *AdminService) UpdateRole(adminID, targetUserID, newRole string) (*models.AdminUser, error) {
	if adminID == targetUserID {
		return nil, errors.New("không thể thay đổi role của chính mình")
	}

	// Kiểm tra user tồn tại
	existing, err := s.GetUserByID(targetUserID)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, nil // caller xử lý 404
	}

	now := time.Now()
	_, err = s.db.Exec(
		`UPDATE users SET role = $1, updated_at = $2 WHERE user_id = $3`,
		newRole, now, targetUserID,
	)
	if err != nil {
		log.Printf("[ADMIN] Error updating role for user %s: %v", targetUserID, err)
		return nil, err
	}

	log.Printf("[ADMIN] Role updated: userID=%s oldRole=%s newRole=%s byAdmin=%s",
		targetUserID, existing.Role, newRole, adminID)

	existing.Role = newRole
	existing.UpdatedAt = now
	return existing, nil
}

// itoa chuyển int sang string để build query (tránh import strconv làm rối package)
func itoa(i int) string {
	switch i {
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
	// fallback cho i > 5 (hiếm gặp trong query này)
	result := ""
	for i > 0 {
		result = string(rune('0'+i%10)) + result
		i /= 10
	}
	return result
}
