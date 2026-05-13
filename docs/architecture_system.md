# KIẾN TRÚC TỔNG THỂ HỆ THỐNG GIÁM SÁT CHẤT LƯỢNG KHÔNG KHÍ

## 1. Tổng quan kiến trúc

Hệ thống giám sát chất lượng không khí được thiết kế theo kiến trúc phân lớp (layered architecture) với 5 tầng chính:

| Tầng | Thành phần | Công nghệ | Cổng |
|------|------------|-----------|------|
| 1 | Thiết bị đo | ESP32, cảm biến PM | Serial/MQTT |
| 2 | Truyền dữ liệu | MQTT Broker, Telegraf, InfluxDB | 1883/HTTPS |
| 3 | Backend | Go + Gin | 8088 |
| 4 | ML Service | Python + FastAPI + PyTorch | 8000 |
| 5 | Frontend | React + TypeScript + Vite | 5173 |

---

## 2. Lớp thiết bị đo (Device Layer)

### 2.1 Thiết bị phần cứng

```
┌─────────────────────────────────────────────────────────────────┐
│                      ESP32 Sensor Node                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ PMS5003     │  │ DHT22       │  │ ESP32 MCU               │  │
│  │ PM1.0       │  │ Nhiệt độ    │  │ - WiFi Client          │  │
│  │ PM2.5       │  │ Độ ẩm       │  │ - MQTT Publisher       │  │
│  │ PM10        │  │             │  │ - JSON Formatter        │  │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘  │
└─────────┼────────────────┼──────────────────────┼───────────────┘
          │                │                      │
          └────────────────┼──────────────────────┘
                           │ Serial
                           ▼
                    ┌──────────────┐
                    │ JSON Payload │
                    │              │
                    │ {           │
                    │   device_id  │
                    │   pm1, pm25   │
                    │   pm10       │
                    │   temperature│
                    │   humidity   │
                    │   aqi        │
                    │   comfort    │
                    │ }           │
                    └──────────────┘
```

### 2.2 Các chỉ số đo được

| Chỉ số | Trường dữ liệu | Đơn vị | Mô tả |
|--------|-----------------|--------|-------|
| PM1.0 | pm1 | µg/m³ | Bụi mịn ≤ 1.0 μm |
| PM2.5 | pm25 | µg/m³ | Bụi mịn ≤ 2.5 μm |
| PM10 | pm10 | µg/m³ | Bụi mịn ≤ 10 μm |
| Nhiệt độ | temperature | °C | Nhiệt độ môi trường |
| Độ ẩm | humidity | % | Độ ẩm tương đối |
| Heat Index | heat_index | °C | Chỉ số cảm giác nhiệt |
| AQI | aqi | index | Chỉ số chất lượng không khí |

### 2.3 Định dạng dữ liệu cảm biến (JSON payload)

```json
{
  "device_id": "ESP32_Sensor_001",
  "pm1": 15,
  "pm25": 25,
  "pm10": 45,
  "temperature": 28.5,
  "humidity": 65.2,
  "heat_index": 31.2,
  "aqi": 72,
  "comfort": "good",
  "aqi_status": "moderate"
}
```

---

## 3. Lớp truyền dữ liệu (Transmission Layer)

### 3.1 MQTT Broker (Mosquitto)

```
Protocol: MQTT 3.1.1 / 5.0
Port: 1883 (plain) / 8883 (TLS)
Authentication: Username/password

Topic Structure:
  sensors/{sensor_node}/data  → device identifier
  location/{location}/data    → physical location
```

### 3.2 Telegraf Data Collector

```
Input Plugin: mqtt_consumer
- Subscribe to: sensors/+/data
- Parse topic → extract sensor_node, location tags

Output: InfluxDB line protocol via HTTPS
```

### 3.3 InfluxDB Cloud Storage

```
Database: InfluxDB Cloud (AWS us-east-1)

Measurement: sensor_data

Tags (indexed):
  - sensor_node: device identifier (VD: "esp32_sensor_001")
  - location: physical location (VD: "living_room")
  - host: device hostname
  - topic: full MQTT topic

Fields (not indexed):
  - pm1, pm25, pm10: float (µg/m³)
  - temperature, humidity, heat_index: float
  - aqi: float
  - device_id, comfort, aqi_status: string

Timestamp: Unix nanosecond
```

