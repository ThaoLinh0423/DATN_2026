# Air Quality API

Backend REST API cho hệ thống giám sát chất lượng không khí, viết bằng Go. Cung cấp xác thực JWT, quản lý cảm biến, dữ liệu lịch sử, cảnh báo ngưỡng và streaming realtime qua WebSocket.

## Mục lục

- [Yêu cầu](#yêu-cầu)
- [Cấu trúc project](#cấu-trúc-project)
- [Cài đặt và chạy](#cài-đặt-và-chạy)
  - [Chạy bằng Docker Compose (khuyến nghị)](#chạy-bằng-docker-compose-khuyến-nghị)
  - [Chạy local (không dùng Docker)](#chạy-local-không-dùng-docker)
- [Cấu hình biến môi trường](#cấu-hình-biến-môi-trường)
- [Database & Migration](#database--migration)
- [API Endpoints](#api-endpoints)
- [Test bằng curl](#test-bằng-curl)
- [WebSocket](#websocket)

---

## Yêu cầu

- **Docker** >= 24 và **Docker Compose** >= 2.20 (nếu chạy bằng Docker)
- **Go** >= 1.21 (nếu chạy local)
- **PostgreSQL** >= 15 (nếu chạy local)

---

## Cấu trúc project

```
airquality_backend/
├── main.go
├── go.mod / go.sum
├── .env                        # biến môi trường (tự tạo từ .env.example)
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── init.sql                    # khởi tạo users/permissions PostgreSQL
├── config/
│   └── config.go               # load config từ env
├── database/
│   ├── postgres.go             # kết nối DB
│   └── migrations.go           # tự động tạo bảng khi khởi động
├── models/                     # struct dữ liệu, request/response
├── handlers/                   # nhận HTTP request, gọi service
├── services/                   # business logic
├── middleware/                 # JWT auth, phân quyền
├── routes/
│   └── routes.go               # khai báo tất cả API endpoints
└── utils/                      # helper: JWT, bcrypt, logger
```

---

## Cài đặt và chạy

### Chạy bằng Docker Compose (khuyến nghị)

Cách này khởi động cả PostgreSQL lẫn backend trong cùng một lệnh, không cần cài đặt thêm gì.

**Bước 1 — Tạo file `.env`**

```bash
cp .env.example .env
```

Chỉnh sửa `.env` với các giá trị thực tế (xem phần [Cấu hình biến môi trường](#cấu-hình-biến-môi-trường)).

> Lưu ý: các biến `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `SERVER_PORT` đã được khai báo cứng trong `docker-compose.yml` để đảm bảo backend kết nối đúng vào container PostgreSQL. Các biến này trong `.env` sẽ bị override — chỉ cần điền `JWT_SECRET` và các biến khác.

**Bước 2 — Build và khởi động**

```bash
docker compose up -d --build
```

Lần đầu chạy, Docker sẽ:
1. Pull image `postgres:15`
2. Build Go binary từ `Dockerfile`
3. Khởi động PostgreSQL, chạy `init.sql` để tạo users/permissions
4. Đợi PostgreSQL healthy rồi mới khởi động backend
5. Backend tự động chạy migration (tạo bảng) khi khởi động

**Bước 3 — Kiểm tra**

```bash
docker compose ps
docker compose logs -f backend
```

API sẽ sẵn sàng tại `http://localhost:8088`.

**Dừng và xóa container**

```bash
# Dừng nhưng giữ data
docker compose down

# Dừng và xóa cả volume (mất toàn bộ data DB)
docker compose down -v
```

---

### Chạy local (không dùng Docker)

**Bước 1 — Chuẩn bị PostgreSQL**

Đảm bảo PostgreSQL đang chạy và tạo database:

```sql
CREATE DATABASE air_quality_db;
```

Chạy `init.sql` để tạo users bổ sung (tùy chọn):

```bash
psql -U postgres -d air_quality_db -f init.sql
```

**Bước 2 — Tạo file `.env`**

```bash
cp .env.example .env
# Chỉnh DB_HOST=localhost, DB_USER, DB_PASSWORD cho phù hợp
```

**Bước 3 — Tải dependencies và chạy**

```bash
go mod download
go run main.go
```

Hoặc build binary:

```bash
go build -o app
./app
```

---

## Cấu hình biến môi trường

Sao chép `.env.example` thành `.env` và điền các giá trị:

```env
# PostgreSQL
DB_HOST=localhost         # dùng "air_quality_postgres" khi chạy Docker Compose
DB_PORT=5432
DB_USER=air_quality_user
DB_PASSWORD=air_quality_password
DB_NAME=air_quality_db

# Server
SERVER_PORT=8088

# JWT — bắt buộc đổi khi deploy production
JWT_SECRET=change-this-to-a-long-random-secret

# Môi trường
ENV=development           # hoặc production
```

**Bảo mật:** không commit file `.env` lên git. File `.gitignore` đã loại trừ `.env`.

---

## Database & Migration

### Migration tự động

Khi backend khởi động, `database/migrations.go` tự động chạy `CREATE TABLE IF NOT EXISTS` cho tất cả các bảng. Không cần chạy migration thủ công trong điều kiện bình thường.

Các bảng được tạo tự động:

| Bảng | Mô tả |
|------|-------|
| `users` | Tài khoản người dùng |
| `user_sessions` | Phiên đăng nhập và refresh token |
| `sensors` | Thông tin cảm biến |
| `data_points` | Dữ liệu đo từ cảm biến (PM1.0, PM2.5, PM10, nhiệt độ, độ ẩm) |
| `alerts` | Cảnh báo khi vượt ngưỡng |
| `general_settings` | Cài đặt chung của hệ thống |
| `notification_settings` | Cài đặt thông báo theo từng user |
| `threshold_settings` | Ngưỡng cảnh báo PM2.5, PM10, AQI |
| `email_settings` | Cấu hình SMTP |

### Thêm migration mới

Khi cần thêm cột hoặc bảng mới, thêm câu SQL vào cuối slice `queries` trong `database/migrations.go`. Dùng `IF NOT EXISTS` hoặc `ADD COLUMN IF NOT EXISTS` để đảm bảo idempotent:

```go
// Ví dụ thêm cột aqi vào data_points
`ALTER TABLE data_points ADD COLUMN IF NOT EXISTS aqi FLOAT`,
```

Sau đó rebuild và restart backend để migration chạy.

### Truy cập PostgreSQL trực tiếp

**Khi chạy Docker Compose:**

```bash
# Vào psql trong container
docker exec -it air_quality_postgres psql -U air_quality_user -d air_quality_db

# Hoặc từ máy host (nếu port 5432 được expose)
psql -h localhost -p 5432 -U air_quality_user -d air_quality_db
```

**Một số lệnh psql hữu ích:**

```sql
-- Xem danh sách bảng
\dt

-- Xem cấu trúc một bảng
\d users

-- Đổi role user thành admin (cần thiết cho lần đầu setup)
UPDATE users SET role = 'admin' WHERE email = 'your@email.com';

-- Xem dữ liệu sensors
SELECT sensor_id, name, status FROM sensors;

-- Xem alerts gần nhất
SELECT alert_type, severity, value, created_at FROM alerts ORDER BY created_at DESC LIMIT 10;
```

### Reset database

```bash
# Xóa toàn bộ data và tạo lại từ đầu
docker compose down -v
docker compose up -d
```

---

## API Endpoints

Base URL: `http://localhost:8088/v1`

Các endpoint yêu cầu xác thực cần header: `Authorization: Bearer <access_token>`

### Auth

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| POST | `/auth/register` | Không | Đăng ký tài khoản |
| POST | `/auth/login` | Không | Đăng nhập, trả về token |
| POST | `/auth/refresh` | Không | Làm mới access token |

### Users

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/users/me` | Có | Xem thông tin bản thân |
| PUT | `/users/me` | Có | Cập nhật thông tin |
| POST | `/users/me/change-password` | Có | Đổi mật khẩu |
| GET | `/users/me/sessions` | Có | Danh sách phiên đăng nhập |
| POST | `/users/me/logout` | Có | Đăng xuất |

### Sensors

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/sensors` | Không | Danh sách cảm biến |
| POST | `/sensors` | Admin/Manager | Tạo cảm biến mới |

### Data

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/data/historical` | Có | Dữ liệu lịch sử theo sensor và khoảng thời gian |

Query params: `sensorIds`, `startTime` (RFC3339), `endTime` (RFC3339), `limit`, `cursor`

### Alerts

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/alerts` | Có | Danh sách alerts (filter: `status=active\|inactive\|all`) |
| GET | `/alerts/statistics` | Có | Thống kê tổng hợp |
| GET | `/alerts/:alertId` | Có | Chi tiết một alert |
| PUT | `/alerts/:alertId` | Có | Cập nhật trạng thái |
| DELETE | `/alerts/:alertId` | Có | Xóa alert |
| POST | `/alerts/check` | Có | Kiểm tra giá trị và tạo alert nếu vượt ngưỡng |
| POST | `/alerts/bulk/update-status` | Có | Cập nhật nhiều alerts |

### Settings

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/settings/general` | Không | Xem cài đặt chung |
| PUT | `/settings/general` | Admin | Cập nhật cài đặt chung |
| GET | `/settings/thresholds` | Không | Xem ngưỡng cảnh báo |
| PUT | `/settings/thresholds` | Admin | Cập nhật ngưỡng |
| GET | `/settings/notifications` | Có | Xem cài đặt thông báo của bản thân |
| PUT | `/settings/notifications` | Có | Cập nhật cài đặt thông báo |
| GET | `/settings/email` | Admin | Xem cấu hình SMTP |
| PUT | `/settings/email` | Admin | Cập nhật cấu hình SMTP |
| POST | `/settings/email/test` | Admin | Gửi email test |

### WebSocket

| Endpoint | Auth | Mô tả |
|----------|------|-------|
| `GET /ws/realtime?token=<jwt>` | Có (query param) | Kết nối nhận dữ liệu realtime |

---

## Test bằng curl

### Setup

```bash
BASE_URL="http://localhost:8088/v1"
```

### 1. Đăng ký và đăng nhập

```bash
# Đăng ký
curl -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@test.com", "password": "password123", "timezone": "Asia/Ho_Chi_Minh"}'

# Đăng nhập — copy accessToken vào TOKEN
curl -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@test.com", "password": "password123"}'

TOKEN="<paste_access_token_here>"
```

> **Lần đầu setup:** đổi role thành admin trong DB để dùng được các API admin:
> ```bash
> docker exec -it air_quality_postgres psql -U air_quality_user -d air_quality_db \
>   -c "UPDATE users SET role='admin' WHERE email='admin@test.com';"
> ```

### 2. Tạo sensor

```bash
curl -X POST $BASE_URL/sensors \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sensor Hoàn Kiếm",
    "location": {"latitude": 21.0285, "longitude": 105.8542},
    "type": "iot"
  }'
```

### 3. Xem dữ liệu lịch sử

```bash
SENSOR_ID="<sensor_id_từ_bước_trên>"

curl -X GET "$BASE_URL/data/historical?\
sensorIds=$SENSOR_ID\
&startTime=2024-01-01T00:00:00Z\
&endTime=2024-12-31T23:59:59Z\
&limit=50" \
  -H "Authorization: Bearer $TOKEN"
```

### 4. Tạo và quản lý alerts

```bash
# Kiểm tra và tạo alert nếu vượt ngưỡng
curl -X POST $BASE_URL/alerts/check \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sensorId": "'$SENSOR_ID'",
    "pm2_5": 80.0,
    "pm10": 120.0,
    "aqi": 180.0
  }'

# Xem danh sách alerts active
curl -X GET "$BASE_URL/alerts?status=active" \
  -H "Authorization: Bearer $TOKEN"

# Xem thống kê
curl -X GET $BASE_URL/alerts/statistics \
  -H "Authorization: Bearer $TOKEN"
```

### 5. Cấu hình ngưỡng cảnh báo (admin)

```bash
curl -X PUT $BASE_URL/settings/thresholds \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pm25Warning": 35,
    "pm25Danger": 55,
    "pm10Warning": 50,
    "pm10Danger": 100,
    "aqiWarning": 100,
    "aqiDanger": 150
  }'
```

---

## WebSocket

Kết nối WebSocket để nhận dữ liệu realtime từ cảm biến.

**Yêu cầu:** `wscat` — cài bằng `npm install -g wscat`

```bash
wscat -c "ws://localhost:8088/v1/ws/realtime?token=$TOKEN"
```

Sau khi kết nối, gửi JSON để subscribe sensor:

```json
{"type": "subscribe", "sensorId": "<sensor_id>"}
```

Subscribe nhiều sensors cùng lúc:

```json
{"type": "subscribe", "sensorIds": ["<id1>", "<id2>"]}
```

Server sẽ push dữ liệu theo định dạng:

```json
{
  "type": "data",
  "sensorId": "<sensor_id>",
  "data": {
    "dataPointId": "...",
    "sensorId": "...",
    "timestamp": "2024-01-15T08:30:00Z",
    "values": {
      "pm1_0": 12.5,
      "pm2_5": 28.3,
      "pm10": 45.1,
      "temperature": 28.5,
      "humidity": 72.0,
      "aqi": 85.2
    }
  }
}
```

Các message type khác: `unsubscribe`, `ping` → `pong`.
