package handlers

import (
	"errors"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"air-quality-api/models"
	"air-quality-api/services"
	"github.com/gin-gonic/gin"
)

const defaultForecastHistoryHours = 24
const defaultForecastLimit = 1000

var allowedForecastModels = map[string]bool{
	"lstm":     true,
	"gru":      true,
	"bilstm":   true,
	"informer": true,
	"arima":    true,
}

type ForecastHandler struct {
	mlService     *services.MLService
	influxService *services.InfluxService
}

func NewForecastHandler(mlService *services.MLService, influxService *services.InfluxService) *ForecastHandler {
	return &ForecastHandler{mlService: mlService, influxService: influxService}
}

// GetForecast GET /v1/forecast/:modelKey?sensorNode=... fetches history from InfluxDB,
// then sends POST /forecast/{modelKey} with points[] to the ML service.
func (h *ForecastHandler) GetForecast(c *gin.Context) {
	modelKey, ok := validateForecastModel(c)
	if !ok {
		return
	}

	sensorNode := readSensorNode(c)
	if sensorNode == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "VALIDATION_ERROR", Message: "Missing required parameter: sensorNode"},
		})
		return
	}

	startTime, endTime, limit, ok := parseForecastWindow(c)
	if !ok {
		return
	}

	dataPoints, err := h.influxService.QueryRange(sensorNode, startTime, endTime, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "INFLUX_ERROR", Message: "Failed to query InfluxDB"},
		})
		return
	}
	if len(dataPoints) == 0 {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "NOT_FOUND", Message: "No historical data found for this sensor"},
		})
		return
	}

	points := observationPointsFromData(dataPoints)
	h.respondWithMLForecast(c, modelKey, points)
}

// PredictForecast POST /v1/forecast/:modelKey forwards caller-supplied points[] to the ML service.
func (h *ForecastHandler) PredictForecast(c *gin.Context) {
	modelKey, ok := validateForecastModel(c)
	if !ok {
		return
	}

	var req services.MLForecastRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "VALIDATION_ERROR", Message: "Invalid JSON body"},
		})
		return
	}
	if len(req.Points) == 0 {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "VALIDATION_ERROR", Message: "points must contain at least one item"},
		})
		return
	}

	h.respondWithMLForecast(c, modelKey, req.Points)
}

// GetDriftSummary GET /v1/monitoring/drift/:modelKey/summary proxies the latest drift summary.
func (h *ForecastHandler) GetDriftSummary(c *gin.Context) {
	modelKey, ok := validateForecastModel(c)
	if !ok {
		return
	}

	result, err := h.mlService.GetDriftSummary(modelKey)
	if err != nil {
		respondWithMLServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, result)
}

// GetDriftTimeseries GET /v1/monitoring/drift/:modelKey/timeseries proxies drift chart data.
func (h *ForecastHandler) GetDriftTimeseries(c *gin.Context) {
	modelKey, ok := validateForecastModel(c)
	if !ok {
		return
	}

	result, err := h.mlService.GetDriftTimeseries(modelKey)
	if err != nil {
		respondWithMLServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, result)
}

// GetLatestFeatureDrift GET /v1/monitoring/drift/:modelKey/features/latest proxies feature drift statuses.
func (h *ForecastHandler) GetLatestFeatureDrift(c *gin.Context) {
	modelKey, ok := validateForecastModel(c)
	if !ok {
		return
	}

	result, err := h.mlService.GetLatestFeatureDrift(modelKey)
	if err != nil {
		respondWithMLServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, result)
}

func (h *ForecastHandler) respondWithMLForecast(c *gin.Context, modelKey string, points []services.MLObservationPoint) {
	result, err := h.mlService.GetForecast(modelKey, points)
	if err != nil {
		respondWithMLServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, result)
}

func respondWithMLServiceError(c *gin.Context, err error) {
	status := http.StatusBadGateway
	var mlErr *services.MLServiceError
	if errors.As(err, &mlErr) {
		switch mlErr.StatusCode {
		case http.StatusBadRequest, http.StatusUnprocessableEntity:
			status = http.StatusBadRequest
		case http.StatusNotImplemented:
			status = http.StatusBadGateway
		case http.StatusServiceUnavailable:
			status = http.StatusServiceUnavailable
		}
	}
	c.JSON(status, models.ErrorResponse{
		Error: models.ErrorDetail{Code: "ML_SERVICE_ERROR", Message: err.Error()},
	})
}