### 3.4 Data Flow: Device → Cloud

```
┌────────────┐    MQTT     ┌────────────┐    Telegraf    ┌────────────┐
│   ESP32    │────────────►│   MQTT     │──────────────►│  InfluxDB  │
│  Sensor    │  (1883)     │   Broker   │  (Parse &     │   Cloud    │
│            │             │ (Mosquitto)│   Transform)  │  (HTTPS)   │
└────────────┘             └────────────┘               └────────────┘
                                                              │
                                                              │ Query API
                                                              ▼
                                                         [Data stored]
```

---

## 4. Lớp Backend (Go:8088)

### 4.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         BACKEND SERVICES (Go)                          │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                     SERVICE LAYER                                    ││
│  │                                                                      ││
│  │  ┌──────────────────┐   ┌──────────────────┐   ┌────────────────┐ ││
│  │  │  InfluxService   │   │  AlertService    │   │  MLService     │ ││
│  │  │  - QueryLatest   │   │  - CheckThresh   │   │  - GetForecast  │ ││
│  │  │  - QueryRange    │   │  - CreateAlert   │   │  - GetDrift     │ ││
│  │  │  - DiscoverDev   │   │  - NotifyEmail   │   │                │ ││
│  │  └──────────────────┘   └──────────────────┘   └────────────────┘ ││
│  │                                                                      ││
│  │  ┌──────────────────┐   ┌──────────────────┐   ┌────────────────┐ ││
│  │  │ WebSocketService │   │  RealtimePoller  │   │  AuthService    │ ││
│  │  │  - Broadcast     │   │  - PollEvery30s  │   │  - JWT Gen      │ ││
│  │  │  - Subscribe     │   │  - CheckAlerts    │   │  - Validate     │ ││
│  │  │  - Heartbeat    │   │  - MapDeviceId   │   │  - Session      │ ││
│  │  └──────────────────┘   └──────────────────┘   └────────────────┘ ││
│  │                                                                      ││
│  │  ┌──────────────────┐   ┌──────────────────┐   ┌────────────────┐ ││
│  │  │  SensorService   │   │  SettingsService │   │  UserService   │ ││
│  │  │  - CRUD sensors  │   │  - Influx config  │   │  - CRUD users  │ ││
│  │  │  - Access ctrl   │   │  - Thresholds     │   │  - Profile     │ ││
│  │  └──────────────────┘   └──────────────────┘   └────────────────┘ ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                     HANDLER LAYER                                    ││
│  │                                                                      ││
│  │  AuthHandler   UserHandler   SensorHandler   DataHandler           ││
│  │  AlertHandler  ForecastHandler SettingsHandler   WebSocketHandler  ││
│  │  AdminHandler                                                     ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                     MIDDLEWARE LAYER                                ││
│  │                                                                      ││
│  │  JWTMiddleware   OptionalJWTMiddleware   AdminOnly   AdminOrManager ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                     DATABASE LAYER                                  ││
│  │                                                                      ││
│  │              PostgreSQL (Metadata & Configuration)                  ││
│  │                                                                      ││
│  │  users | sensors | alerts | settings | sessions | sensor_access    ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 RealtimePoller Service

```
Interval: 30 giây
Flow:
  1. QueryLatestAllSensors(sensorNodes) → lấy dữ liệu mới nhất từ InfluxDB
  2. BroadcastData(sensorData) → gửi qua WebSocket đến tất cả client
  3. CheckAndCreateAlert(dataPoint) → kiểm tra ngưỡng, tạo alert nếu vượt
  4. Gửi email notification nếu được cấu hình
```

### 4.3 AlertService - Ngưỡng cảnh báo

```
Theo tiêu chuẩn WHO:

| Chỉ số | Warning | Danger |
|--------|---------|--------|
| PM2.5  | 35 µg/m³ | 55 µg/m³ |
| PM10   | 50 µg/m³ | 100 µg/m³ |
| AQI    | 100      | 150     |
```

### 4.4 REST API Endpoints

