package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"air-quality-api/config"
)

// MLObservationPoint is one historical point sent to the Python ML API.
type MLObservationPoint struct {
	Timestamp   string   `json:"timestamp"`
	AQI         *float64 `json:"aqi,omitempty"`
	PM1_0       *float64 `json:"pm1_0,omitempty"`
	PM2_5       *float64 `json:"pm2_5,omitempty"`
	PM10        *float64 `json:"pm10,omitempty"`
	Temperature *float64 `json:"temperature,omitempty"`
	Humidity    *float64 `json:"humidity,omitempty"`
}

type MLForecastRequest struct {
	Points []MLObservationPoint `json:"points"`
}

// MLForecastPoint maps one forecast step from the Python ML API.
type MLForecastPoint struct {
	Timestamp   string   `json:"timestamp"`
	AQI         *float64 `json:"aqi,omitempty"`
	PM1_0       *float64 `json:"pm1_0,omitempty"`
	PM2_5       *float64 `json:"pm2_5,omitempty"`
	PM10        *float64 `json:"pm10,omitempty"`
	Temperature *float64 `json:"temperature,omitempty"`
	Humidity    *float64 `json:"humidity,omitempty"`
}

// MLAlert maps one threshold exceedance point from the Python ML API.
type MLAlert struct {
	Timestamp string  `json:"timestamp"`
	Value     float64 `json:"value"`
}

// MLForecastResponse is the forecast response returned by the Python ML API.
type MLForecastResponse struct {
	Model          string               `json:"model"`
	TargetColumns  []string             `json:"target_columns,omitempty"`
	Horizon        int                  `json:"horizon"`
	ResampleFreq   string               `json:"resample_freq"`
	Forecast       []MLForecastPoint    `json:"forecast"`
	Alerts         map[string][]MLAlert `json:"alerts"`
}

type MLDriftFeatureStatus struct {
	Feature    string   `json:"feature"`
	PSI        *float64 `json:"psi,omitempty"`
	Status     string   `json:"status"`
	SampleSize int      `json:"sample_size"`
	Mean       *float64 `json:"mean,omitempty"`
	Std        *float64 `json:"std,omitempty"`
	Min        *float64 `json:"min,omitempty"`
	Max        *float64 `json:"max,omitempty"`
}

type MLDriftSummaryResponse struct {
	Model           string                 `json:"model"`
	GeneratedAt     string                 `json:"generated_at"`
	OverallStatus   string                 `json:"overall_status"`
	EventsInWindow  int                    `json:"events_in_window"`
	HistoryPoints   int                    `json:"history_points"`
	InputDrift      []MLDriftFeatureStatus `json:"input_drift"`
	PredictionDrift []MLDriftFeatureStatus `json:"prediction_drift"`
}

type MLDriftSeriesPoint struct {
	Timestamp  string   `json:"timestamp"`
	Scope      string   `json:"scope"`
	Feature    string   `json:"feature"`
	PSI        *float64 `json:"psi,omitempty"`
	Status     string   `json:"status"`
	SampleSize int      `json:"sample_size"`
}

type MLDriftSeriesResponse struct {
	Model       string               `json:"model"`
	GeneratedAt string               `json:"generated_at"`
	Series      []MLDriftSeriesPoint `json:"series"`
}

type MLServiceError struct {
	StatusCode int
	Body       string
}

func (e *MLServiceError) Error() string {
	return fmt.Sprintf("ml service returned %d: %s", e.StatusCode, e.Body)
}

type MLService struct {
	baseURL    string
	httpClient *http.Client
}

func NewMLService(cfg *config.Config) *MLService {
	return &MLService{
		baseURL: strings.TrimRight(cfg.MLServiceURL, "/"),
		httpClient: &http.Client{
			Timeout: 60 * time.Second,
		},
	}
}

// GetForecast calls POST /forecast/{modelKey} on the Python ML API.
func (s *MLService) GetForecast(modelKey string, points []MLObservationPoint) (*MLForecastResponse, error) {
	url := fmt.Sprintf("%s/forecast/%s", s.baseURL, modelKey)

	payload, err := json.Marshal(MLForecastRequest{Points: points})
	if err != nil {
		return nil, fmt.Errorf("failed to encode ml request: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("failed to build ml request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		log.Printf("[MLService] HTTP error calling %s: %v", url, err)
		return nil, fmt.Errorf("ml service unavailable: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read ml response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		log.Printf("[MLService] Non-200 from %s: %d - %s", url, resp.StatusCode, string(body))
		return nil, &MLServiceError{StatusCode: resp.StatusCode, Body: string(body)}
	}

	var result MLForecastResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse ml response: %w", err)
	}

	return &result, nil
}

func (s *MLService) GetDriftSummary(modelKey string) (*MLDriftSummaryResponse, error) {
	var result MLDriftSummaryResponse
	if err := s.getJSON(fmt.Sprintf("/monitoring/drift/%s/summary", modelKey), &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (s *MLService) GetDriftTimeseries(modelKey string) (*MLDriftSeriesResponse, error) {
	var result MLDriftSeriesResponse
	if err := s.getJSON(fmt.Sprintf("/monitoring/drift/%s/timeseries", modelKey), &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (s *MLService) GetLatestFeatureDrift(modelKey string) ([]MLDriftFeatureStatus, error) {
	var result []MLDriftFeatureStatus
	if err := s.getJSON(fmt.Sprintf("/monitoring/drift/%s/features/latest", modelKey), &result); err != nil {
		return nil, err
	}
	return result, nil
}

func (s *MLService) getJSON(path string, target any) error {
	url := s.baseURL + path

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("failed to build ml request: %w", err)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		log.Printf("[MLService] HTTP error calling %s: %v", url, err)
		return fmt.Errorf("ml service unavailable: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read ml response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		log.Printf("[MLService] Non-200 from %s: %d - %s", url, resp.StatusCode, string(body))
		return &MLServiceError{StatusCode: resp.StatusCode, Body: string(body)}
	}

	if err := json.Unmarshal(body, target); err != nil {
		return fmt.Errorf("failed to parse ml response: %w", err)
	}

	return nil
}
