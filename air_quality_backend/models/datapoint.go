package models

import "time"

// DataPoint ánh xạ một bản ghi từ InfluxDB measurement "sensor_data"
// Tags trong InfluxDB: sensor_node, location, host, topic (từ MQTT topic parsing)
// Fields: pm1, pm25, pm10, temperature, humidity, heat_index, comfort, aqi_status, device_id
type DataPoint struct {
	DataPointID string    `json:"dataPointId"` // tổng hợp: {sensor_node}_{timestamp_ms}
	SensorID    string    `json:"sensorId"`    // = tag sensor_node (vd: esp32_sensor_001)
	DeviceID    string    `json:"deviceId"`    // = field device_id từ JSON payload (vd: ESP32_Sensor_001)
	Location    string    `json:"location"`    // = tag location (vd: living_room)
	Timestamp   time.Time `json:"timestamp"`
	Values      Values    `json:"values"`
}

// Values ánh xạ các field trong InfluxDB
type Values struct {
	PM1         *float64 `json:"pm1,omitempty"`
	PM25        *float64 `json:"pm25,omitempty"`
	PM10        *float64 `json:"pm10,omitempty"`
	Temperature *float64 `json:"temperature,omitempty"`
	Humidity    *float64 `json:"humidity,omitempty"`
	HeatIndex   *float64 `json:"heatIndex,omitempty"`
	AQI         *float64 `json:"aqi,omitempty"`
	Comfort     *string  `json:"comfort,omitempty"`
	AQIStatus   *string  `json:"aqiStatus,omitempty"`
}

type DataPointListResponse struct {
	Data       []DataPoint `json:"data"`
	NextCursor *string     `json:"nextCursor"`
}