```
/v1/auth/*
  POST /register    - Đăng ký user mới
  POST /login       - Đăng nhập (trả JWT)
  POST /refresh     - Refresh access token

/v1/users/*
  GET    /me        - Lấy thông tin user hiện tại
  PUT    /me        - Cập nhật profile
  POST   /me/change-password - Đổi mật khẩu
  GET    /me/sessions - Danh sách phiên đăng nhập
  POST   /me/logout - Đăng xuất

/v1/sensors/*
  GET    /         - Danh sách sensors (public)
  POST   /         - Tạo sensor mới (admin/manager)
  DELETE /:sensorId - Xóa sensor (admin/manager)
  GET    /:sensorId/access - Danh sách quyền truy cập
  POST   /:sensorId/access - Cấp quyền cho user
  DELETE /:sensorId/access/:userId - Thu hồi quyền

/v1/data/*
  GET    /latest?sensorNode=...    - Lấy dữ liệu mới nhất
  GET    /historical?...&startTime=...&endTime=... - Lấy dữ liệu lịch sử

/v1/forecast/*
  GET    /:modelKey?sensorNode=...&historyHours=24  - Dự báo với sensor
  POST   /:modelKey     - Dự báo với dữ liệu tự cung cấp

/v1/monitoring/drift/:modelKey/*
  GET    /summary     - Tổng hợp drift
  GET    /timeseries  - Dữ liệu drift theo thời gian
  GET    /features/latest - Drift của từng feature

/v1/alerts/*
  POST   /check        - Kiểm tra và tạo alert
  POST   /bulk/update-status - Cập nhật nhiều alerts
  GET    /statistics   - Thống kê alerts
  GET    /            - Danh sách alerts (phân trang)
  GET    /:alertId     - Chi tiết alert
  PUT    /:alertId     - Cập nhật alert
  DELETE /:alertId     - Xóa alert

/v1/settings/*
  /influx        - Cấu hình kết nối InfluxDB
  /general       - Cấu hình chung (site name, timezone)
  /notifications - Cấu hình thông báo
  /thresholds    - Ngưỡng cảnh báo
  /email         - Cấu hình SMTP

/v1/ws/realtime  - WebSocket endpoint cho real-time data

/v1/admin/*
  GET    /users    - Danh sách tất cả users (admin)
  GET    /users/:userId - Chi tiết user (admin)
  PATCH  /users/:userId/role - Cập nhật role (admin)
```

### 4.5 WebSocket Protocol

```
Endpoint: /v1/ws/realtime
Authentication: JWT token via query param hoặc header

Message Types (Server → Client):
  - data     : Dữ liệu sensor mới
  - error    : Thông báo lỗi
  - subscribed / unsubscribed : Xác nhận subscription

Message Types (Client → Server):
  - subscribe   : Đăng ký nhận data của sensor(s)
  - unsubscribe : Hủy đăng ký

Reconnection: Auto-reconnect với exponential backoff
Heartbeat: Ping/pong every 30s
```

### 4.6 PostgreSQL Schema

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          PostgreSQL Schema                              │
└─────────────────────────────────────────────────────────────────────────┘

users
├── user_id (PK, UUID)
├── email (UNIQUE)
├── password (bcrypt hashed)
├── name, phone
├── role (admin | manager | user)
├── timezone
├── notification_preferences (JSONB)
└── timestamps

sensors
├── sensor_id (PK, UUID)
├── name, device_id (UNIQUE)
├── topic_path, customer_id
├── latitude, longitude
├── owner_id (FK → users)
├── type, status (active|inactive|maintenance)
└── timestamps

alerts
├── alert_id (PK, UUID)
├── sensor_id (FK → sensors)
├── alert_type (high_pm25|high_pm10|high_aqi)
├── message, is_active, severity (warning|danger)
├── value, threshold
└── timestamps

user_sessions
├── session_id (PK, UUID)
├── user_id (FK → users)
├── access_token, refresh_token
├── device_info, ip_address
├── last_activity, expires_at
└── timestamps

sensor_access (many-to-many)
├── id (PK, UUID)
├── sensor_id (FK → sensors)
├── user_id (FK → users)
├── granted_by (FK → users)
└── timestamps

general_settings | notification_settings | threshold_settings
email_settings | influx_settings
└── Per-user or system-wide configuration tables

┌──────────────────────┐       ┌──────────────────────┐
│        users         │       │       sensors        │
│  (1)────────────(N)  │       │                      │
│                      │       │  (1)──────────(N)    │
│                      │       │        alerts        │
│                      │       │                      │
│  (1)────────────(N)  │       │  (N)────(N)          │
│   user_sessions       │       │  sensor_access      │
└──────────────────────┘       │        (N)───(1)     │
                                │       users         │
                                └──────────────────────┘
