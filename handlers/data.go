package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"air-quality-api/models"
	"air-quality-api/services"
	"github.com/gin-gonic/gin"
)

type DataHandler struct {
	influxService *services.InfluxService
}

func NewDataHandler(influxService *services.InfluxService) *DataHandler {
	return &DataHandler{influxService: influxService}
}

// GetLatest GET /v1/data/latest?sensorNode=esp32_sensor_001
// sensorNode = giá trị tag "sensor_node" trong InfluxDB (lowercase, từ MQTT topic)
func (h *DataHandler) GetLatest(c *gin.Context) {
	sensorNode := strings.TrimSpace(c.Query("sensorNode"))

	// Backward-compat: chấp nhận deviceId và sensorIds
	if sensorNode == "" {
		sensorNode = strings.TrimSpace(c.Query("deviceId"))
	}
	if sensorNode == "" {
		raw := strings.TrimSpace(c.Query("sensorIds"))
		if raw != "" {
			sensorNode = strings.TrimSpace(strings.Split(raw, ",")[0])
		}
	}

	if sensorNode == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "VALIDATION_ERROR", Message: "Missing required parameter: sensorNode"},
		})
		return
	}

	dp, err := h.influxService.QueryLatest(sensorNode)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "INFLUX_ERROR", Message: "Failed to query InfluxDB"},
		})
		return
	}
	if dp == nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "NOT_FOUND", Message: "No recent data for this sensor (checked last 5 minutes)"},
		})
		return
	}
	c.JSON(http.StatusOK, dp)
}

// GetHistorical GET /v1/data/historical?sensorNode=esp32_sensor_001&startTime=...&endTime=...
func (h *DataHandler) GetHistorical(c *gin.Context) {
	sensorNode := strings.TrimSpace(c.Query("sensorNode"))

	// Backward-compat
	if sensorNode == "" {
		sensorNode = strings.TrimSpace(c.Query("deviceId"))
	}
	if sensorNode == "" {
		raw := strings.TrimSpace(c.Query("sensorIds"))
		if raw != "" {
			sensorNode = strings.TrimSpace(strings.Split(raw, ",")[0])
		}
	}

	startTimeStr := strings.TrimSpace(c.Query("startTime"))
	endTimeStr := strings.TrimSpace(c.Query("endTime"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))

	if sensorNode == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "VALIDATION_ERROR", Message: "Missing required parameter: sensorNode"},
		})
		return
	}
	if startTimeStr == "" || endTimeStr == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "VALIDATION_ERROR", Message: "Missing required parameters: startTime, endTime (RFC3339 format)"},
		})
		return
	}

	startTime, err := time.Parse(time.RFC3339, startTimeStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "VALIDATION_ERROR", Message: "Invalid startTime, use RFC3339 (e.g. 2024-01-01T00:00:00Z)"},
		})
		return
	}
	endTime, err := time.Parse(time.RFC3339, endTimeStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "VALIDATION_ERROR", Message: "Invalid endTime, use RFC3339"},
		})
		return
	}

	dataPoints, err := h.influxService.QueryRange(sensorNode, startTime, endTime, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "INFLUX_ERROR", Message: "Failed to query InfluxDB"},
		})
		return
	}
	if dataPoints == nil {
		dataPoints = []models.DataPoint{}
	}
	c.JSON(http.StatusOK, models.DataPointListResponse{
		Data:       dataPoints,
		NextCursor: nil,
	})
}
