package services

import (
	"database/sql"
	"fmt"
	"log"
	"net/smtp"
	"time"

	"air-quality-api/models"
	"github.com/google/uuid"
	"github.com/lib/pq"
)

type AlertService struct {
	db               *sql.DB
	settingsService  *SettingsService
}

func NewAlertService(db *sql.DB) *AlertService {
	return &AlertService{
		db:              db,
		settingsService: NewSettingsService(db),
	}
}

// GetList lấy danh sách cảnh báo với phân trang và lọc
func (s *AlertService) GetList(status string, limit int, cursor string) ([]models.Alert, *string, error) {
	var alerts []models.Alert

	query := `
		SELECT alert_id, sensor_id, alert_type, message, 
		       is_active, severity, value, threshold, created_at, updated_at
		FROM alerts
		WHERE 1=1
	`

	args := []interface{}{}
	argCount := 0

	// Filter by status
	if status != "all" {
		argCount++
		if status == "active" {
			query += ` AND is_active = $` + fmt.Sprintf("%d", argCount)
			args = append(args, true)
		} else if status == "inactive" {
			query += ` AND is_active = $` + fmt.Sprintf("%d", argCount)
			args = append(args, false)
		}
	}

	// Cursor-based pagination
	if cursor != "" {
		argCount++
		query += ` AND created_at < (SELECT created_at FROM alerts WHERE alert_id = $` + fmt.Sprintf("%d", argCount) + `)`
		args = append(args, cursor)
	}

	query += ` ORDER BY created_at DESC LIMIT $` + fmt.Sprintf("%d", len(args)+1)
	args = append(args, limit+1)

	rows, err := s.db.Query(query, args...)
	if err != nil {
		log.Printf("Error querying alerts: %v", err)
		return nil, nil, err
	}
	defer rows.Close()

	hasMore := false
	for rows.Next() {
		if len(alerts) >= limit {
			hasMore = true
			break
		}

		var alert models.Alert
		err := rows.Scan(
			&alert.ID, &alert.SensorID, &alert.AlertType,
			&alert.Message, &alert.IsActive, &alert.Severity, &alert.Value,
			&alert.Threshold, &alert.CreatedAt, &alert.UpdatedAt,
		)
		if err != nil {
			log.Printf("Error scanning alert: %v", err)
			return nil, nil, err
		}
		alerts = append(alerts, alert)
	}

	var nextCursor *string
	if hasMore && len(alerts) > 0 {
		lastAlert := alerts[len(alerts)-1]
		nextCursor = &lastAlert.ID
	}

	return alerts, nextCursor, nil
}

// GetDetail lấy chi tiết một cảnh báo
func (s *AlertService) GetDetail(alertID string) (*models.Alert, error) {
	alert := &models.Alert{}

	query := `
		SELECT alert_id, sensor_id, alert_type, message, 
		       is_active, severity, value, threshold, created_at, updated_at
		FROM alerts
		WHERE alert_id = $1
	`

	err := s.db.QueryRow(query, alertID).Scan(
		&alert.ID, &alert.SensorID, &alert.AlertType,
		&alert.Message, &alert.IsActive, &alert.Severity, &alert.Value,
		&alert.Threshold, &alert.CreatedAt, &alert.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		log.Printf("Error getting alert: %v", err)
		return nil, err
	}

	return alert, nil
}

// Create tạo cảnh báo mới
func (s *AlertService) Create(req models.CreateAlertRequest) (*models.Alert, error) {
	alertID := uuid.New().String()
	now := time.Now()

	query := `
		INSERT INTO alerts (alert_id, sensor_id, alert_type, message, 
		                    is_active, severity, value, threshold, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`

	_, err := s.db.Exec(query,
		alertID, req.SensorID, req.AlertType, req.Message,
		true, req.Severity, req.Value, req.Threshold, now, now,
	)

	if err != nil {
		log.Printf("Error creating alert: %v", err)
		return nil, err
	}

	alert := &models.Alert{
		ID:         alertID,
		SensorID:   req.SensorID,
		AlertType:  req.AlertType,
		Message:    req.Message,
		IsActive:   true,
		Severity:   req.Severity,
		Value:      req.Value,
		Threshold:  req.Threshold,
		CreatedAt:  now,
		UpdatedAt:  now,
	}

	return alert, nil
}

// Update cập nhật trạng thái cảnh báo
func (s *AlertService) Update(alertID string, req models.UpdateAlertRequest) (*models.Alert, error) {
	// Check if alert exists
	existingAlert, err := s.GetDetail(alertID)
	if err != nil {
		return nil, err
	}
	if existingAlert == nil {
		return nil, sql.ErrNoRows
	}

	now := time.Now()
	query := `
		UPDATE alerts
		SET is_active = $1, updated_at = $2
		WHERE alert_id = $3
	`

	_, err = s.db.Exec(query, req.IsActive, now, alertID)
	if err != nil {
		log.Printf("Error updating alert: %v", err)
		return nil, err
	}

	// Get updated alert
	updatedAlert, err := s.GetDetail(alertID)
	return updatedAlert, err
}