```

---

## 5. Lớp ML Service (Python:8000)

### 5.1 Model Architectures

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ML SERVICE ARCHITECTURE                              │
└─────────────────────────────────────────────────────────────────────────┘

                          ┌─────────────────────┐
                          │   FastAPI Server    │
                          │   (Port 8000)       │
                          └──────────┬──────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           │                         │                         │
           ▼                         ▼                         ▼
    ┌──────────────┐          ┌──────────────┐         ┌──────────────┐
    │  LSTM Model  │          │   GRU Model  │         │ BiLSTM Model │
    │              │          │              │         │              │
    │ - 4 layers  │          │ - 2 layers   │         │ - 3 layers   │
    │ - hidden=200 │          │ - 128, 32    │         │ - 128,64,32  │
    │ - dropout=0.2│          │              │         │              │
    └──────────────┘          └──────────────┘         └──────────────┘
           │                         │                         │
           └─────────────────────────┼─────────────────────────┘
                                     │
                                     ▼
    ┌──────────────────────────────────────────────────────────────────┐
    │                      PyTorch Framework                            │
    └──────────────────────────────────────────────────────────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           │                         │                         │
           ▼                         ▼                         ▼
    ┌──────────────┐          ┌──────────────┐         ┌──────────────┐
    │   Informer   │          │    ARIMA     │         │   Drift      │
    │  Transformer │          │  Univariate  │         │  Monitoring  │
    │              │          │  statistical │         │    (PSI)     │
    │ - d_model=128│          │              │         │              │
    │ - n_heads=4  │          │ - statsmodels│         │ - Warning≥5.0│
    │ - ProbAttn   │          │ - auto_arima │         │ - Alert≥10.0 │
    └──────────────┘          └──────────────┘         └──────────────┘
```

### 5.2 Model Configuration

```
LOOK_BACK = 48    # Số bước thời gian đầu vào
HORIZON = 12       # Số bước thời gian dự báo
BATCH_SIZE = 32
EPOCHS = 100
LR = 0.001
PATIENCE = 10
MIN_DELTA = 0.0001

TARGET_COLUMNS = ["pm1_0", "pm2_5", "pm10", "aqi"]
FEATURES = ["pm1_0", "pm2_5", "pm10", "temperature", "humidity", "aqi"]
RESAMPLE_FREQ = "5min"
```

### 5.3 FastAPI Endpoints

```
GET  /                      - API root info
GET  /health               - Health check
GET  /models               - List all models + cache status
POST /models/{model_key}/load - Pre-load model into cache

POST /forecast/{model_key}  - Generate forecast
  Request:  { "points": [...] }
  Response: { "model", "forecast": [...], "alerts": {...} }

GET  /monitoring/drift/{model_key}/summary       - Drift overview
GET  /monitoring/drift/{model_key}/timeseries    - Drift history
GET  /monitoring/drift/{model_key}/features/latest - Feature drift

DELETE /cache              - Clear all cached models
DELETE /cache/{model_key}  - Evict specific model
```

### 5.4 Drift Monitoring (PSI-based)

```
Population Stability Index (PSI) formula:
PSI = Σ [(Actual% - Expected%) × ln(Actual% / Expected%)]

Status thresholds:
  - stable: PSI < 5.0
  - warning: 5.0 ≤ PSI < 10.0
  - drift: PSI ≥ 10.0

Monitored:
  - Input drift: phân phối đầu vào so với baseline
  - Prediction drift: phân phối dự báo so với baseline
  - Feature-level drift: từng feature riêng biệt
```

---

## 6. Lớp Frontend (React:5173)

### 6.1 Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND ARCHITECTURE                            │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                              App.tsx                                     │
│                         (Router Setup)                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
        ▼                             ▼                             ▼