func validateForecastModel(c *gin.Context) (string, bool) {
	modelKey := strings.TrimSpace(c.Param("modelKey"))
	if !allowedForecastModels[modelKey] {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error: models.ErrorDetail{
				Code:    "VALIDATION_ERROR",
				Message: "Invalid modelKey. Allowed: lstm, gru, bilstm, informer, arima",
			},
		})
		return "", false
	}
	return modelKey, true
}

func readSensorNode(c *gin.Context) string {
	sensorNode := strings.TrimSpace(c.Query("sensorNode"))
	if sensorNode == "" {
		sensorNode = strings.TrimSpace(c.Query("deviceId"))
	}
	if sensorNode == "" {
		raw := strings.TrimSpace(c.Query("sensorIds"))
		if raw != "" {
			sensorNode = strings.TrimSpace(strings.Split(raw, ",")[0])
		}
	}
	return sensorNode
}

func parseForecastWindow(c *gin.Context) (time.Time, time.Time, int, bool) {
	endTime := time.Now().UTC()
	if raw := strings.TrimSpace(c.Query("endTime")); raw != "" {
		parsed, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			c.JSON(http.StatusBadRequest, models.ErrorResponse{
				Error: models.ErrorDetail{Code: "VALIDATION_ERROR", Message: "Invalid endTime, use RFC3339"},
			})
			return time.Time{}, time.Time{}, 0, false
		}
		endTime = parsed
	}

	startTime := endTime.Add(-defaultForecastHistoryHours * time.Hour)
	if raw := strings.TrimSpace(c.Query("startTime")); raw != "" {
		parsed, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			c.JSON(http.StatusBadRequest, models.ErrorResponse{
				Error: models.ErrorDetail{Code: "VALIDATION_ERROR", Message: "Invalid startTime, use RFC3339"},
			})
			return time.Time{}, time.Time{}, 0, false
		}
		startTime = parsed
	} else if raw := strings.TrimSpace(c.Query("historyHours")); raw != "" {
		hours, err := strconv.Atoi(raw)
		if err != nil || hours <= 0 {
			c.JSON(http.StatusBadRequest, models.ErrorResponse{
				Error: models.ErrorDetail{Code: "VALIDATION_ERROR", Message: "historyHours must be a positive integer"},
			})
			return time.Time{}, time.Time{}, 0, false
		}
		startTime = endTime.Add(-time.Duration(hours) * time.Hour)
	}

	if !startTime.Before(endTime) {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error: models.ErrorDetail{Code: "VALIDATION_ERROR", Message: "startTime must be before endTime"},
		})
		return time.Time{}, time.Time{}, 0, false
	}

	limit := defaultForecastLimit
	if raw := strings.TrimSpace(c.Query("limit")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed <= 0 {
			c.JSON(http.StatusBadRequest, models.ErrorResponse{
				Error: models.ErrorDetail{Code: "VALIDATION_ERROR", Message: "limit must be a positive integer"},
			})
			return time.Time{}, time.Time{}, 0, false
		}
		limit = parsed
	}

	return startTime, endTime, limit, true
}

func observationPointsFromData(dataPoints []models.DataPoint) []services.MLObservationPoint {
	sort.Slice(dataPoints, func(i, j int) bool {
		return dataPoints[i].Timestamp.Before(dataPoints[j].Timestamp)
	})

	points := make([]services.MLObservationPoint, 0, len(dataPoints))
	for _, dp := range dataPoints {
		points = append(points, services.MLObservationPoint{
			Timestamp:   dp.Timestamp.UTC().Format(time.RFC3339Nano),
			AQI:         dp.Values.AQI,
			PM1_0:       dp.Values.PM1,
			PM2_5:       dp.Values.PM25,
			PM10:        dp.Values.PM10,
			Temperature: dp.Values.Temperature,
			Humidity:    dp.Values.Humidity,
		})
	}
	return points
}
