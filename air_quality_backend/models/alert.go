package models

import "time"

type Alert struct {
	ID        string    `json:"id" db:"alert_id"`
	SensorID  string    `json:"sensorId" db:"sensor_id"`
	AlertType string    `json:"alert_type" db:"alert_type"`
	Message   string    `json:"message" db:"message"`
	IsActive  bool      `json:"is_active" db:"is_active"`
	Severity  string    `json:"severity" db:"severity"`
	Value     float64   `json:"value" db:"value"`
	Threshold float64   `json:"threshold" db:"threshold"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

type AlertResponse struct {
	Data       []Alert `json:"data"`
	NextCursor *string `json:"nextCursor"`
}

type UpdateAlertRequest struct {
	IsActive bool `json:"is_active"`
}

type BulkUpdateStatusRequest struct {
	AlertIds []string `json:"alertIds" binding:"required"`
	IsActive bool     `json:"is_active" binding:"required"`
}

type BulkUpdateStatusResponse struct {
	UpdatedCount int `json:"updatedCount"`
}

type AlertStatistics struct {
	TotalAlerts   int            `json:"totalAlerts"`
	ActiveAlerts  int            `json:"activeAlerts"`
	InactiveAlerts int           `json:"inactiveAlerts"`
	AlertsByType  map[string]int `json:"alertsByType"`
}

type CreateAlertRequest struct {
	SensorID  string  `json:"sensorId" binding:"required"`
	LocationID string `json:"locationId"`
	AlertType string  `json:"alert_type" binding:"required,oneof=high_pm25 high_pm10 high_aqi"`
	Message   string  `json:"message" binding:"required"`
	Severity  string  `json:"severity" binding:"required,oneof=warning danger"`
	Value     float64 `json:"value"`
	Threshold float64 `json:"threshold"`
}

// AlertCheckPayload là payload để kiểm tra và tạo alert từ data point
type AlertCheckPayload struct {
	SensorID   string
	LocationID string
	PM25       *float64
	PM10       *float64
	AQI        *float64
}

// AlertCreationResult chứa kết quả tạo alert
type AlertCreationResult struct {
	AlertCreated bool
	Alert        *Alert
	Message      string
}