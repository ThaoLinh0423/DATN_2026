package handlers

import (
	"net/http"
	"strconv"

	"air-quality-api/models"
	"air-quality-api/services"
	"github.com/gin-gonic/gin"
)

type AdminHandler struct {
	adminService *services.AdminService
}

func NewAdminHandler(adminService *services.AdminService) *AdminHandler {
	return &AdminHandler{adminService: adminService}
}

// ListUsers GET /admin/users
func (h *AdminHandler) ListUsers(c *gin.Context) {
	role := c.DefaultQuery("role", "all")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	cursor := c.Query("cursor")

	users, nextCursor, total, err := h.adminService.ListUsers(role, limit, cursor)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "INTERNAL_ERROR", Message: err.Error()},
		})
		return
	}

	if users == nil {
		users = []models.AdminUser{}
	}

	c.JSON(http.StatusOK, models.AdminUserListResponse{
		Data:       users,
		NextCursor: nextCursor,
		Total:      total,
	})
}

// GetUser GET /admin/users/:userId
func (h *AdminHandler) GetUser(c *gin.Context) {
	targetID := c.Param("userId")

	user, err := h.adminService.GetUserDetail(targetID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "INTERNAL_ERROR", Message: err.Error()},
		})
		return
	}
	if user == nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "NOT_FOUND", Message: "User không tồn tại"},
		})
		return
	}

	c.JSON(http.StatusOK, user)
}

// UpdateRole PATCH /admin/users/:userId/role
func (h *AdminHandler) UpdateRole(c *gin.Context) {
	adminID, _ := c.Get("userID")
	targetID := c.Param("userId")

	var req models.UpdateRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error: models.ErrorDetail{
				Code:    "VALIDATION_ERROR",
				Message: "role phải là một trong: admin, manager, user",
			},
		})
		return
	}

	user, err := h.adminService.UpdateRole(adminID.(string), targetID, req.Role)
	if err != nil {
		// Lỗi tự hạ quyền chính mình
		if err.Error() == "không thể thay đổi role của chính mình" {
			c.JSON(http.StatusForbidden, models.ErrorResponse{
				Error: models.ErrorDetail{Code: "FORBIDDEN", Message: err.Error()},
			})
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "INTERNAL_ERROR", Message: err.Error()},
		})
		return
	}
	if user == nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "NOT_FOUND", Message: "User không tồn tại"},
		})
		return
	}

	c.JSON(http.StatusOK, user)
}