// Delete xóa một cảnh báo
func (s *AlertService) Delete(alertID string) error {
	// Check if alert exists
	alert, err := s.GetDetail(alertID)
	if err != nil {
		return err
	}
	if alert == nil {
		return sql.ErrNoRows
	}

	query := `DELETE FROM alerts WHERE alert_id = $1`
	_, err = s.db.Exec(query, alertID)

	if err != nil {
		log.Printf("Error deleting alert: %v", err)
		return err
	}

	return nil
}

// BulkUpdateStatus cập nhật trạng thái nhiều cảnh báo
func (s *AlertService) BulkUpdateStatus(alertIds []string, isActive bool) (int, error) {
	if len(alertIds) == 0 {
		return 0, nil
	}

	now := time.Now()
	query := `
		UPDATE alerts
		SET is_active = $1, updated_at = $2
		WHERE alert_id = ANY($3::uuid[])
	`

	result, err := s.db.Exec(query, isActive, now, pq.Array(alertIds))
	if err != nil {
		log.Printf("Error bulk updating alerts: %v", err)
		return 0, err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		log.Printf("Error getting rows affected: %v", err)
		return 0, err
	}

	return int(rowsAffected), nil
}

// GetStatistics lấy thống kê cảnh báo
func (s *AlertService) GetStatistics() (*models.AlertStatistics, error) {
	stats := &models.AlertStatistics{
		AlertsByType: make(map[string]int),
	}

	// Get total and active/inactive counts
	query := `
		SELECT 
			COUNT(*) as total,
			SUM(CASE WHEN is_active = true THEN 1 ELSE 0 END) as active,
			SUM(CASE WHEN is_active = false THEN 1 ELSE 0 END) as inactive
		FROM alerts
	`

	var total, active, inactive sql.NullInt64
	err := s.db.QueryRow(query).Scan(&total, &active, &inactive)
	if err != nil && err != sql.ErrNoRows {
		log.Printf("Error getting alert statistics: %v", err)
		return nil, err
	}

	stats.TotalAlerts = int(total.Int64)
	stats.ActiveAlerts = int(active.Int64)
	stats.InactiveAlerts = int(inactive.Int64)

	// Get alerts by type
	typeQuery := `
		SELECT alert_type, COUNT(*) as count
		FROM alerts
		GROUP BY alert_type
	`

	rows, err := s.db.Query(typeQuery)
	if err != nil {
		log.Printf("Error querying alerts by type: %v", err)
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var alertType string
		var count int
		err := rows.Scan(&alertType, &count)
		if err != nil {
			log.Printf("Error scanning alert type: %v", err)
			continue
		}
		stats.AlertsByType[alertType] = count
	}

	return stats, nil
}

// CheckAndCreateAlert kiểm tra giá trị đo được với threshold và tạo alert nếu cần
// Hàm này tích hợp với ThresholdSettings và NotificationSettings
// CheckAndCreateAlert kiểm tra giá trị đo được với threshold và tạo alert nếu cần
// Hàm này tích hợp với ThresholdSettings và NotificationSettings
func (s *AlertService) CheckAndCreateAlert(payload models.AlertCheckPayload) (*models.AlertCreationResult, error) {
	result := &models.AlertCreationResult{
		AlertCreated: false,
	}

	// Lấy threshold settings
	thresholds, err := s.settingsService.GetThresholdSettings()
	if err != nil {
		log.Printf("Error getting threshold settings: %v", err)
		return result, err
	}

	var alertType, severity string
	var value, threshold float64
	var message string

	// Kiểm tra PM2.5
	if payload.PM25 != nil {
		value = *payload.PM25
		if value >= float64(thresholds.PM25Danger) {
			alertType = "high_pm25"
			severity = "danger"
			threshold = float64(thresholds.PM25Danger)
			message = fmt.Sprintf("PM2.5 đạt mức nguy hiểm: %.2f µg/m³", value)
		} else if value >= float64(thresholds.PM25Warning) {
			alertType = "high_pm25"
			severity = "warning"
			threshold = float64(thresholds.PM25Warning)
			message = fmt.Sprintf("PM2.5 vượt ngưỡng cảnh báo: %.2f µg/m³", value)
		}
	}

	// Kiểm tra PM10
	if payload.PM10 != nil && alertType == "" {
		value = *payload.PM10
		if value >= float64(thresholds.PM10Danger) {
			alertType = "high_pm10"
			severity = "danger"
			threshold = float64(thresholds.PM10Danger)
			message = fmt.Sprintf("PM10 đạt mức nguy hiểm: %.2f µg/m³", value)
		} else if value >= float64(thresholds.PM10Warning) {
			alertType = "high_pm10"
			severity = "warning"
			threshold = float64(thresholds.PM10Warning)
			message = fmt.Sprintf("PM10 vượt ngưỡng cảnh báo: %.2f µg/m³", value)
		}
	}

	// Kiểm tra AQI
	if payload.AQI != nil && alertType == "" {
		value = *payload.AQI
		if value >= float64(thresholds.AQIDanger) {
			alertType = "high_aqi"
			severity = "danger"
			threshold = float64(thresholds.AQIDanger)
			message = fmt.Sprintf("AQI đạt mức nguy hiểm: %.2f", value)
		} else if value >= float64(thresholds.AQIWarning) {
			alertType = "high_aqi"
			severity = "warning"
			threshold = float64(thresholds.AQIWarning)
			message = fmt.Sprintf("AQI vượt ngưỡng cảnh báo: %.2f", value)
		}
	}

	// Nếu không có cảnh báo nào được tạo
	if alertType == "" {
		result.Message = "Giá trị trong ngưỡng bình thường"
		return result, nil
	}

	// Tạo cảnh báo - FIX: Sử dụng SensorID thay vì SensorI
	createReq := models.CreateAlertRequest{
		SensorID:  payload.SensorID,  // FIX: Đã sửa từ SensorI -> SensorID
		AlertType: alertType,
		Message:   message,
		Severity:  severity,
		Value:     value,
		Threshold: threshold,
	}

	alert, err := s.Create(createReq)
	if err != nil {
		log.Printf("Error creating alert: %v", err)
		return result, err
	}

	result.AlertCreated = true
	result.Alert = alert
	result.Message = message

	// Gửi thông báo nếu cấu hình cho phép
	// Lấy danh sách users để gửi thông báo
	userIDs, err := s.getUsersForNotification(severity)
	if err == nil && len(userIDs) > 0 {
		s.sendNotificationsToUsers(userIDs, alert, message)
	}

	return result, nil
}

