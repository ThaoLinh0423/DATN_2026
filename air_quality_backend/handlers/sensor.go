package handlers

import (
	"net/http"
	"strconv"

	"air-quality-api/models"
	"air-quality-api/services"
	"github.com/gin-gonic/gin"
)

type SensorHandler struct {
	sensorService *services.SensorService
	poller        *services.RealtimePoller
}

func NewSensorHandler(sensorService *services.SensorService, poller *services.RealtimePoller) *SensorHandler {
	return &SensorHandler{sensorService: sensorService, poller: poller}
}

// GetList GET /sensors
// Hành vi phụ thuộc vào auth (OptionalJWTMiddleware):
//   - Không có token / token sai → tất cả sensor (public)
//   - role admin/manager         → tất cả sensor
//   - role user                  → chỉ sensor đã được grant access
func (h *SensorHandler) GetList(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	cursor := c.Query("cursor")

	callerID, _ := c.Get("userID")
	callerRole, _ := c.Get("userRole")
	callerIDStr, _ := callerID.(string)
	callerRoleStr, _ := callerRole.(string)

	sensors, nextCursor, err := h.sensorService.GetList(callerIDStr, callerRoleStr, limit, cursor)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "INTERNAL_ERROR", Message: err.Error()},
		})
		return
	}
	if sensors == nil {
		sensors = []models.Sensor{}
	}
	c.JSON(http.StatusOK, models.SensorListResponse{Data: sensors, NextCursor: nextCursor})
}

// Create POST /sensors (admin/manager only)
func (h *SensorHandler) Create(c *gin.Context) {
	userID, _ := c.Get("userID")

	var req models.SensorInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "VALIDATION_ERROR", Message: "Invalid input"},
		})
		return
	}

	sensor, err := h.sensorService.Create(userID.(string), req)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "CREATION_ERROR", Message: err.Error()},
		})
		return
	}

	if h.poller != nil {
		h.poller.AddSensor(sensor.DeviceID, sensor.SensorID)
	}

	c.JSON(http.StatusCreated, sensor)
}

// Delete DELETE /sensors/:sensorId (admin/manager only)
func (h *SensorHandler) Delete(c *gin.Context) {
	sensorID := c.Param("sensorId")

	deviceID, err := h.sensorService.Delete(sensorID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "INTERNAL_ERROR", Message: err.Error()},
		})
		return
	}
	if deviceID == "" {
		// Delete trả về "" khi sensor không tồn tại
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "NOT_FOUND", Message: "Sensor không tồn tại"},
		})
		return
	}

	// Dừng poll sensor đã xóa ngay lập tức
	if h.poller != nil && deviceID != "" {
		h.poller.RemoveSensor(deviceID)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Sensor đã được xóa", "sensorId": sensorID})
}

// ==================== Access Management ====================

// GetAccessList GET /sensors/:sensorId/access (admin/manager only)
func (h *SensorHandler) GetAccessList(c *gin.Context) {
	sensorID := c.Param("sensorId")

	// Kiểm tra sensor tồn tại
	sensor, err := h.sensorService.GetByID(sensorID)
	if err != nil || sensor == nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "NOT_FOUND", Message: "Sensor không tồn tại"},
		})
		return
	}

	list, err := h.sensorService.GetAccessList(sensorID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "INTERNAL_ERROR", Message: err.Error()},
		})
		return
	}
	if list == nil {
		list = []models.SensorAccess{}
	}
	c.JSON(http.StatusOK, models.SensorAccessListResponse{Data: list, Total: len(list)})
}

// GrantAccess POST /sensors/:sensorId/access (admin/manager only)
func (h *SensorHandler) GrantAccess(c *gin.Context) {
	sensorID := c.Param("sensorId")
	grantedBy, _ := c.Get("userID")

	var req models.GrantAccessRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "VALIDATION_ERROR", Message: "userId là bắt buộc"},
		})
		return
	}

	access, err := h.sensorService.GrantAccess(sensorID, req.UserID, grantedBy.(string))
	if err != nil {
		status := http.StatusInternalServerError
		code := "INTERNAL_ERROR"
		if err.Error() == "user not found" {
			status = http.StatusBadRequest
			code = "USER_NOT_FOUND"
		}
		c.JSON(status, models.ErrorResponse{
			Error: models.ErrorDetail{Code: code, Message: err.Error()},
		})
		return
	}
	if access == nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "NOT_FOUND", Message: "Sensor không tồn tại"},
		})
		return
	}

	c.JSON(http.StatusOK, access)
}

// RevokeAccess DELETE /sensors/:sensorId/access/:userId (admin/manager only)
func (h *SensorHandler) RevokeAccess(c *gin.Context) {
	sensorID := c.Param("sensorId")
	targetUserID := c.Param("userId")

	deleted, err := h.sensorService.RevokeAccess(sensorID, targetUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "INTERNAL_ERROR", Message: err.Error()},
		})
		return
	}
	if !deleted {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "NOT_FOUND", Message: "Quyền truy cập không tồn tại"},
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Đã thu hồi quyền truy cập"})
}
