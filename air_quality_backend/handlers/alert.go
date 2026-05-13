package handlers

import (
	"database/sql"
	"net/http"
	"strconv"

	"air-quality-api/models"
	"air-quality-api/services"
	"github.com/gin-gonic/gin"
	"log"
)

type AlertHandler struct {
	alertService *services.AlertService
}

func NewAlertHandler(alertService *services.AlertService) *AlertHandler {
	return &AlertHandler{
		alertService: alertService,
	}
}

// GetList xử lý GET /alerts
func (h *AlertHandler) GetList(c *gin.Context) {
	status := c.DefaultQuery("status", "all")
	limitStr := c.DefaultQuery("limit", "50")
	cursor := c.Query("cursor")

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 {
		limit = 50
	}

	alerts, nextCursor, err := h.alertService.GetList(status, limit, cursor)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"code":    "DATABASE_ERROR",
				"message": "Lỗi khi lấy danh sách cảnh báo",
			},
		})
		return
	}

	response := models.AlertResponse{
		Data:       alerts,
		NextCursor: nextCursor,
	}

	c.JSON(http.StatusOK, response)
}

// GetDetail xử lý GET /alerts/:alertId
func (h *AlertHandler) GetDetail(c *gin.Context) {
	alertID := c.Param("alertId")

	alert, err := h.alertService.GetDetail(alertID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"code":    "DATABASE_ERROR",
				"message": "Lỗi khi lấy chi tiết cảnh báo",
			},
		})
		return
	}

	if alert == nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": gin.H{
				"code":    "NOT_FOUND",
				"message": "Cảnh báo không tồn tại",
			},
		})
		return
	}

	c.JSON(http.StatusOK, alert)
}

// Update xử lý PUT /alerts/:alertId
func (h *AlertHandler) Update(c *gin.Context) {
	alertID := c.Param("alertId")

	var req models.UpdateAlertRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "VALIDATION_ERROR",
				"message": "Dữ liệu không hợp lệ",
			},
		})
		return
	}

	alert, err := h.alertService.Update(alertID, req)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{
			"error": gin.H{
				"code":    "NOT_FOUND",
				"message": "Cảnh báo không tồn tại",
			},
		})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"code":    "DATABASE_ERROR",
				"message": "Lỗi khi cập nhật cảnh báo",
			},
		})
		return
	}

	c.JSON(http.StatusOK, alert)
}

// Delete xử lý DELETE /alerts/:alertId
func (h *AlertHandler) Delete(c *gin.Context) {
	alertID := c.Param("alertId")

	err := h.alertService.Delete(alertID)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{
			"error": gin.H{
				"code":    "NOT_FOUND",
				"message": "Cảnh báo không tồn tại",
			},
		})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"code":    "DATABASE_ERROR",
				"message": "Lỗi khi xóa cảnh báo",
			},
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Xóa cảnh báo thành công",
	})
}

// BulkUpdateStatus xử lý POST /alerts/bulk/update-status
func (h *AlertHandler) BulkUpdateStatus(c *gin.Context) {
	var req models.BulkUpdateStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "VALIDATION_ERROR",
				"message": "Dữ liệu không hợp lệ",
			},
		})
		return
	}

	if len(req.AlertIds) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "VALIDATION_ERROR",
				"message": "alertIds không được rỗng",
			},
		})
		return
	}

	updatedCount, err := h.alertService.BulkUpdateStatus(req.AlertIds, req.IsActive)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"code":    "DATABASE_ERROR",
				"message": "Lỗi khi cập nhật cảnh báo",
			},
		})
		return
	}

	c.JSON(http.StatusOK, models.BulkUpdateStatusResponse{
		UpdatedCount: updatedCount,
	})
}

// GetStatistics xử lý GET /alerts/statistics
func (h *AlertHandler) GetStatistics(c *gin.Context) {
	stats, err := h.alertService.GetStatistics()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"code":    "DATABASE_ERROR",
				"message": "Lỗi khi lấy thống kê cảnh báo",
			},
		})
		return
	}

	c.JSON(http.StatusOK, stats)
}

// CheckAndCreateAlert xử lý POST /alerts/check
// Endpoint này được gọi khi có dữ liệu mới từ sensor
func (h *AlertHandler) CheckAndCreateAlert(c *gin.Context) {
	var payload models.AlertCheckPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "VALIDATION_ERROR",
				"message": "Dữ liệu không hợp lệ",
			},
		})
		return
	}

	if payload.SensorID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"code":    "VALIDATION_ERROR",
				"message": "sensorId không được rỗng",
			},
		})
		return
	}

	result, err := h.alertService.CheckAndCreateAlert(payload)
	if err != nil {
		log.Printf("Error checking and creating alert: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"code":    "DATABASE_ERROR",
				"message": "Lỗi khi kiểm tra và tạo cảnh báo",
			},
		})
		return
	}

	c.JSON(http.StatusOK, result)
}