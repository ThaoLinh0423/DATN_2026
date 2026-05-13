package models

import "time"

// AdminUserListResponse trả về danh sách users với phân trang
type AdminUserListResponse struct {
	Data       []AdminUser `json:"data"`
	NextCursor *string     `json:"nextCursor"`
	Total      int         `json:"total"`
}

// AdminUser là view đầy đủ của user dành cho admin
type AdminUser struct {
	UserID    string    `json:"userId"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Phone     string    `json:"phone"`
	Role      string    `json:"role"`
	Timezone  string    `json:"timezone"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// SensorInfo chứa thông tin cơ bản của sensor cho AdminUserDetail
type SensorInfo struct {
	SensorID string `json:"sensorId"`
	Name     string `json:"name"`
}

// AdminUserDetail là chi tiết user kèm danh sách sensors có quyền truy cập
type AdminUserDetail struct {
	AdminUser
	Sensors []SensorInfo `json:"sensors"`
}

// UpdateRoleRequest dùng cho PATCH /admin/users/:userId/role
type UpdateRoleRequest struct {
	Role string `json:"role" binding:"required,oneof=admin manager user"`
}