┌───────────────┐           ┌────────────────┐           ┌────────────────┐
│  LoginPage    │           │ MainLayout     │           │  NotFound      │
│  /login       │           │ (Header+Sidebar│           │  /404          │
└───────────────┘           └───────┬────────┘           └────────────────┘
                                     │
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
        ▼                             ▼                             ▼
┌───────────────┐           ┌────────────────┐           ┌────────────────┐
│ Dashboard     │           │ LocationsPage   │           │ AlertsPage     │
│ (Index.tsx)  │           │ /locations      │           │ /alerts        │
└───────┬───────┘           └────────────────┘           └────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Dashboard Components                             │
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  KpiCard    │  │  PMChart    │  │  AqiGauge   │  │  Heatmap    │     │
│  │ (6 cards)   │  │ (Recharts)  │  │ (Circular)  │  │ (Hourly)    │     │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  AlertList  │  │ForecastTable│  │DriftTracking│  │MLForecastSection│
│  │             │  │             │  │              │  │               │     │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 State Management

```typescript
// Dashboard State (Index.tsx)
const [realtimeReadings, setRealtimeReadings] = useState<Map<string, RealtimeDataPoint>>(new Map())
const [timeRange, setTimeRange] = useState<TimeRange>("24h")
const [selectedSensor, setSelectedSensor] = useState<string>("")
const [mlModel, setMlModel] = useState<MLModelKey>("gru")
const [dashboardView, setDashboardView] = useState<DashboardView>("overview")
```

### 6.3 WebSocket Integration

```typescript
// useWebSocket Hook
const { status, data } = useWebSocket({
  sensorIds: selectedSensors,
  onDataReceived: (dataPoint) => {
    setRealtimeReadings(prev => new Map(prev).set(dataPoint.sensorId, dataPoint))
  },
  reconnectAttempts: 3,
  throttleMs: 1000
})
```

### 6.4 API Integration (TanStack Query)

```typescript
// useApi Hooks
const { data: sensors } = useSensors()
const { data: historicalData } = useHistoricalData({ sensorNode, startTime, endTime })
const { data: alerts } = useAlerts({ status: "active", limit: 50 })
const { data: forecast } = useMLForecast({ modelKey: mlModel, sensorNode, historyHours: 24 })
```

### 6.5 Pages & Routes

```
/                           → Index.tsx (Dashboard)
/login                      → LoginPage.tsx
/locations                  → LocationsPage.tsx
/dust-readings              → DustReadingsPage.tsx
/alerts                     → AlertsPage.tsx
/reports                    → ReportsPage.tsx
/settings                   → SettingsPage.tsx
/admin/users                → AdminUsersPage.tsx
/admin/permissions          → AdminPermissionsPage.tsx
/404                        → NotFound.tsx
```

---

## 7. Luồng dữ liệu tổng hợp

### 7.1 Data Flow: Sensor → Frontend

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  LỚP 1: THIẾT BỊ ĐO                                                         │
│                                                                             │
│  ESP32 Sensor Node                                                          │
│    ├── PMS5003 (PM1.0, PM2.5, PM10)                                        │
│    ├── DHT22 (Temperature, Humidity)                                       │
│    └── ESP32 MCU (WiFi + MQTT)                                             │
│                                                                             │
│    Output: JSON Payload                                                     │
│    {device_id, pm1, pm25, pm10, temperature, humidity, heat_index, aqi}  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ MQTT (TCP:1883)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  LỚP 2: TRUYỀN DỮ LIỆU                                                     │
│                                                                             │
│  MQTT Broker (Mosquitto)                                                    │
│    Topic: sensors/{sensor_node}/data                                        │
│                                                                             │
│    Telegraf (MQTT Consumer)                                                │
│    ├── Parse MQTT topic → extract sensor_node, location tags               │
│    └── Transform → InfluxDB Line Protocol                                  │
│                                                                             │
│    InfluxDB Cloud (HTTPS)                                                   │
│    └── Measurement: sensor_data                                             │
│        Tags: sensor_node, location, host, topic                              │
│        Fields: pm1, pm25, pm10, temperature, humidity, heat_index, aqi      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Query API (HTTPS)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  LỚP 3: BACKEND (Go:8088)                                                  │
│                                                                             │
│  RealtimePoller (30s interval)                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  1. QueryLatestAllSensors() → lấy data mới nhất                     │  │
│  │  2. BroadcastData() → WebSocketService                               │  │
│  │  3. CheckAndCreateAlert() → AlertService (kiểm tra ngưỡng)          │  │
│  │  4. Lưu alerts vào PostgreSQL                                       │  │
│  │  5. Gửi email notification nếu cấu hình SMTP                       │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Services: InfluxService | WebSocketService | AlertService | MLService    │
│  Handlers: Auth | User | Sensor | Data | Alert | Forecast | Settings       │
│                                                                             │
│  PostgreSQL: Users | Sensors | Alerts | Settings | Sessions | SensorAccess │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
┌─────────────────────────────┐     ┌─────────────────────────────────────────┐
│  WebSocket (WSS:8088)      │     │  REST API (HTTPS:8088)                   │
│  Real-time data push       │     │  - /v1/data/* - InfluxDB queries        │
│  - Subscribe to sensors    │     │  - /v1/forecast/* - ML forecast          │
│  - Auto-reconnect         │     │  - /v1/alerts/* - Alert management       │
│  - Heartbeat ping/pong    │     │  - /v1/sensors/* - Sensor CRUD           │
└─────────────────────────────┘     └─────────────────────────────────────────┘
                    │                               │
                    │ WSS                            │ HTTPS
                    ▼                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  LỚP 5: FRONTEND (React:5173)                                              │
│                                                                             │
│  useWebSocket Hook                                                         │
│  └── Nhận real-time data, cập nhật state realtimeReadings                  │
│                                                                             │
│  useApi Hooks (TanStack Query)                                            │
│  ├── useSensors() → danh sách sensors                                     │
│  ├── useHistoricalData() → /v1/data/historical                              │
│  ├── useAlerts() → /v1/alerts                                              │
│  └── useMLForecast() → /v1/forecast/:modelKey → ML Service                 │
│                                                                             │
│  Dashboard Components                                                      │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐             │
│  │KpiCard │ │PMChart  │ │AqiGauge  │ │Heatmap  │ │Forecast  │             │
│  │ (6)    │ │         │ │          │ │         │ │Table     │             │
│  └─────────┘ └─────────┘ └──────────┘ └─────────┘ └──────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Alert Flow

```
Sensor vượt ngưỡng
        │
        ▼
RealtimePoller (30s) → Kiểm tra AlertService.CheckAndCreateAlert()
        │
        ├── PM2.5 ≥ 35 (warning) hoặc ≥ 55 (danger)
        ├── PM10 ≥ 50 (warning) hoặc ≥ 100 (danger)
        └── AQI ≥ 100 (warning) hoặc ≥ 150 (danger)
        │
        ▼
Tạo Alert trong PostgreSQL (alerts table)
        │
        ▼
Lấy danh sách users với notification preferences
        │
        ▼
Gửi email qua SMTP (nếu cấu hình)
        │
        ▼
Frontend: Poll /v1/alerts hoặc nhận qua WebSocket
        │
        ▼
Hiển thị AlertList trên Dashboard
```

### 7.3 Forecast Flow

```
User chọn sensor + time range + ML model
        │
        ▼
Frontend → GET /v1/forecast/:modelKey?sensorNode=...&historyHours=24
        │
        ▼
Go Backend (ForecastHandler)
        │
        ├── Query InfluxDB: QueryRange(sensorNode, startTime, endTime)
        │
        ▼
Format data → MLObservationPoint[]
        │
        ▼
POST /forecast/{modelKey} → Python ML Service
        │
        ├── Load model (LSTM/GRU/BiLSTM/Informer/ARIMA)
        ├── Build observation DataFrame
        ├── Generate forecast (horizon steps)
        ├── Check thresholds → generate alerts
        ├── Record drift snapshot
        │
        ▼
Return ForecastResponse
        │
        ▼
Go Backend → Frontend
        │
        ▼
Dashboard: ForecastTable + ForecastChart + ForecastAlertStrip
```

---

## 8. Môi trường và Cấu hình

### 8.1 Backend (.env)

```env
# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_USER=air_quality_user
DB_PASSWORD=air_quality_password
DB_NAME=air_quality_db

# Server
SERVER_PORT=8088
JWT_SECRET=change-this-to-a-long-random-secret

# InfluxDB Cloud
INFLUX_URL=https://us-east-1-1.aws.cloud2.influxdata.com
INFLUX_TOKEN=your-influxdb-cloud-token
INFLUX_ORG=NCKH
INFLUX_BUCKET=SENSOR
INFLUX_MEASUREMENT=sensor_data

# Admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=Admin@123456

# ML Service
ML_SERVICE_URL=http://localhost:8000
```

### 8.2 Frontend (.env)

```env
VITE_API_URL=http://localhost:8088
```

### 8.3 ML Service (deploy_config.py)

```python
HOST = "0.0.0.0"
PORT = 8000
WORKERS = 1

ENABLED_MODELS = ["lstm", "gru", "bilstm", "informer", "arima"]
MAX_CACHED_MODELS = 5

DRIFT_ENABLED = True
DRIFT_WINDOW_SIZE = 50
DRIFT_PSI_WARNING = 5.0
DRIFT_PSI_ALERT = 10.0
```

---

## 9. Công nghệ sử dụng

### 9.1 Backend (Go)

| Thư viện | Phiên bản | Mục đích |
|----------|-----------|----------|
| gin | v1.9.1 | HTTP framework |
| golang-jwt/jwt | v4.5.2, v5.0.0 | JWT authentication |
| influxdb-client-go/v2 | v2.13.0 | InfluxDB client |
| gorilla/websocket | v1.5.1 | WebSocket |
| lib/pq | v1.10.9 | PostgreSQL driver |
| google/uuid | v1.5.0 | UUID generation |
| bcrypt | - | Password hashing |

### 9.2 Frontend (React)

| Thư viện | Phiên bản | Mục đích |
|----------|-----------|----------|
| react | 18.3 | UI framework |
| react-router-dom | 6.30 | Routing |
| @tanstack/react-query | 5.83 | Server state |
| recharts | 2.15 | Charts |
| react-leaflet | 4.2 | Maps |
| radix-ui | latest | UI components |
| tailwindcss | 3.4 | CSS framework |

### 9.3 ML (Python)

| Thư viện | Mục đích |
|----------|----------|
| fastapi | REST API framework |
| torch | Deep learning (LSTM, GRU, BiLSTM, Informer) |
| statsmodels | ARIMA model |
| pandas, numpy | Data processing |
| scikit-learn | Metrics, utilities |

---

## 10. Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SYSTEM ARCHITECTURE SUMMARY                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [ESP32] → MQTT → [Mosquitto] → Telegraf → [InfluxDB Cloud]                 │
│                                                            │                │
│                                                            │ Query          │
│                                                            ▼                │
│                              ┌───────────────────────────────┐             │
│                              │      GO BACKEND (:8088)       │             │
│                              │                               │             │
│                              │  RealtimePoller (30s)         │             │
│                              │  ├── Query InfluxDB           │             │
│                              │  ├── Broadcast WebSocket      │             │
│                              │  └── Check Alert Thresholds   │             │
│                              │                               │             │
│                              │  Services:                     │             │
│                              │  - InfluxService              │             │
│                              │  - WebSocketService           │             │
│                              │  - AlertService               │             │
│                              │  - MLService                  │             │
│                              │  - AuthService                │             │
│                              │                               │             │
│                              │  PostgreSQL:                  │             │
│                              │  Users, Sensors, Alerts       │             │
│                              └───────────────────────────────┘             │
│                                       │                    │              │
│                    ┌──────────────────┘                    │              │
│                    │ HTTP                                   │ WSS         │
│                    ▼                                        ▼              │
│     ┌────────────────────────────┐     ┌────────────────────────────┐      │
│     │  ML SERVICE (:8000)       │     │  FRONTEND (:5173)          │      │
│     │  FastAPI + PyTorch        │     │  React + TypeScript        │      │
│     │  - LSTM, GRU, BiLSTM      │     │  - Dashboard               │      │
│     │  - Informer, ARIMA       │     │  - Real-time charts        │      │
│     │  - Drift Monitoring      │     │  - Alerts, Settings        │      │
│     └────────────────────────────┘     └────────────────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

**File này mô tả kiến trúc tổng thể từ thiết bị đo (ESP32 Sensor) đến trực quan hóa (React Dashboard), bao gồm:**
- Lớp thiết bị đo (ESP32, cảm biến PM, DHT22)
- Lớp truyền dữ liệu (MQTT, Telegraf, InfluxDB)
- Lớp Backend Go (services, handlers, WebSocket, REST API)
- Lớp ML Service (5 models, drift monitoring)
- Lớp Frontend React (components, hooks, pages)
- Luồng dữ liệu tổng hợp (sensor → cloud → backend → frontend)