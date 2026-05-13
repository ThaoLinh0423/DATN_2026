package services

import (
	"context"
	"fmt"
	"log"
	"time"

	"air-quality-api/config"
	"air-quality-api/models"

	influxdb2 "github.com/influxdata/influxdb-client-go/v2"
	"github.com/influxdata/influxdb-client-go/v2/api"
)

type InfluxService struct {
	client      influxdb2.Client
	queryAPI    api.QueryAPI
	org         string
	bucket      string
	measurement string
}

func NewInfluxService(cfg *config.Config) *InfluxService {
	return newInfluxServiceFromCredentials(
		cfg.InfluxURL, cfg.InfluxToken, cfg.InfluxOrg,
		cfg.InfluxBucket, cfg.InfluxMeasurement, true,
	)
}

func NewInfluxServiceFromSettings(s *models.InfluxSettings) *InfluxService {
	return newInfluxServiceFromCredentials(
		s.InfluxURL, s.InfluxToken, s.InfluxOrg,
		s.InfluxBucket, s.Measurement, false,
	)
}

func newInfluxServiceFromCredentials(url, token, org, bucket, measurement string, ping bool) *InfluxService {
	client := influxdb2.NewClient(url, token)
	svc := &InfluxService{
		client:      client,
		queryAPI:    client.QueryAPI(org),
		org:         org,
		bucket:      bucket,
		measurement: measurement,
	}
	if ping {
		if err := svc.VerifyCredentials(); err != nil {
			log.Printf("[INFLUX] Warning: credential check failed: %v", err)
		} else {
			log.Println("[INFLUX] Connected to InfluxDB Cloud successfully")
		}
	}
	return svc
}

func (s *InfluxService) Close() {
	s.client.Close()
}

// VerifyCredentials kiểm tra token + bucket bằng query thực — Ping() không yêu cầu auth
func (s *InfluxService) VerifyCredentials() error {
	flux := fmt.Sprintf(`
from(bucket: "%s")
  |> range(start: -1m)
  |> limit(n: 0)
`, s.bucket)

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	result, err := s.queryAPI.Query(ctx, flux)
	if err != nil {
		return fmt.Errorf("credentials verification failed: %w", err)
	}
	result.Close()
	if result.Err() != nil {
		return fmt.Errorf("credentials verification failed: %w", result.Err())
	}
	return nil
}

// QueryLatest lấy điểm đo mới nhất của một sensor_node
// Tag trong InfluxDB là "sensor_node" (từ MQTT topic parsing trong Telegraf)
func (s *InfluxService) QueryLatest(sensorNode string) (*models.DataPoint, error) {
	flux := fmt.Sprintf(`
from(bucket: "%s")
  |> range(start: -5m)
  |> filter(fn: (r) => r._measurement == "%s")
  |> filter(fn: (r) => r.sensor_node == "%s")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["_time"], desc: true)
  |> limit(n: 1)
`, s.bucket, s.measurement, sensorNode)

	return s.querySingle(flux, sensorNode)
}

// QueryRange lấy dữ liệu lịch sử của một sensor_node trong khoảng thời gian
func (s *InfluxService) QueryRange(sensorNode string, start, end time.Time, limit int) ([]models.DataPoint, error) {
	if limit <= 0 || limit > 1000 {
		limit = 100
	}
	flux := fmt.Sprintf(`
from(bucket: "%s")
  |> range(start: %s, stop: %s)
  |> filter(fn: (r) => r._measurement == "%s")
  |> filter(fn: (r) => r.sensor_node == "%s")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["_time"], desc: true)
  |> limit(n: %d)
`, s.bucket, start.UTC().Format(time.RFC3339), end.UTC().Format(time.RFC3339),
		s.measurement, sensorNode, limit)

	return s.queryMultiple(flux, sensorNode)
}

// QueryLatestAllSensors lấy điểm mới nhất của nhiều sensor_node cùng lúc
func (s *InfluxService) QueryLatestAllSensors(sensorNodes []string) ([]models.DataPoint, error) {
	if len(sensorNodes) == 0 {
		return nil, nil
	}
	filter := ""
	for i, node := range sensorNodes {
		if i > 0 {
			filter += " or "
		}
		filter += fmt.Sprintf(`r.sensor_node == "%s"`, node)
	}
	flux := fmt.Sprintf(`
from(bucket: "%s")
  |> range(start: -5m)
  |> filter(fn: (r) => r._measurement == "%s")
  |> filter(fn: (r) => %s)
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["_time", "sensor_node"], desc: true)
  |> unique(column: "sensor_node")
`, s.bucket, s.measurement, filter)

	return s.queryMultiple(flux, "")
}

// DiscoverDevices tự động tìm tất cả sensor_node có trong bucket
// Thử schema.tagValues trước, fallback về regular query
func (s *InfluxService) DiscoverDevices() ([]models.InfluxDevice, error) {
	devices, err := s.discoverViaSchema()
	if err != nil || len(devices) == 0 {
		log.Printf("[INFLUX] schema.tagValues returned 0 or error (%v), trying query fallback", err)
		devices, err = s.discoverViaQuery()
		if err != nil {
			return nil, err
		}
	}
	return devices, nil
}

