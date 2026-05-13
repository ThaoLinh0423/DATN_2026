package models

import "time"

type Sensor struct {
	SensorID   string    `json:"sensorId"`
	Name       string    `json:"name"`
	DeviceID   string    `json:"deviceId"`
	TopicPath  string    `json:"topicPath"`
	CustomerID string    `json:"customerId"`
	Location   Location  `json:"location"`
	OwnerID    string    `json:"ownerId"`
	Type       string    `json:"type"`
	Status     string    `json:"status"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

type Location struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

type SensorInput struct {
	Name       string   `json:"name"       binding:"required"`
	DeviceID   string   `json:"deviceId"   binding:"required"`
	TopicPath  string   `json:"topicPath"  binding:"required"`
	CustomerID string   `json:"customerId" binding:"required"`
	Location   Location `json:"location"   binding:"required"`
	Type       string   `json:"type"       binding:"required,oneof=iot external_station"`
}

type SensorListResponse struct {
	Data       []Sensor `json:"data"`
	NextCursor *string  `json:"nextCursor"`
}

// ==================== Sensor Access ====================

// SensorAccess lưu quan hệ user ↔ sensor (user nào được theo dõi sensor nào).
// admin và manager không cần có bản ghi này — họ thấy tất cả.
// Chỉ user thông thường mới bị giới hạn bởi bảng này.
type SensorAccess struct {
	ID        string    `json:"id"`
	SensorID  string    `json:"sensorId"`
	UserID    string    `json:"userId"`
	UserEmail string    `json:"userEmail,omitempty"` // join từ users khi cần
	GrantedBy string    `json:"grantedBy"`
	CreatedAt time.Time `json:"createdAt"`
}

type SensorAccessListResponse struct {
	Data  []SensorAccess `json:"data"`
	Total int            `json:"total"`
}

// GrantAccessRequest dùng cho POST /sensors/:sensorId/access
type GrantAccessRequest struct {
	UserID string `json:"userId" binding:"required"`
}

// RevokeAccessRequest dùng cho DELETE /sensors/:sensorId/access/:userId (path param)
// — không cần body, userId lấy từ URL
