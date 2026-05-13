package database

import (
	"database/sql"
	"log"
	"time"

	"air-quality-api/utils"
	"github.com/google/uuid"
)

func RunMigrations(db *sql.DB) error {
	createQueries := []string{
		`CREATE TABLE IF NOT EXISTS users (
			user_id UUID PRIMARY KEY,
			email VARCHAR(255) UNIQUE NOT NULL,
			password VARCHAR(255) NOT NULL,
			name VARCHAR(255),
			phone VARCHAR(255),
			role VARCHAR(50) NOT NULL DEFAULT 'user',
			timezone VARCHAR(100) NOT NULL,
			notification_preferences JSONB,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE TABLE IF NOT EXISTS sensors (
			sensor_id UUID PRIMARY KEY,
			name VARCHAR(255) NOT NULL,
			device_id VARCHAR(255) UNIQUE,
			topic_path VARCHAR(500),
			customer_id VARCHAR(255),
			latitude FLOAT NOT NULL,
			longitude FLOAT NOT NULL,
			owner_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
			type VARCHAR(50) NOT NULL,
			status VARCHAR(50) NOT NULL DEFAULT 'active',
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE TABLE IF NOT EXISTS data_points (
			data_point_id UUID PRIMARY KEY,
			sensor_id UUID NOT NULL REFERENCES sensors(sensor_id) ON DELETE CASCADE,
			timestamp TIMESTAMP NOT NULL,
			pm1_0 FLOAT,
			pm2_5 FLOAT,
			pm10 FLOAT,
			temperature FLOAT,
			humidity FLOAT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE TABLE IF NOT EXISTS alerts (
			alert_id UUID PRIMARY KEY,
			sensor_id UUID NOT NULL REFERENCES sensors(sensor_id) ON DELETE CASCADE,
			alert_type VARCHAR(50) NOT NULL,
			message TEXT NOT NULL,
			is_active BOOLEAN NOT NULL DEFAULT TRUE,
			severity VARCHAR(50) NOT NULL DEFAULT 'warning',
			value FLOAT,
			threshold FLOAT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE TABLE IF NOT EXISTS general_settings (
			setting_id UUID PRIMARY KEY,
			site_name VARCHAR(255) NOT NULL DEFAULT 'Hệ thống giám sát bụi',
			default_timezone VARCHAR(100) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
			default_language VARCHAR(10) NOT NULL DEFAULT 'vi',
			date_format VARCHAR(20) NOT NULL DEFAULT 'DD/MM/YYYY',
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE TABLE IF NOT EXISTS notification_settings (
			setting_id UUID PRIMARY KEY,
			user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
			email_alerts BOOLEAN DEFAULT TRUE,
			sms_alerts BOOLEAN DEFAULT FALSE,
			push_notifications BOOLEAN DEFAULT TRUE,
			alert_threshold INTEGER DEFAULT 100,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_id)
		)`,

		`CREATE TABLE IF NOT EXISTS threshold_settings (
			setting_id UUID PRIMARY KEY,
			pm25_warning INTEGER DEFAULT 35,
			pm25_danger INTEGER DEFAULT 55,
			pm10_warning INTEGER DEFAULT 50,
			pm10_danger INTEGER DEFAULT 100,
			aqi_warning INTEGER DEFAULT 100,
			aqi_danger INTEGER DEFAULT 150,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE TABLE IF NOT EXISTS email_settings (
			setting_id UUID PRIMARY KEY,
			smtp_host VARCHAR(255) NOT NULL,
			smtp_port INTEGER NOT NULL,
			smtp_user VARCHAR(255) NOT NULL,
			smtp_password VARCHAR(255) NOT NULL,
			from_email VARCHAR(255),
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE TABLE IF NOT EXISTS user_sessions (
			session_id UUID PRIMARY KEY,
			user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
			access_token VARCHAR(500),
			refresh_token VARCHAR(500),
			device_info VARCHAR(255),
			ip_address VARCHAR(45),
			last_activity TIMESTAMP,
			expires_at TIMESTAMP NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,

		`CREATE TABLE IF NOT EXISTS influx_settings (
			setting_id UUID PRIMARY KEY,
			user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
			influx_url VARCHAR(500) NOT NULL,
			influx_token TEXT NOT NULL,
			influx_org VARCHAR(255) NOT NULL,
			influx_bucket VARCHAR(255) NOT NULL,
			measurement VARCHAR(255) NOT NULL DEFAULT 'sensor_data',
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_id)
		)`,

		// Phân quyền user ↔ sensor:
		// - admin và manager thấy tất cả sensor (không cần bản ghi ở đây)
		// - user thông thường chỉ thấy sensor được grant access
		`CREATE TABLE IF NOT EXISTS sensor_access (
			id UUID PRIMARY KEY,
			sensor_id UUID NOT NULL REFERENCES sensors(sensor_id) ON DELETE CASCADE,
			user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
			granted_by UUID NOT NULL REFERENCES users(user_id),
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(sensor_id, user_id)
		)`,

		`CREATE INDEX IF NOT EXISTS idx_sensors_owner_id ON sensors(owner_id)`,
		`CREATE INDEX IF NOT EXISTS idx_sensors_customer_id ON sensors(customer_id)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_sensors_device_id ON sensors(device_id)`,
		`CREATE INDEX IF NOT EXISTS idx_data_points_sensor_id ON data_points(sensor_id)`,
		`CREATE INDEX IF NOT EXISTS idx_data_points_timestamp ON data_points(timestamp)`,
		`CREATE INDEX IF NOT EXISTS idx_alerts_sensor_id ON alerts(sensor_id)`,
		`CREATE INDEX IF NOT EXISTS idx_alerts_is_active ON alerts(is_active)`,
		`CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_notification_settings_user_id ON notification_settings(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at)`,
		`CREATE INDEX IF NOT EXISTS idx_influx_settings_user_id ON influx_settings(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_sensor_access_sensor_id ON sensor_access(sensor_id)`,
		`CREATE INDEX IF NOT EXISTS idx_sensor_access_user_id ON sensor_access(user_id)`,
	}

	for _, query := range createQueries {
		if _, err := db.Exec(query); err != nil {
			log.Printf("Migration error: %v", err)
			return err
		}
	}

	alterQueries := []string{
		`ALTER TABLE sensors ADD COLUMN IF NOT EXISTS device_id VARCHAR(255)`,
		`ALTER TABLE sensors ADD COLUMN IF NOT EXISTS topic_path VARCHAR(500)`,
		`ALTER TABLE sensors ADD COLUMN IF NOT EXISTS customer_id VARCHAR(255)`,
	}
	for _, query := range alterQueries {
		if _, err := db.Exec(query); err != nil {
			log.Printf("Migration alter warning: %v", err)
		}
	}

	log.Println("Migrations completed successfully")
	return nil
}

// SeedAdminUser tạo tài khoản admin mặc định nếu chưa tồn tại.
// Idempotent — an toàn khi gọi nhiều lần.
func SeedAdminUser(db *sql.DB, email, password string) error {
	if email == "" || password == "" {
		log.Println("[SEED] ADMIN_EMAIL hoặc ADMIN_PASSWORD chưa set — bỏ qua seed admin")
		return nil
	}

	var exists bool
	if err := db.QueryRow(`SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)`, email).Scan(&exists); err != nil {
		return err
	}
	if exists {
		log.Printf("[SEED] Admin '%s' đã tồn tại — bỏ qua", email)
		return nil
	}

	hashedPassword, err := utils.HashPassword(password)
	if err != nil {
		return err
	}

	adminID := uuid.New().String()
	now := time.Now()
	_, err = db.Exec(
		`INSERT INTO users (user_id, email, password, name, role, timezone, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		adminID, email, hashedPassword, "Administrator", "admin",
		"Asia/Ho_Chi_Minh", now, now,
	)
	if err != nil {
		return err
	}

	log.Printf("[SEED] Admin mặc định tạo thành công: email=%s id=%s", email, adminID)
	return nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
