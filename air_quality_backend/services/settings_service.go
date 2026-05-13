package services

import (
	"database/sql"
	"errors"
	"fmt"
	"net/smtp"
	"time"

	"air-quality-api/models"
	"github.com/google/uuid"
)

type SettingsService struct {
	db *sql.DB
}

func NewSettingsService(db *sql.DB) *SettingsService {
	return &SettingsService{db: db}
}

// ==================== InfluxDB Settings (per-user) ====================

func (s *SettingsService) GetInfluxSettings(userID string) (*models.InfluxSettings, error) {
	query := `
		SELECT setting_id, user_id, influx_url, influx_token,
		       influx_org, influx_bucket, measurement, created_at, updated_at
		FROM influx_settings WHERE user_id = $1`

	var st models.InfluxSettings
	err := s.db.QueryRow(query, userID).Scan(
		&st.SettingID, &st.UserID, &st.InfluxURL, &st.InfluxToken,
		&st.InfluxOrg, &st.InfluxBucket, &st.Measurement,
		&st.CreatedAt, &st.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil // chưa cấu hình
	}
	if err != nil {
		return nil, err
	}
	return &st, nil
}

// GetInfluxSettingsMasked trả về settings với token bị che — dùng cho GET API
func (s *SettingsService) GetInfluxSettingsMasked(userID string) (*models.InfluxSettings, error) {
	st, err := s.GetInfluxSettings(userID)
	if err != nil || st == nil {
		return st, err
	}
	masked := *st
	if len(masked.InfluxToken) > 8 {
		masked.InfluxToken = masked.InfluxToken[:4] + "••••••••" + masked.InfluxToken[len(masked.InfluxToken)-4:]
	} else {
		masked.InfluxToken = "••••••••"
	}
	return &masked, nil
}