// getUsersForNotification lấy danh sách users nên nhận thông báo
func (s *AlertService) getUsersForNotification(severity string) ([]string, error) {
	query := `
		SELECT DISTINCT u.user_id
		FROM users u
		JOIN notification_settings ns ON u.user_id = ns.user_id
		WHERE 
			(ns.email_alerts = true AND ns.alert_threshold <= $1)
			OR (ns.push_notifications = true AND ns.alert_threshold <= $1)
	`

	// Map severity to threshold level (danger=150, warning=100)
	thresholdLevel := 100
	if severity == "danger" {
		thresholdLevel = 150
	}

	rows, err := s.db.Query(query, thresholdLevel)
	if err != nil {
		log.Printf("Error querying users for notification: %v", err)
		return nil, err
	}
	defer rows.Close()

	var userIDs []string
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			log.Printf("Error scanning user ID: %v", err)
			continue
		}
		userIDs = append(userIDs, userID)
	}

	return userIDs, nil
}

// sendNotificationsToUsers gửi thông báo email/push đến các users
func (s *AlertService) sendNotificationsToUsers(userIDs []string, alert *models.Alert, message string) {
	for _, userID := range userIDs {
		// Lấy notification settings của user
		notifSettings, err := s.settingsService.GetNotificationSettings(userID)
		if err != nil {
			log.Printf("Error getting notification settings for user %s: %v", userID, err)
			continue
		}

		// Lấy email của user
		var email string
		userQuery := `SELECT email FROM users WHERE user_id = $1`
		if err := s.db.QueryRow(userQuery, userID).Scan(&email); err != nil {
			log.Printf("Error getting user email: %v", err)
			continue
		}

		// Gửi email nếu được phép
		if notifSettings.EmailAlerts && email != "" {
			s.sendAlertEmail(email, alert, message)
		}

		// Gửi push notification nếu được phép
		if notifSettings.PushNotifications {
			// TODO: Implement push notification logic
			log.Printf("Push notification would be sent to user %s for alert %s", userID, alert.ID)
		}
	}
}

// sendAlertEmail gửi email cảnh báo
func (s *AlertService) sendAlertEmail(toEmail string, alert *models.Alert, message string) {
	// Lấy email settings
	emailSettings, err := s.settingsService.GetEmailSettings()
	if err != nil {
		log.Printf("Error getting email settings: %v", err)
		return
	}

	// Validate email settings
	if emailSettings.SMTPHost == "" || emailSettings.SMTPPort == 0 {
		log.Printf("Email settings not configured properly")
		return
	}

	subject := fmt.Sprintf("[%s] Air Quality Alert - %s", alert.Severity, alert.AlertType)
	body := fmt.Sprintf(
		"Alert Type: %s\nSeverity: %s\nMessage: %s\nValue: %.2f\nThreshold: %.2f\nTime: %s",
		alert.AlertType, alert.Severity, message, alert.Value, alert.Threshold, alert.CreatedAt.Format(time.RFC3339),
	)

	emailMessage := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\n\r\n%s", 
		emailSettings.FromEmail, toEmail, subject, body)

	smtpAddr := fmt.Sprintf("%s:%d", emailSettings.SMTPHost, emailSettings.SMTPPort)
	auth := smtp.PlainAuth("", emailSettings.SMTPUser, emailSettings.SMTPPassword, emailSettings.SMTPHost)

	if err := smtp.SendMail(smtpAddr, auth, emailSettings.FromEmail, []string{toEmail}, []byte(emailMessage)); err != nil {
		log.Printf("Failed to send alert email to %s: %v", toEmail, err)
		return
	}

	log.Printf("Alert email sent successfully to %s", toEmail)
}