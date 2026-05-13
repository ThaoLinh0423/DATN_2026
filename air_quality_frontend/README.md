# Air Quality Monitoring Dashboard

Hệ thống giám sát chất lượng không khí theo thời gian thực. Frontend React + TypeScript nhận dữ liệu PM1.0, PM2.5, PM10 từ mạng lưới cảm biến IoT qua WebSocket và REST API, trực quan hóa bằng dashboard dạng PowerBI.

---

## Tech Stack

| Layer | Công nghệ |
|---|---|
| Framework | React 18 + TypeScript + Vite |
| UI Components | shadcn/ui + Tailwind CSS |
| State / Data Fetching | TanStack Query v5 |
| Charts | Recharts |
| Routing | React Router v6 |
| Realtime | WebSocket (native browser API) |
| HTTP Client | Fetch API — custom `ApiClient` class |
| Notifications | Sonner |
| Linting | ESLint |
| Container | Docker + Nginx |

---

## Tính năng

**Dashboard tổng quan**
- 6 KPI cards: PM1.0, PM2.5, PM10, AQI, Nhiệt độ, Độ ẩm — mỗi card có sparkline xu hướng 16 điểm gần nhất
- Area chart 3 chỉ số PM theo thời gian, hỗ trợ timerange 24h / 7d / 30d, đường ngưỡng WHO
- AQI Gauge: thang màu 6 mức với con trỏ động, breakdown từng chỉ số
- Bar chart so sánh PM1.0 / PM2.5 / PM10 giữa các cảm biến
- Heatmap PM2.5 theo giờ × cảm biến trong ngày
- Bảng trạng thái cảm biến realtime
- Panel cảnh báo đang hoạt động với thống kê phân loại

**Quản lý cảm biến**
- CRUD đầy đủ (tạo, sửa, xóa)
- Lọc theo loại (IoT / External Station) và trạng thái (Active / Maintenance / Inactive)
- Tìm kiếm theo tên, vĩ độ, kinh độ

**Dữ liệu lịch sử**
- Bảng dữ liệu PM1.0, PM2.5, PM10, Nhiệt độ, Độ ẩm
- Lọc theo cảm biến và khoảng thời gian
- Hiển thị trạng thái LIVE khi có dữ liệu realtime từ WebSocket
- Xuất Excel

**Cảnh báo**
- Danh sách alert theo status (active / inactive / all)
- Cập nhật trạng thái, xóa, bulk update
- Thống kê phân loại theo type

**Cài đặt**
- General settings: tên hệ thống, timezone, ngôn ngữ, format ngày
- Notification settings: email, SMS, push, ngưỡng alert
- Threshold settings: ngưỡng warning / danger cho PM2.5, PM10, AQI
- Email settings: SMTP configuration + test email

**Authentication**
- JWT access token + refresh token
- Auto refresh token trước khi hết hạn
- Protected routes với `ProtectedLayout`
- Token lưu trong `sessionStorage`

---

## Cấu trúc dự án

```
src/
├── api/
│   └── client.ts              # ApiClient — JWT, token refresh, retry logic
├── components/
│   ├── layout/
│   │   ├── Header.tsx
│   │   ├── MainLayout.tsx
│   │   └── Sidebar.tsx
│   ├── sensors/
│   │   ├── AddSensorDialog.tsx
│   │   ├── SensorFilters.tsx
│   │   ├── SensorPagination.tsx
│   │   ├── SensorStatusBadge.tsx
│   │   └── SensorTable.tsx
│   ├── ui/                    # shadcn/ui components
│   └── NavLink.tsx
├── data/
│   └── mockData.ts
├── hooks/
│   ├── useApi.ts              # TanStack Query hooks: auth, sensors, data, alerts, settings
│   ├── useWebSocket.ts        # WebSocket hook: subscribe, reconnect, throttle, heartbeat
│   ├── use-mobile.tsx
│   └── use-toast.ts
├── lib/
│   └── utils.ts
├── pages/
│   ├── Index.tsx              # Dashboard tổng quan
│   ├── SensorsPage.tsx        # CRUD cảm biến
│   ├── DustReadingsPage.tsx   # Dữ liệu lịch sử + realtime
│   ├── AlertsPage.tsx
│   ├── LocationsPage.tsx
│   ├── ReportsPage.tsx
│   ├── SettingsPage.tsx
│   ├── LoginPage.tsx
│   └── NotFound.tsx
├── types/
│   └── api.ts                 # TypeScript interfaces
├── App.tsx                    # Router + ProtectedLayout
└── main.tsx
```

