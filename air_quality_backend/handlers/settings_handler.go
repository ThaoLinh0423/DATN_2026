package handlers

import (
	"net/http"

	"air-quality-api/models"
	"air-quality-api/services"
	"github.com/gin-gonic/gin"
)

type SettingsHandler struct {
	settingsService *services.SettingsService
}

func NewSettingsHandler(settingsService *services.SettingsService) *SettingsHandler {
	return &SettingsHandler{settingsService: settingsService}
}

// ==================== InfluxDB Settings ====================

func (h *SettingsHandler) GetInfluxSettings(c *gin.Context) {
	userID := c.GetString("userID")
	settings, err := h.settingsService.GetInfluxSettingsMasked(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "INTERNAL_ERROR", Message: err.Error()},
		})
		return
	}
	if settings == nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "NOT_CONFIGURED", Message: "InfluxDB settings not configured yet"},
		})
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *SettingsHandler) UpsertInfluxSettings(c *gin.Context) {
	userID := c.GetString("userID")

	var req models.InfluxSettingsInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "VALIDATION_ERROR", Message: err.Error()},
		})
		return
	}

	// binding:"required" không bắt empty string — validate thủ công
	switch {
	case req.InfluxURL == "":
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: models.ErrorDetail{Code: "VALIDATION_ERROR", Message: "influxUrl is required"}})
		return
	case req.InfluxToken == "":
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: models.ErrorDetail{Code: "VALIDATION_ERROR", Message: "influxToken is required"}})
		return
	case req.InfluxOrg == "":
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: models.ErrorDetail{Code: "VALIDATION_ERROR", Message: "influxOrg is required"}})
		return
	case req.InfluxBucket == "":
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: models.ErrorDetail{Code: "VALIDATION_ERROR", Message: "influxBucket is required"}})
		return
	case req.Measurement == "":
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: models.ErrorDetail{Code: "VALIDATION_ERROR", Message: "measurement is required"}})
		return
	}

	// VerifyCredentials thay vì Ping() — Ping không yêu cầu auth trên InfluxDB Cloud
	// VerifyCredentials chạy query thực sự để xác minh token + bucket
	testSvc := services.NewInfluxServiceFromSettings(&models.InfluxSettings{
		InfluxURL:    req.InfluxURL,
		InfluxToken:  req.InfluxToken,
		InfluxOrg:    req.InfluxOrg,
		InfluxBucket: req.InfluxBucket,
		Measurement:  req.Measurement,
	})
	defer testSvc.Close()

	if err := testSvc.VerifyCredentials(); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error: models.ErrorDetail{
				Code:    "INFLUX_CONNECTION_FAILED",
				Message: "Cannot connect to InfluxDB with provided credentials: " + err.Error(),
			},
		})
		return
	}

	settings, err := h.settingsService.UpsertInfluxSettings(userID, &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "INTERNAL_ERROR", Message: err.Error()},
		})
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *SettingsHandler) DeleteInfluxSettings(c *gin.Context) {
	userID := c.GetString("userID")
	if err := h.settingsService.DeleteInfluxSettings(userID); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "INTERNAL_ERROR", Message: err.Error()},
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "InfluxDB settings deleted"})
}

func (h *SettingsHandler) DiscoverDevices(c *gin.Context) {
	userID := c.GetString("userID")
	st, err := h.settingsService.GetInfluxSettings(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "INTERNAL_ERROR", Message: err.Error()},
		})
		return
	}
	if st == nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "NOT_CONFIGURED", Message: "Please configure InfluxDB settings first via PUT /v1/settings/influx"},
		})
		return
	}

	influxSvc := services.NewInfluxServiceFromSettings(st)
	defer influxSvc.Close()

	devices, err := influxSvc.DiscoverDevices()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "INFLUX_ERROR", Message: "Failed to discover devices: " + err.Error()},
		})
		return
	}

	c.JSON(http.StatusOK, models.InfluxDiscoverResponse{
		Devices:     devices,
		Bucket:      st.InfluxBucket,
		Measurement: st.Measurement,
		Total:       len(devices),
	})
}

// ==================== General Settings ====================

func (h *SettingsHandler) GetGeneralSettings(c *gin.Context) {
	settings, err := h.settingsService.GetGeneralSettings()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *SettingsHandler) UpdateGeneralSettings(c *gin.Context) {
	var req models.GeneralSettingsInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
		return
	}
	settings, err := h.settingsService.UpdateGeneralSettings(&req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, settings)
}

// ==================== Notification Settings ====================

func (h *SettingsHandler) GetNotificationSettings(c *gin.Context) {
	userID := c.GetString("userID")
	settings, err := h.settingsService.GetNotificationSettings(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *SettingsHandler) UpdateNotificationSettings(c *gin.Context) {
	userID := c.GetString("userID")
	var req models.NotificationSettingsInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
		return
	}
	settings, err := h.settingsService.UpdateNotificationSettings(userID, &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, settings)
}

// ==================== Threshold Settings ====================

func (h *SettingsHandler) GetThresholdSettings(c *gin.Context) {
	settings, err := h.settingsService.GetThresholdSettings()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *SettingsHandler) UpdateThresholdSettings(c *gin.Context) {
	var req models.ThresholdSettingsInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
		return
	}
	settings, err := h.settingsService.UpdateThresholdSettings(&req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, settings)
}

// ==================== Email Settings ====================

func (h *SettingsHandler) GetEmailSettings(c *gin.Context) {
	settings, err := h.settingsService.GetEmailSettings()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *SettingsHandler) UpdateEmailSettings(c *gin.Context) {
	var req models.EmailSettingsInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
		return
	}
	settings, err := h.settingsService.UpdateEmailSettings(&req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *SettingsHandler) SendTestEmail(c *gin.Context) {
	var req struct {
		Email string `json:"email"`
	}
	c.ShouldBindJSON(&req)
	if err := h.settingsService.SendTestEmail(req.Email); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "EMAIL_ERROR", "message": err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Test email sent successfully"})
}