func (s *SettingsService) UpsertInfluxSettings(userID string, req *models.InfluxSettingsInput) (*models.InfluxSettings, error) {
	now := time.Now()

	// Kiểm tra đã tồn tại chưa
	var exists bool
	s.db.QueryRow("SELECT EXISTS(SELECT 1 FROM influx_settings WHERE user_id = $1)", userID).Scan(&exists)

	var st models.InfluxSettings
	if !exists {
		st.SettingID = uuid.New().String()
		st.UserID = userID
		st.CreatedAt = now
		st.UpdatedAt = now

		_, err := s.db.Exec(`
			INSERT INTO influx_settings
			  (setting_id, user_id, influx_url, influx_token, influx_org, influx_bucket, measurement, created_at, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
			st.SettingID, userID, req.InfluxURL, req.InfluxToken,
			req.InfluxOrg, req.InfluxBucket, req.Measurement, now, now,
		)
		if err != nil {
			return nil, err
		}
	} else {
		err := s.db.QueryRow(`
			UPDATE influx_settings
			SET influx_url=$1, influx_token=$2, influx_org=$3,
			    influx_bucket=$4, measurement=$5, updated_at=$6
			WHERE user_id=$7
			RETURNING setting_id, user_id, influx_url, influx_token,
			          influx_org, influx_bucket, measurement, created_at, updated_at`,
			req.InfluxURL, req.InfluxToken, req.InfluxOrg,
			req.InfluxBucket, req.Measurement, now, userID,
		).Scan(
			&st.SettingID, &st.UserID, &st.InfluxURL, &st.InfluxToken,
			&st.InfluxOrg, &st.InfluxBucket, &st.Measurement,
			&st.CreatedAt, &st.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
	}

	// Trả về masked
	masked := st
	masked.InfluxToken = "••••••••"
	return &masked, nil
}

func (s *SettingsService) DeleteInfluxSettings(userID string) error {
	_, err := s.db.Exec("DELETE FROM influx_settings WHERE user_id = $1", userID)
	return err
}

// ==================== General Settings ====================

func (s *SettingsService) GetGeneralSettings() (*models.GeneralSettings, error) {
	query := `SELECT setting_id, site_name, default_timezone, default_language, date_format, created_at, updated_at FROM general_settings LIMIT 1`
	var settings models.GeneralSettings
	if err := s.db.QueryRow(query).Scan(
		&settings.SettingID, &settings.SiteName, &settings.DefaultTimezone,
		&settings.DefaultLanguage, &settings.DateFormat,
		&settings.CreatedAt, &settings.UpdatedAt,
	); err != nil {
		if err == sql.ErrNoRows {
			return &models.GeneralSettings{
				SettingID:       uuid.New().String(),
				SiteName:        "Hệ thống giám sát bụi",
				DefaultTimezone: "Asia/Ho_Chi_Minh",
				DefaultLanguage: "vi",
				DateFormat:      "DD/MM/YYYY",
			}, nil
		}
		return nil, err
	}
	return &settings, nil
}

func (s *SettingsService) UpdateGeneralSettings(req *models.GeneralSettingsInput) (*models.GeneralSettings, error) {
	var exists bool
	s.db.QueryRow("SELECT EXISTS(SELECT 1 FROM general_settings)").Scan(&exists)
	var settings models.GeneralSettings
	if !exists {
		settings.SettingID = uuid.New().String()
		now := time.Now()
		_, err := s.db.Exec(
			`INSERT INTO general_settings (setting_id, site_name, default_timezone, default_language, date_format, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
			settings.SettingID, req.SiteName, req.DefaultTimezone, req.DefaultLanguage, req.DateFormat, now, now,
		)
		if err != nil {
			return nil, err
		}
		settings.SiteName = req.SiteName
		settings.DefaultTimezone = req.DefaultTimezone
		settings.DefaultLanguage = req.DefaultLanguage
		settings.DateFormat = req.DateFormat
		settings.CreatedAt = now
		settings.UpdatedAt = now
	} else {
		err := s.db.QueryRow(
			`UPDATE general_settings SET site_name=$1, default_timezone=$2, default_language=$3, date_format=$4, updated_at=$5 RETURNING setting_id, site_name, default_timezone, default_language, date_format, created_at, updated_at`,
			req.SiteName, req.DefaultTimezone, req.DefaultLanguage, req.DateFormat, time.Now(),
		).Scan(
			&settings.SettingID, &settings.SiteName, &settings.DefaultTimezone,
			&settings.DefaultLanguage, &settings.DateFormat,
			&settings.CreatedAt, &settings.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
	}
	return &settings, nil
}

// ==================== Notification Settings ====================

func (s *SettingsService) GetNotificationSettings(userID string) (*models.NotificationSettings, error) {
	var settings models.NotificationSettings
	err := s.db.QueryRow(
		`SELECT setting_id, user_id, email_alerts, sms_alerts, push_notifications, alert_threshold, created_at, updated_at FROM notification_settings WHERE user_id = $1`,
		userID,
	).Scan(
		&settings.SettingID, &settings.UserID, &settings.EmailAlerts,
		&settings.SMSAlerts, &settings.PushNotifications, &settings.AlertThreshold,
		&settings.CreatedAt, &settings.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return &models.NotificationSettings{
			SettingID: uuid.New().String(), UserID: userID,
			EmailAlerts: true, PushNotifications: true, AlertThreshold: 100,
		}, nil
	}
	return &settings, err
}

func (s *SettingsService) UpdateNotificationSettings(userID string, req *models.NotificationSettingsInput) (*models.NotificationSettings, error) {
	var exists bool
	s.db.QueryRow("SELECT EXISTS(SELECT 1 FROM notification_settings WHERE user_id = $1)", userID).Scan(&exists)
	var settings models.NotificationSettings
	settings.UserID = userID
	now := time.Now()
	if !exists {
		settings.SettingID = uuid.New().String()
		_, err := s.db.Exec(
			`INSERT INTO notification_settings (setting_id, user_id, email_alerts, sms_alerts, push_notifications, alert_threshold, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
			settings.SettingID, userID, req.EmailAlerts, req.SMSAlerts, req.PushNotifications, req.AlertThreshold, now, now,
		)
		if err != nil {
			return nil, err
		}
		settings.EmailAlerts = req.EmailAlerts
		settings.SMSAlerts = req.SMSAlerts
		settings.PushNotifications = req.PushNotifications
		settings.AlertThreshold = req.AlertThreshold
		settings.CreatedAt = now
		settings.UpdatedAt = now
	} else {
		err := s.db.QueryRow(
			`UPDATE notification_settings SET email_alerts=$1, sms_alerts=$2, push_notifications=$3, alert_threshold=$4, updated_at=$5 WHERE user_id=$6 RETURNING setting_id, user_id, email_alerts, sms_alerts, push_notifications, alert_threshold, created_at, updated_at`,
			req.EmailAlerts, req.SMSAlerts, req.PushNotifications, req.AlertThreshold, now, userID,
		).Scan(
			&settings.SettingID, &settings.UserID, &settings.EmailAlerts,
			&settings.SMSAlerts, &settings.PushNotifications, &settings.AlertThreshold,
			&settings.CreatedAt, &settings.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
	}
	return &settings, nil
}

// ==================== Threshold Settings ====================

func (s *SettingsService) GetThresholdSettings() (*models.ThresholdSettings, error) {
	var settings models.ThresholdSettings
	err := s.db.QueryRow(
		`SELECT setting_id, pm25_warning, pm25_danger, pm10_warning, pm10_danger, aqi_warning, aqi_danger, created_at, updated_at FROM threshold_settings LIMIT 1`,
	).Scan(
		&settings.SettingID, &settings.PM25Warning, &settings.PM25Danger,
		&settings.PM10Warning, &settings.PM10Danger,
		&settings.AQIWarning, &settings.AQIDanger,
		&settings.CreatedAt, &settings.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return &models.ThresholdSettings{
			SettingID: uuid.New().String(),
			PM25Warning: 35, PM25Danger: 55,
			PM10Warning: 50, PM10Danger: 100,
			AQIWarning: 100, AQIDanger: 150,
		}, nil
	}
	return &settings, err
}

func (s *SettingsService) UpdateThresholdSettings(req *models.ThresholdSettingsInput) (*models.ThresholdSettings, error) {
	var exists bool
	s.db.QueryRow("SELECT EXISTS(SELECT 1 FROM threshold_settings)").Scan(&exists)
	var settings models.ThresholdSettings
	now := time.Now()
	if !exists {
		settings.SettingID = uuid.New().String()
		_, err := s.db.Exec(
			`INSERT INTO threshold_settings (setting_id, pm25_warning, pm25_danger, pm10_warning, pm10_danger, aqi_warning, aqi_danger, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
			settings.SettingID, req.PM25Warning, req.PM25Danger, req.PM10Warning, req.PM10Danger, req.AQIWarning, req.AQIDanger, now, now,
		)
		if err != nil {
			return nil, err
		}
		settings.PM25Warning = req.PM25Warning
		settings.PM25Danger = req.PM25Danger
		settings.PM10Warning = req.PM10Warning
		settings.PM10Danger = req.PM10Danger
		settings.AQIWarning = req.AQIWarning
		settings.AQIDanger = req.AQIDanger
	} else {
		err := s.db.QueryRow(
			`UPDATE threshold_settings SET pm25_warning=$1, pm25_danger=$2, pm10_warning=$3, pm10_danger=$4, aqi_warning=$5, aqi_danger=$6, updated_at=$7 RETURNING setting_id, pm25_warning, pm25_danger, pm10_warning, pm10_danger, aqi_warning, aqi_danger, created_at, updated_at`,
			req.PM25Warning, req.PM25Danger, req.PM10Warning, req.PM10Danger, req.AQIWarning, req.AQIDanger, now,
		).Scan(
			&settings.SettingID, &settings.PM25Warning, &settings.PM25Danger,
			&settings.PM10Warning, &settings.PM10Danger,
			&settings.AQIWarning, &settings.AQIDanger,
			&settings.CreatedAt, &settings.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
	}
	return &settings, nil
}

// ==================== Email Settings ====================

func (s *SettingsService) GetEmailSettings() (*models.EmailSettings, error) {
	var settings models.EmailSettings
	err := s.db.QueryRow(
		`SELECT setting_id, smtp_host, smtp_port, smtp_user, smtp_password, from_email, created_at, updated_at FROM email_settings LIMIT 1`,
	).Scan(
		&settings.SettingID, &settings.SMTPHost, &settings.SMTPPort,
		&settings.SMTPUser, &settings.SMTPPassword, &settings.FromEmail,
		&settings.CreatedAt, &settings.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, errors.New("email settings not configured")
	}
	if err != nil {
		return nil, err
	}
	settings.SMTPPassword = "••••••••"
	return &settings, nil
}

func (s *SettingsService) UpdateEmailSettings(req *models.EmailSettingsInput) (*models.EmailSettings, error) {
	var exists bool
	s.db.QueryRow("SELECT EXISTS(SELECT 1 FROM email_settings)").Scan(&exists)
	var settings models.EmailSettings
	now := time.Now()
	if !exists {
		settings.SettingID = uuid.New().String()
		_, err := s.db.Exec(
			`INSERT INTO email_settings (setting_id, smtp_host, smtp_port, smtp_user, smtp_password, from_email, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
			settings.SettingID, req.SMTPHost, req.SMTPPort, req.SMTPUser, req.SMTPPassword, req.FromEmail, now, now,
		)
		if err != nil {
			return nil, err
		}
		settings.SMTPHost = req.SMTPHost
		settings.SMTPPort = req.SMTPPort
		settings.SMTPUser = req.SMTPUser
		settings.FromEmail = req.FromEmail
	} else {
		err := s.db.QueryRow(
			`UPDATE email_settings SET smtp_host=$1, smtp_port=$2, smtp_user=$3, smtp_password=$4, from_email=$5, updated_at=$6 RETURNING setting_id, smtp_host, smtp_port, smtp_user, smtp_password, from_email, created_at, updated_at`,
			req.SMTPHost, req.SMTPPort, req.SMTPUser, req.SMTPPassword, req.FromEmail, now,
		).Scan(
			&settings.SettingID, &settings.SMTPHost, &settings.SMTPPort,
			&settings.SMTPUser, &settings.SMTPPassword, &settings.FromEmail,
			&settings.CreatedAt, &settings.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
	}
	settings.SMTPPassword = "••••••••"
	return &settings, nil
}

func (s *SettingsService) SendTestEmail(toEmail string) error {
	var host, user, password, fromEmail string
	var port int
	if err := s.db.QueryRow(
		`SELECT smtp_host, smtp_port, smtp_user, smtp_password, from_email FROM email_settings LIMIT 1`,
	).Scan(&host, &port, &user, &password, &fromEmail); err != nil {
		if err == sql.ErrNoRows {
			return errors.New("email settings not configured")
		}
		return err
	}
	if host == "" || port == 0 {
		return errors.New("incomplete email settings")
	}
	if toEmail == "" {
		toEmail = fromEmail
	}
	msg := fmt.Sprintf(
		"From: %s\r\nTo: %s\r\nSubject: Test Email - Air Quality System\r\n\r\nTest email sent at %s",
		fromEmail, toEmail, time.Now().Format("02/01/2006 15:04:05"),
	)
	auth := smtp.PlainAuth("", user, password, host)
	return smtp.SendMail(fmt.Sprintf("%s:%d", host, port), auth, fromEmail, []string{toEmail}, []byte(msg))
}
