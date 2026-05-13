package services

import (
	"log"
	"sync"
	"time"

	"air-quality-api/models"
)

type RealtimePoller struct {
	wsService      *WebSocketService
	alertService   *AlertService
	influxService  *InfluxService
	sensorService  *SensorService

	sensorNodes    []string
	deviceToSensor map[string]string
	mu             sync.RWMutex

	interval time.Duration
	ticker   *time.Ticker
	stop     chan bool
}

func NewRealtimePoller(
	wsService *WebSocketService,
	alertService *AlertService,
	influxService *InfluxService,
	sensorService *SensorService,
	sensorNodes []string,
	interval time.Duration,
) *RealtimePoller {
	p := &RealtimePoller{
		wsService:      wsService,
		alertService:   alertService,
		influxService:  influxService,
		sensorService:  sensorService,
		sensorNodes:    sensorNodes,
		deviceToSensor: make(map[string]string),
		interval:       interval,
		stop:           make(chan bool),
	}

	if sensorService != nil {
		m, err := sensorService.GetDeviceIDToSensorIDMap()
		if err != nil {
			log.Printf("[POLLER] Warning: could not build device→sensor map: %v", err)
		} else {
			p.deviceToSensor = m
			log.Printf("[POLLER] Loaded %d device→sensor mappings", len(m))
		}
	}

	return p
}

// AddSensor đăng ký sensor mới vào poller ngay khi tạo qua API.
func (p *RealtimePoller) AddSensor(deviceID, sensorID string) {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.deviceToSensor[deviceID] = sensorID
	for _, existing := range p.sensorNodes {
		if existing == deviceID {
			return
		}
	}
	p.sensorNodes = append(p.sensorNodes, deviceID)
	log.Printf("[POLLER] Added sensor: deviceID=%s → sensorID=%s", deviceID, sensorID)
}

// RemoveSensor dừng poll sensor sau khi bị xóa qua API.
func (p *RealtimePoller) RemoveSensor(deviceID string) {
	p.mu.Lock()
	defer p.mu.Unlock()

	delete(p.deviceToSensor, deviceID)

	newNodes := p.sensorNodes[:0]
	for _, n := range p.sensorNodes {
		if n != deviceID {
			newNodes = append(newNodes, n)
		}
	}
	p.sensorNodes = newNodes
	log.Printf("[POLLER] Removed sensor: deviceID=%s", deviceID)
}

func (p *RealtimePoller) Start() {
	p.ticker = time.NewTicker(p.interval)
	go func() {
		p.pollAndBroadcast()
		for {
			select {
			case <-p.ticker.C:
				p.pollAndBroadcast()
			case <-p.stop:
				p.ticker.Stop()
				log.Println("[POLLER] Stopped")
				return
			}
		}
	}()
	log.Printf("[POLLER] Started (interval: %s, sensor_nodes: %v)", p.interval, p.sensorNodes)
}

func (p *RealtimePoller) Stop() {
	select {
	case p.stop <- true:
	default:
	}
}

func (p *RealtimePoller) pollAndBroadcast() {
	p.mu.RLock()
	nodes := make([]string, len(p.sensorNodes))
	copy(nodes, p.sensorNodes)
	p.mu.RUnlock()

	if len(nodes) == 0 {
		return
	}

	points, err := p.influxService.QueryLatestAllSensors(nodes)
	if err != nil {
		log.Printf("[POLLER] InfluxDB query error: %v", err)
		return
	}
	if len(points) == 0 {
		log.Println("[POLLER] No data returned from InfluxDB (no recent data within 5 minutes)")
		return
	}

	for _, dp := range points {
		deviceID := dp.SensorID

		p.mu.RLock()
		sensorID, ok := p.deviceToSensor[deviceID]
		p.mu.RUnlock()

		if !ok {
			log.Printf("[POLLER] No sensor_id mapping for device_id=%s, skipping", deviceID)
			continue
		}

		p.wsService.BroadcastData(sensorID, dp)

		if p.alertService != nil {
			p.checkAlert(sensorID, dp)
		}
	}
}

func (p *RealtimePoller) checkAlert(sensorID string, dp models.DataPoint) {
	payload := models.AlertCheckPayload{
		SensorID: sensorID,
		PM25:     dp.Values.PM25,
		PM10:     dp.Values.PM10,
	}
	result, err := p.alertService.CheckAndCreateAlert(payload)
	if err != nil {
		log.Printf("[POLLER] Alert check error for sensor %s: %v", sensorID, err)
		return
	}
	if result.AlertCreated && result.Alert != nil {
		log.Printf("[POLLER] Alert created — SensorID: %s | Type: %s | Severity: %s | Value: %.2f",
			sensorID, result.Alert.AlertType, result.Alert.Severity, result.Alert.Value)
	}
}
