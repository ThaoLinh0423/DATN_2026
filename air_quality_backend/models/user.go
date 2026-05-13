package models

import "time"

type User struct {
	UserID    string    `json:"userId"`
	Email     string    `json:"email"`
	Password  string    `json:"-"`
	Name      string    `json:"name"`
	Phone     string    `json:"phone"`
	Role      string    `json:"role"`
	Timezone  string    `json:"timezone"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type UserRegisterRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8"`
	Timezone string `json:"timezone" binding:"required"`
}

type UserLoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type UserUpdateRequest struct {
	Name  string `json:"name"`
	Email string `json:"email" binding:"omitempty,email"`
	Phone string `json:"phone"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"currentPassword" binding:"required"`
	NewPassword     string `json:"newPassword" binding:"required,min=8"`
}

type TokenResponse struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken,omitempty"`
	TokenType    string `json:"tokenType"`
	ExpiresIn    int    `json:"expiresIn"`
}

type UserSession struct {
	SessionID    string `json:"sessionId"`
	UserID       string `json:"userId"`
	DeviceInfo   string `json:"deviceInfo"`
	IPAddress    string `json:"ipAddress"`
	LastActivity string `json:"lastActivity"`
	ExpiresAt    string `json:"expiresAt"`
	CreatedAt    string `json:"createdAt"`
}

// ==================== InfluxDB Settings (per-user) ====================

// InfluxSettings lưu cấu hình InfluxDB Cloud của từng user
type InfluxSettings struct {
	SettingID   string    `json:"settingId"`
	UserID      string    `json:"userId"`
	InfluxURL   string    `json:"influxUrl"`
	InfluxToken string    `json:"influxToken"` // masked khi GET
	InfluxOrg   string    `json:"influxOrg"`
	InfluxBucket string   `json:"influxBucket"`
	Measurement string    `json:"measurement"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type InfluxSettingsInput struct {
	InfluxURL    string `json:"influxUrl"    binding:"required"`
	InfluxToken  string `json:"influxToken"  binding:"required"`
	InfluxOrg    string `json:"influxOrg"    binding:"required"`
	InfluxBucket string `json:"influxBucket" binding:"required"`
	Measurement  string `json:"measurement"  binding:"required"`
}

// InfluxDevice là một device_id được discover từ InfluxDB
type InfluxDevice struct {
	DeviceID string `json:"deviceId"`
	Location string `json:"location,omitempty"`
}

// InfluxDiscoverResponse kết quả discover devices từ InfluxDB
type InfluxDiscoverResponse struct {
	Devices     []InfluxDevice `json:"devices"`
	Bucket      string         `json:"bucket"`
	Measurement string         `json:"measurement"`
	Total       int            `json:"total"`
}

// ==================== System Settings ====================

type GeneralSettings struct {
	SettingID       string    `json:"settingId"`
	SiteName        string    `json:"siteName"`
	DefaultTimezone string    `json:"defaultTimezone"`
	DefaultLanguage string    `json:"defaultLanguage"`
	DateFormat      string    `json:"dateFormat"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

type GeneralSettingsInput struct {
	SiteName        string `json:"siteName"`
	DefaultTimezone string `json:"defaultTimezone"`
	DefaultLanguage string `json:"defaultLanguage"`
	DateFormat      string `json:"dateFormat"`
}

type NotificationSettings struct {
	SettingID         string    `json:"settingId"`
	UserID            string    `json:"userId"`
	EmailAlerts       bool      `json:"emailAlerts"`
	SMSAlerts         bool      `json:"smsAlerts"`
	PushNotifications bool      `json:"pushNotifications"`
	AlertThreshold    int       `json:"alertThreshold"`
	CreatedAt         time.Time `json:"createdAt"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

type NotificationSettingsInput struct {
	EmailAlerts       bool `json:"emailAlerts"`
	SMSAlerts         bool `json:"smsAlerts"`
	PushNotifications bool `json:"pushNotifications"`
	AlertThreshold    int  `json:"alertThreshold"`
}

type ThresholdSettings struct {
	SettingID   string    `json:"settingId"`
	PM25Warning int       `json:"pm25Warning"`
	PM25Danger  int       `json:"pm25Danger"`
	PM10Warning int       `json:"pm10Warning"`
	PM10Danger  int       `json:"pm10Danger"`
	AQIWarning  int       `json:"aqiWarning"`
	AQIDanger   int       `json:"aqiDanger"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type ThresholdSettingsInput struct {
	PM25Warning int `json:"pm25Warning"`
	PM25Danger  int `json:"pm25Danger"`
	PM10Warning int `json:"pm10Warning"`
	PM10Danger  int `json:"pm10Danger"`
	AQIWarning  int `json:"aqiWarning"`
	AQIDanger   int `json:"aqiDanger"`
}

type EmailSettings struct {
	SettingID    string    `json:"settingId"`
	SMTPHost     string    `json:"smtpHost"`
	SMTPPort     int       `json:"smtpPort"`
	SMTPUser     string    `json:"smtpUser"`
	SMTPPassword string    `json:"smtpPassword"`
	FromEmail    string    `json:"fromEmail"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type EmailSettingsInput struct {
	SMTPHost     string `json:"smtpHost"     binding:"required"`
	SMTPPort     int    `json:"smtpPort"     binding:"required,min=1"`
	SMTPUser     string `json:"smtpUser"     binding:"required"`
	SMTPPassword string `json:"smtpPassword" binding:"required"`
	FromEmail    string `json:"fromEmail"    binding:"required,email"`
}