---

## Cài đặt & Chạy

### Yêu cầu

- Node.js >= 18
- npm hoặc bun

### Development

```bash
# Clone repo
git clone <repository-url>
cd <project-folder>

# Cài dependencies
npm install
# hoặc
bun install

# Tạo file môi trường
cp .env.example .env
# Sửa VITE_API_URL trong .env

# Chạy dev server
npm run dev
```

Ứng dụng mặc định chạy tại `http://localhost:5173`.

### Production build

```bash
npm run build
npm run preview
```

---

## Biến môi trường

| Biến | Bắt buộc | Mô tả |
|---|---|---|
| `VITE_API_URL` | Có | Base URL của backend API, ví dụ `https://api.example.com` |

WebSocket URL được sinh tự động từ `VITE_API_URL`:
- `https://` → `wss://`
- `http://` → `ws://`

Endpoint WebSocket: `{wsUrl}/v1/ws/realtime?token={accessToken}`

---

## Docker

### Build và chạy

```bash
# Development
docker build -t air-quality-frontend .
docker run -p 80:80 air-quality-frontend

# Production
docker build -f Dockerfile.prod -t air-quality-frontend:prod .
docker run -p 80:80 air-quality-frontend:prod
```

### Docker Compose

```bash
docker compose up -d
```

Nginx được cấu hình tại `nginx.conf` — phục vụ static files và proxy `/api` về backend.

---

## API Reference

Tất cả requests gọi tới `{VITE_API_URL}/v1`. Token được gắn tự động qua header `Authorization: Bearer <accessToken>`.

### Authentication

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/auth/login` | Đăng nhập, trả về `accessToken` + `refreshToken` |
| POST | `/auth/refresh` | Lấy access token mới từ refresh token |
| POST | `/auth/register` | Đăng ký tài khoản |
| POST | `/users/me/logout` | Đăng xuất |

### Users

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/users/me` | Lấy thông tin user hiện tại |
| PUT | `/users/me` | Cập nhật thông tin |
| POST | `/users/me/change-password` | Đổi mật khẩu |
| GET | `/users/me/sessions` | Danh sách session đang hoạt động |

### Sensors

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/sensors` | Danh sách cảm biến (cursor pagination, `limit`, `cursor`) |
| GET | `/sensors/:sensorId` | Chi tiết một cảm biến |
| POST | `/sensors` | Tạo cảm biến mới |
| PATCH | `/sensors/:sensorId` | Cập nhật cảm biến |
| DELETE | `/sensors/:sensorId` | Xóa cảm biến |

### Data

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/data/historical` | Dữ liệu lịch sử |

Query parameters `/data/historical`:

| Param | Type | Mô tả |
|---|---|---|
| `sensorIds` | string | Danh sách sensor ID, phân cách bởi dấu phẩy |
| `startTime` | ISO 8601 | Thời điểm bắt đầu |
| `endTime` | ISO 8601 | Thời điểm kết thúc |
| `limit` | number | Số bản ghi tối đa (default 100) |
| `cursor` | string | Con trỏ phân trang |

### Alerts

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/alerts` | Danh sách alert (`status`: `all` / `active` / `inactive`) |
| GET | `/alerts/:alertId` | Chi tiết một alert |
| PUT | `/alerts/:alertId` | Cập nhật trạng thái alert |
| DELETE | `/alerts/:alertId` | Xóa alert |
| POST | `/alerts/check` | Kiểm tra và tạo alert từ data point |
| POST | `/alerts/bulk/update-status` | Cập nhật hàng loạt |
| GET | `/alerts/statistics` | Thống kê alert theo type |

### Settings

| Method | Endpoint | Mô tả |
|---|---|---|
| GET / PUT | `/settings/general` | Cài đặt chung |
| GET / PUT | `/settings/notifications` | Cài đặt thông báo |
| GET / PUT | `/settings/thresholds` | Ngưỡng cảnh báo PM2.5 / PM10 / AQI |
| GET / PUT | `/settings/email` | Cấu hình SMTP |
| POST | `/settings/email/test` | Gửi email test |

---

## WebSocket Protocol

Kết nối: `wss://<host>/v1/ws/realtime?token=<accessToken>`