func (s *InfluxService) discoverViaSchema() ([]models.InfluxDevice, error) {
	flux := fmt.Sprintf(`
import "influxdata/influxdb/schema"
schema.tagValues(
  bucket: "%s",
  tag: "sensor_node",
  predicate: (r) => r._measurement == "%s",
  start: -30d
)
`, s.bucket, s.measurement)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	result, err := s.queryAPI.Query(ctx, flux)
	if err != nil {
		return nil, err
	}
	defer result.Close()

	seen := make(map[string]bool)
	var devices []models.InfluxDevice
	for result.Next() {
		node, ok := result.Record().Value().(string)
		if !ok || node == "" || seen[node] {
			continue
		}
		seen[node] = true
		loc, _ := s.getNodeLocation(node)
		devices = append(devices, models.InfluxDevice{DeviceID: node, Location: loc})
	}
	if err := result.Err(); err != nil {
		return nil, err
	}
	return devices, nil
}

func (s *InfluxService) discoverViaQuery() ([]models.InfluxDevice, error) {
	flux := fmt.Sprintf(`
from(bucket: "%s")
  |> range(start: -30d)
  |> filter(fn: (r) => r._measurement == "%s")
  |> keep(columns: ["sensor_node", "location"])
  |> group()
  |> distinct(column: "sensor_node")
`, s.bucket, s.measurement)

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	result, err := s.queryAPI.Query(ctx, flux)
	if err != nil {
		return nil, fmt.Errorf("discoverViaQuery: %w", err)
	}
	defer result.Close()

	seen := make(map[string]bool)
	var devices []models.InfluxDevice
	for result.Next() {
		vals := result.Record().Values()
		node, _ := vals["sensor_node"].(string)
		if node == "" || seen[node] {
			continue
		}
		seen[node] = true
		loc, _ := vals["location"].(string)
		devices = append(devices, models.InfluxDevice{DeviceID: node, Location: loc})
	}
	if err := result.Err(); err != nil {
		return nil, fmt.Errorf("discoverViaQuery result: %w", err)
	}
	return devices, nil
}

func (s *InfluxService) getNodeLocation(sensorNode string) (string, error) {
	flux := fmt.Sprintf(`
from(bucket: "%s")
  |> range(start: -7d)
  |> filter(fn: (r) => r._measurement == "%s" and r.sensor_node == "%s")
  |> keep(columns: ["location"])
  |> first()
`, s.bucket, s.measurement, sensorNode)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	result, err := s.queryAPI.Query(ctx, flux)
	if err != nil {
		return "", err
	}
	defer result.Close()
	for result.Next() {
		if v, ok := result.Record().Values()["location"].(string); ok {
			return v, nil
		}
	}
	return "", nil
}

func (s *InfluxService) querySingle(flux, sensorNode string) (*models.DataPoint, error) {
	points, err := s.queryMultiple(flux, sensorNode)
	if err != nil {
		return nil, err
	}
	if len(points) == 0 {
		return nil, nil
	}
	return &points[0], nil
}

func (s *InfluxService) queryMultiple(flux, defaultSensorNode string) ([]models.DataPoint, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	result, err := s.queryAPI.Query(ctx, flux)
	if err != nil {
		log.Printf("[INFLUX] Query error: %v", err)
		return nil, err
	}
	defer result.Close()

	var points []models.DataPoint
	for result.Next() {
		record := result.Record()
		values := record.Values()

		dp := models.DataPoint{
			Timestamp: record.Time(),
			Values:    models.Values{},
		}

		// Tag sensor_node (từ MQTT topic parsing)
		if v, ok := values["sensor_node"].(string); ok && v != "" {
			dp.SensorID = v
		} else {
			dp.SensorID = defaultSensorNode
		}

		// Tag location
		if v, ok := values["location"].(string); ok {
			dp.Location = v
		}

		// Field device_id (từ JSON payload — là field, không phải tag)
		if v, ok := values["device_id"].(string); ok {
			dp.DeviceID = v
		}

		dp.DataPointID = fmt.Sprintf("%s_%d", dp.SensorID, dp.Timestamp.UnixMilli())

		// PM fields lưu dạng int trong InfluxDB
		dp.Values.PM1 = toFloat64Ptr(values["pm1"])
		dp.Values.PM25 = toFloat64Ptr(values["pm25"])
		dp.Values.PM10 = toFloat64Ptr(values["pm10"])
		dp.Values.Temperature = toFloat64Ptr(values["temperature"])
		dp.Values.Humidity = toFloat64Ptr(values["humidity"])
		dp.Values.HeatIndex = toFloat64Ptr(values["heat_index"])
		dp.Values.AQI = toFloat64Ptr(values["aqi"])

		if v, ok := values["comfort"].(string); ok {
			dp.Values.Comfort = &v
		}
		if v, ok := values["aqi_status"].(string); ok {
			dp.Values.AQIStatus = &v
		}

		points = append(points, dp)
	}

	if err := result.Err(); err != nil {
		log.Printf("[INFLUX] Result error: %v", err)
		return nil, err
	}
	return points, nil
}

func toFloat64Ptr(v interface{}) *float64 {
	if v == nil {
		return nil
	}
	switch val := v.(type) {
	case float64:
		return &val
	case int64:
		f := float64(val)
		return &f
	case float32:
		f := float64(val)
		return &f
	case int:
		f := float64(val)
		return &f
	}
	return nil
}