### Message types

**Client → Server**

```jsonc
// Đăng ký nhận dữ liệu từ danh sách sensor
{ "type": "subscribe", "sensorIds": ["sensor-id-1", "sensor-id-2"], "timestamp": "2025-01-01T00:00:00Z" }

// Hủy đăng ký
{ "type": "unsubscribe", "sensorIds": ["sensor-id-1"] }

// Heartbeat (gửi mỗi 30 giây)
{ "type": "ping" }
```

**Server → Client**

```jsonc
// Dữ liệu realtime từ sensor
{
  "type": "data",
  "data": {
    "dataPointId": "uuid",
    "sensorId": "uuid",
    "timestamp": "2025-01-01T12:00:00Z",
    "values": {
      "pm1_0": 8.2,
      "pm2_5": 18.4,
      "pm10": 32.1,
      "temperature": 28.5,
      "humidity": 65.0
    }
  }
}

// Xác nhận subscribe
{ "type": "subscribed", "sensorId": "uuid" }

// Heartbeat response
{ "type": "pong" }

// Lỗi
{ "type": "error", "message": "..." }
```

### Reconnect logic

Hook `useWebSocket` tự động reconnect với exponential backoff:
- Số lần thử tối đa: cấu hình qua `reconnectAttempts` (default 3)
- Delay ban đầu: `reconnectDelay` ms (default 3000), tăng gấp đôi mỗi lần
- Throttle message: `throttleMs` (default 1000ms) để tránh re-render liên tục

---

## Data Models

```typescript
interface Sensor {
  sensorId: string;
  name: string;
  location: { latitude: number; longitude: number };
  type: "iot" | "external_station";
  status: "active" | "inactive" | "maintenance";
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

interface DataPoint {
  dataPointId: string;
  sensorId: string;
  timestamp: string;            // ISO 8601
  values: {
    pm1_0?: number;             // µg/m³
    pm2_5?: number;             // µg/m³
    pm10?: number;              // µg/m³
    temperature?: number;       // °C
    humidity?: number;          // %
  };
}

interface Alert {
  id: string;
  sensorId: string;
  alert_type: "high_pm25" | "high_pm10" | "high_aqi";
  severity: "warning" | "danger";
  is_active: boolean;
  value: number;
  threshold: number;
  created_at: string;
  updated_at: string;
}

interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
}
```

---

## AQI — Ngưỡng chất lượng không khí

Tính toán AQI dựa trên PM2.5 theo thang chuẩn US EPA:

| Mức | PM2.5 (µg/m³) | AQI |
|---|---|---|
| Tốt | 0.0 – 12.0 | 0 – 50 |
| Trung bình | 12.1 – 35.4 | 51 – 100 |
| Không lành mạnh (nhóm nhạy cảm) | 35.5 – 55.4 | 101 – 150 |
| Không lành mạnh | 55.5 – 150.4 | 151 – 200 |
| Rất không lành mạnh | 150.5 – 250.4 | 201 – 300 |
| Nguy hại | > 250.5 | > 300 |

Ngưỡng WHO 24h: PM2.5 ≤ 15 µg/m³, PM10 ≤ 45 µg/m³.

---

## Authentication Flow

```
POST /auth/login
  → { accessToken, refreshToken, expiresIn }
  → lưu vào sessionStorage

Mọi request
  → Header: Authorization: Bearer <accessToken>

Response 401
  → POST /auth/refresh { refreshToken }
  → nhận accessToken mới → retry request gốc

Refresh thất bại
  → clearTokens()
  → redirect /login

Auto refresh
  → useTokenRefresh() polling mỗi 30 phút
```

---

## Scripts

```bash
npm run dev        # Dev server với Vite HMR tại localhost:5173
npm run build      # TypeScript compile + Vite production build
npm run preview    # Preview production build tại localhost:4173
npm run lint       # Kiểm tra ESLint
```

---

## License

MIT