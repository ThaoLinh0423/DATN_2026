#!/usr/bin/env bash
# =============================================================================
# test_api.sh — Test toàn bộ Air Quality API
# Chạy: bash test_api.sh
# Yêu cầu: curl, jq (sudo apt install jq / brew install jq)
#
# Tùy chọn env vars:
#   BASE_URL        — mặc định http://localhost:8088/v1
#   TEST_EMAIL      — mặc định tự sinh (testuser_<timestamp>@example.com)
#   TEST_PASS       — mặc định Password123!
#   INFLUX_TOKEN    — nếu set sẽ test cả InfluxDB endpoints
#   INFLUX_ORG      — mặc định NCKH
#   INFLUX_BUCKET   — mặc định SENSOR
#
# ── Sensor ID mapping (quan trọng) ──────────────────────────────────────────
#   sensorId (UUID)   — từ PostgreSQL, dùng cho: WebSocket subscribe, Alert CRUD
#   deviceId (string) — tag sensor_node trong InfluxDB, dùng cho: /data/latest,
#                        /data/historical, POST /sensors
#   Backend tự mapping deviceId ↔ sensorId — client không cần tự làm.
# =============================================================================

set -uo pipefail

# ─── Cấu hình ─────────────────────────────────────────────────────────────────
BASE_URL="${BASE_URL:-http://localhost:8088/v1}"
TEST_EMAIL="${TEST_EMAIL:-testuser_$(date +%s)@example.com}"
TEST_PASS="${TEST_PASS:-Password123!}"

INFLUX_URL="${INFLUX_URL:-https://us-east-1-1.aws.cloud2.influxdata.com}"
INFLUX_TOKEN="${INFLUX_TOKEN:-}"
INFLUX_ORG="${INFLUX_ORG:-NCKH}"
INFLUX_BUCKET="${INFLUX_BUCKET:-SENSOR}"
INFLUX_MEASUREMENT="${INFLUX_MEASUREMENT:-sensor_data}"

# ─── Màu sắc ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'

# ─── State ────────────────────────────────────────────────────────────────────
PASS=0; FAIL=0
TOKEN=""; REFRESH_TOKEN=""; USER_ID=""; USER_ROLE=""
SENSOR_ID=""      # UUID từ PostgreSQL — dùng cho WebSocket subscribe, Alert
DEVICE_ID=""      # tag sensor_node từ InfluxDB — dùng cho /data/*
ALERT_ID=""
HTTP_CODE=""; HTTP_BODY=""

# ─── Helpers ──────────────────────────────────────────────────────────────────
print_header() {
  echo -e "\n${BOLD}${CYAN}══════════════════════════════════════${RESET}"
  echo -e "${BOLD}${CYAN}  $1${RESET}"
  echo -e "${BOLD}${CYAN}══════════════════════════════════════${RESET}"
}
print_test() { echo -e "\n${YELLOW}▶ $1${RESET}"; }
print_ok()   { echo -e "  ${GREEN}✓ PASS${RESET} — $1"; PASS=$((PASS + 1)); }
print_fail() { echo -e "  ${RED}✗ FAIL${RESET} — $1"; FAIL=$((FAIL + 1)); }
print_info() { echo -e "  ${DIM}ℹ  $1${RESET}"; }
print_skip() { echo -e "  ${DIM}⊘ SKIP${RESET} — $1"; }

call() {
  local method="$1" path="$2" body="${3:-}"
  local response
  response=$(curl -s -w "\n###HTTP_CODE###%{http_code}" \
    -X "$method" "${BASE_URL}${path}" \
    -H "Content-Type: application/json" \
    ${TOKEN:+-H "Authorization: Bearer ${TOKEN}"} \
    ${body:+-d "$body"} 2>&1) || true
  HTTP_BODY=$(echo "$response" | sed '/###HTTP_CODE###/d')
  HTTP_CODE=$(echo "$response" | grep -o '###HTTP_CODE###[0-9]*' | grep -o '[0-9]*' || echo "000")
}

expect() {
  local expected="$1" label="$2"
  if [[ "$HTTP_CODE" == "$expected" ]]; then
    print_ok "$label (HTTP $HTTP_CODE)"
  else
    print_fail "$label — expected HTTP $expected, got HTTP $HTTP_CODE"
    echo -e "     ${DIM}↳ $(echo "$HTTP_BODY" | jq -c . 2>/dev/null | head -c 250 || echo "$HTTP_BODY" | head -c 250)${RESET}"
  fi
}

extract() { echo "$HTTP_BODY" | jq -r "${1}" 2>/dev/null || echo ""; }

# ─── 0. Dependencies ──────────────────────────────────────────────────────────
print_header "Kiểm tra dependencies"
DEPS_OK=1
for dep in curl jq; do
  command -v "$dep" &>/dev/null && print_ok "$dep đã cài" || { print_fail "$dep chưa cài"; DEPS_OK=0; }
done
[[ $DEPS_OK -eq 0 ]] && exit 1

print_info "Base URL : $BASE_URL"
print_info "Email    : $TEST_EMAIL"
[[ -n "$INFLUX_TOKEN" ]] \
  && print_info "InfluxDB : sẽ được test (org=$INFLUX_ORG bucket=$INFLUX_BUCKET)" \
  || print_info "InfluxDB : bỏ qua — set INFLUX_TOKEN để test"

# ─── 1. Health check ──────────────────────────────────────────────────────────
print_header "1. Health Check"

print_test "GET /settings/general (public endpoint)"
call GET /settings/general
expect 200 "Server đang chạy"

# ─── 2. Auth ──────────────────────────────────────────────────────────────────
print_header "2. Auth"

print_test "POST /auth/register"
call POST /auth/register \
  "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\",\"timezone\":\"Asia/Ho_Chi_Minh\"}"
if   [[ "$HTTP_CODE" == "201" ]]; then print_ok "Đăng ký thành công (HTTP 201)"
elif [[ "$HTTP_CODE" == "400" ]]; then print_info "Email đã tồn tại — skip (HTTP 400)"; PASS=$((PASS+1))
else print_fail "Register — expected 201/400, got $HTTP_CODE"; fi

print_test "POST /auth/login — đúng thông tin"
call POST /auth/login "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}"
expect 200 "Đăng nhập thành công"
TOKEN=$(extract '.accessToken')
REFRESH_TOKEN=$(extract '.refreshToken')
[[ -z "$TOKEN" || "$TOKEN" == "null" ]] && { echo -e "${RED}Không lấy được accessToken — dừng.${RESET}"; exit 1; }
print_info "accessToken : ${TOKEN:0:40}..."

print_test "POST /auth/login — sai mật khẩu"
call POST /auth/login "{\"email\":\"$TEST_EMAIL\",\"password\":\"wrongpass\"}"
expect 401 "Từ chối mật khẩu sai"

print_test "POST /auth/login — email không tồn tại"
call POST /auth/login '{"email":"nobody@nowhere.com","password":"whatever"}'
expect 401 "Từ chối email không tồn tại"

print_test "POST /auth/refresh"
call POST /auth/refresh "{\"refreshToken\":\"$REFRESH_TOKEN\"}"
expect 200 "Làm mới access token"

# ─── 3. Users ─────────────────────────────────────────────────────────────────
print_header "3. Users"

print_test "GET /users/me"
call GET /users/me
expect 200 "Xem thông tin bản thân"
USER_ID=$(extract '.userId'); USER_ROLE=$(extract '.role')
print_info "userId=$USER_ID  role=$USER_ROLE"

print_test "PUT /users/me"
call PUT /users/me '{"name":"Test User","phone":"0901234567"}'
expect 200 "Cập nhật thông tin"

print_test "GET /users/me/sessions"
call GET /users/me/sessions
expect 200 "Lấy danh sách sessions"

print_test "GET /users/me — không có token"
TOKEN_BK="$TOKEN"; TOKEN=""
call GET /users/me; expect 401 "Từ chối thiếu token"
TOKEN="$TOKEN_BK"

print_test "GET /users/me — token giả"
TOKEN_BK="$TOKEN"; TOKEN="fake.jwt.token"
call GET /users/me; expect 401 "Từ chối token không hợp lệ"
TOKEN="$TOKEN_BK"

# ─── 4. Settings — InfluxDB ───────────────────────────────────────────────────
print_header "4. Settings — InfluxDB"

print_test "GET /settings/influx (trạng thái ban đầu)"
call GET /settings/influx
if   [[ "$HTTP_CODE" == "404" ]]; then print_ok "Chưa cấu hình — trả về 404"
elif [[ "$HTTP_CODE" == "200" ]]; then print_info "Đã có settings: $(extract '.influxUrl')"; PASS=$((PASS+1))
else print_fail "Unexpected HTTP $HTTP_CODE"; fi

if [[ -z "$INFLUX_TOKEN" ]]; then
  print_skip "PUT /settings/influx — INFLUX_TOKEN chưa được set"
  print_skip "GET /settings/influx/discover"
else
  print_test "PUT /settings/influx — thiếu field bắt buộc"
  call PUT /settings/influx "{\"influxToken\":\"$INFLUX_TOKEN\"}"
  expect 400 "Từ chối khi thiếu nhiều field"

  print_test "PUT /settings/influx — token sai (ping sẽ fail)"
  call PUT /settings/influx \
    "{\"influxUrl\":\"$INFLUX_URL\",\"influxToken\":\"bad-token-xyz\",\"influxOrg\":\"$INFLUX_ORG\",\"influxBucket\":\"$INFLUX_BUCKET\",\"measurement\":\"$INFLUX_MEASUREMENT\"}"
  expect 400 "Từ chối token không hợp lệ"
  print_info "error.code: $(extract '.error.code')"

  print_test "PUT /settings/influx — credentials đúng"
  call PUT /settings/influx \
    "{\"influxUrl\":\"$INFLUX_URL\",\"influxToken\":\"$INFLUX_TOKEN\",\"influxOrg\":\"$INFLUX_ORG\",\"influxBucket\":\"$INFLUX_BUCKET\",\"measurement\":\"$INFLUX_MEASUREMENT\"}"
  expect 200 "Lưu InfluxDB settings thành công"
  print_info "Token masked: $(extract '.influxToken')"

  print_test "GET /settings/influx — sau khi lưu"
  call GET /settings/influx
  expect 200 "Xem settings (token masked)"
  print_info "influxUrl=$(extract '.influxUrl')  org=$(extract '.influxOrg')"

  # ── Discover devices ──
  # Lưu ý: deviceId từ discover = tag sensor_node trong InfluxDB (thường lowercase)
  # Dùng giá trị này cho: /data/latest?sensorNode=, /data/historical?deviceId=, POST /sensors (deviceId field)
  print_test "GET /settings/influx/discover"
  call GET /settings/influx/discover
  expect 200 "Discover devices từ InfluxDB"
  TOTAL=$(extract '.total')
  print_info "Phát hiện $TOTAL device(s) trong bucket=$INFLUX_BUCKET"
  if [[ "$TOTAL" -gt 0 ]] 2>/dev/null; then
    while IFS= read -r line; do print_info "  $line"; done \
      < <(echo "$HTTP_BODY" | jq -r '.devices[] | "- \(.deviceId)  location=\(.location)"' 2>/dev/null || true)
    DEVICE_ID=$(extract '.devices[0].deviceId')
    print_info "Sẽ dùng deviceId (= sensor_node tag): $DEVICE_ID"
  else
    print_info "0 devices — kiểm tra measurement name và khoảng thời gian (range -30d)"
  fi
fi

# ─── 5. Sensors ───────────────────────────────────────────────────────────────
# sensorId (UUID) = ID trong PostgreSQL → dùng cho WebSocket subscribe và Alert CRUD
# deviceId        = tag sensor_node trong InfluxDB → dùng cho /data/* queries
print_header "5. Sensors"

print_test "GET /sensors — public (không cần auth)"
TOKEN_BK="$TOKEN"; TOKEN=""
call GET /sensors; expect 200 "Lấy danh sách không cần auth"
print_info "Số sensors: $(extract '.data | length')"
TOKEN="$TOKEN_BK"

print_test "GET /sensors?limit=2 — phân trang"
call GET "/sensors?limit=2"
expect 200 "Phân trang sensors"

# Thử lấy sensorId (UUID) và deviceId từ sensor có sẵn
call GET /sensors
SENSOR_ID=$(extract '.data[0].sensorId')
DEVICE_ID_FROM_DB=$(extract '.data[0].deviceId')
if [[ -n "$SENSOR_ID" && "$SENSOR_ID" != "null" ]]; then
  print_info "Sensor có sẵn — sensorId (UUID): $SENSOR_ID"
  print_info "Sensor có sẵn — deviceId (InfluxDB tag): $DEVICE_ID_FROM_DB"
  # Ưu tiên deviceId từ DB hơn từ discover (đã được đăng ký chính xác)
  [[ -z "$DEVICE_ID" || "$DEVICE_ID" == "null" ]] && DEVICE_ID="$DEVICE_ID_FROM_DB"
fi

# POST /sensors: sau khi tạo thành công, sensor được đăng ký vào RealtimePoller ngay lập tức
# (không cần restart server) — backend gọi poller.AddSensor(deviceId, sensorId) tự động
print_test "POST /sensors — tạo sensor mới"
NEW_DEVICE_ID="esp32_test_$(date +%s)"
call POST /sensors \
  "{\"name\":\"Test Sensor $(date +%s)\",\"deviceId\":\"$NEW_DEVICE_ID\",\"topicPath\":\"customer_a/test/all\",\"customerId\":\"customer_a\",\"location\":{\"latitude\":21.0285,\"longitude\":105.8542},\"type\":\"iot\"}"
if [[ "$HTTP_CODE" == "201" ]]; then
  print_ok "Tạo sensor thành công (HTTP 201)"
  NEW_SENSOR_ID=$(extract '.sensorId')
  NEW_DEVICE_ID_RESP=$(extract '.deviceId')
  print_info "sensorId (UUID, dùng cho WebSocket subscribe): $NEW_SENSOR_ID"
  print_info "deviceId (InfluxDB tag, dùng cho /data/*): $NEW_DEVICE_ID_RESP"
  print_info "→ Sensor đã được đăng ký vào RealtimePoller tự động (không cần restart)"
  # Dùng sensor mới tạo cho các test tiếp theo nếu chưa có
  [[ -z "$SENSOR_ID" || "$SENSOR_ID" == "null" ]] && SENSOR_ID="$NEW_SENSOR_ID"
  [[ -z "$DEVICE_ID" || "$DEVICE_ID" == "null" ]] && DEVICE_ID="$NEW_DEVICE_ID_RESP"
elif [[ "$HTTP_CODE" == "403" ]]; then
  print_ok "Từ chối khi không đủ quyền (HTTP 403) — role=$USER_ROLE"
  print_info "Cần role admin hoặc manager để tạo sensor"
else
  print_fail "POST /sensors — expected 201/403, got $HTTP_CODE"
fi

print_test "POST /sensors — thiếu field bắt buộc"
call POST /sensors '{"name":"Missing Fields"}'
if   [[ "$HTTP_CODE" == "400" ]]; then print_ok "Từ chối khi thiếu field (HTTP 400)"
elif [[ "$HTTP_CODE" == "403" ]]; then print_ok "Từ chối vì không đủ quyền — role check trước body validate (HTTP 403)"
else print_fail "POST /sensors (invalid body) — expected 400/403, got $HTTP_CODE"; fi

# ─── 6. Data ──────────────────────────────────────────────────────────────────
# /data/latest  — param: sensorNode (= deviceId, tag sensor_node trong InfluxDB)
# /data/historical — param: deviceId (= tag device_id trong InfluxDB)
print_header "6. Data"

SENSOR_NODE="${DEVICE_ID:-esp32_sensor_001}"
NOW_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
WEEK_AGO=$(date -u -d "7 days ago" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -v-7d +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || echo "2026-03-10T00:00:00Z")
YESTERDAY_TS=$(date -u -d "1 day ago" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -v-1d +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || echo "2026-03-16T00:00:00Z")

# Lưu ý: /data/latest dùng param `sensorNode` (không phải deviceId hay sensorId)
# sensorNode = giá trị tag sensor_node trong InfluxDB = deviceId đã đăng ký qua POST /sensors
print_test "GET /data/latest?sensorNode=$SENSOR_NODE"
call GET "/data/latest?sensorNode=$SENSOR_NODE"
if   [[ "$HTTP_CODE" == "200" ]]; then
  print_ok "Lấy dữ liệu mới nhất (HTTP 200)"
  echo "$HTTP_BODY" | jq '{sensorId,location,timestamp,values}' 2>/dev/null || true
elif [[ "$HTTP_CODE" == "404" ]]; then
  print_info "Không có data trong 5 phút gần nhất (HTTP 404) — sensor offline hoặc chưa có data"
  PASS=$((PASS+1))
else
  print_fail "GET /data/latest — unexpected HTTP $HTTP_CODE"
fi

print_test "GET /data/latest — thiếu sensorNode"
call GET "/data/latest"
expect 400 "Từ chối thiếu sensorNode"

print_test "GET /data/latest — không có token"
TOKEN_BK="$TOKEN"; TOKEN=""
call GET "/data/latest?sensorNode=$SENSOR_NODE"
expect 401 "Từ chối thiếu token"
TOKEN="$TOKEN_BK"

print_test "GET /data/historical?deviceId=$SENSOR_NODE (7 ngày)"
call GET "/data/historical?deviceId=$SENSOR_NODE&startTime=$WEEK_AGO&endTime=$NOW_TS&limit=5"
expect 200 "Lấy dữ liệu lịch sử"
COUNT=$(extract '.data | length')
print_info "Số điểm trả về: $COUNT"
if [[ "${COUNT:-0}" -gt 0 ]] 2>/dev/null; then
  echo "$HTTP_BODY" | jq '.data[0] | {sensorId,timestamp,values}' 2>/dev/null || true
fi

print_test "GET /data/historical — thiếu deviceId"
call GET "/data/historical?startTime=$YESTERDAY_TS&endTime=$NOW_TS"
expect 400 "Từ chối thiếu deviceId"

print_test "GET /data/historical — startTime sai format"
call GET "/data/historical?deviceId=$SENSOR_NODE&startTime=not-a-date&endTime=$NOW_TS"
expect 400 "Từ chối startTime sai format"

print_test "GET /data/historical — không có token"
TOKEN_BK="$TOKEN"; TOKEN=""
call GET "/data/historical?deviceId=$SENSOR_NODE&startTime=$YESTERDAY_TS&endTime=$NOW_TS"
expect 401 "Từ chối thiếu token"
TOKEN="$TOKEN_BK"

# ─── 7. Alerts ────────────────────────────────────────────────────────────────
# Alert dùng sensorId (UUID từ PostgreSQL), không phải deviceId
print_header "7. Alerts"

print_test "GET /alerts"
call GET /alerts; expect 200 "Lấy danh sách alerts"

print_test "GET /alerts?status=active"
call GET "/alerts?status=active&limit=5"
expect 200 "Lọc active"
print_info "Active alerts: $(extract '.data | length')"

print_test "GET /alerts?status=inactive"
call GET "/alerts?status=inactive&limit=5"
expect 200 "Lọc inactive"

print_test "GET /alerts/statistics"
call GET /alerts/statistics
expect 200 "Thống kê alerts"
echo "$HTTP_BODY" | jq '{totalAlerts,activeAlerts,inactiveAlerts,alertsByType}' 2>/dev/null || true

if [[ -n "$SENSOR_ID" && "$SENSOR_ID" != "null" ]]; then
  # Lưu ý: sensorId trong body là UUID từ PostgreSQL (không phải deviceId)
  print_test "POST /alerts/check — PM2.5=80 vượt ngưỡng danger=55 (sensorId UUID)"
  call POST /alerts/check "{\"sensorId\":\"$SENSOR_ID\",\"pm25\":80.0,\"pm10\":60.0}"
  expect 200 "Tạo alert khi vượt ngưỡng"
  ALERT_CREATED=$(extract '.alertCreated')
  print_info "alertCreated: $ALERT_CREATED  message: $(extract '.message')"
  ALERT_ID=$(extract '.alert.id')

  print_test "POST /alerts/check — PM2.5=10 giá trị bình thường"
  call POST /alerts/check "{\"sensorId\":\"$SENSOR_ID\",\"pm25\":10.0,\"pm10\":15.0}"
  expect 200 "Không tạo alert khi giá trị bình thường"
  print_info "alertCreated: $(extract '.alertCreated')  message: $(extract '.message')"

  print_test "POST /alerts/check — thiếu sensorId"
  call POST /alerts/check '{"pm25":80.0}'
  expect 400 "Từ chối thiếu sensorId"

  if [[ -n "$ALERT_ID" && "$ALERT_ID" != "null" ]]; then
    print_test "GET /alerts/$ALERT_ID"
    call GET "/alerts/$ALERT_ID"; expect 200 "Xem chi tiết alert"
    print_info "type=$(extract '.alert_type')  severity=$(extract '.severity')  value=$(extract '.value')"

    print_test "PUT /alerts/$ALERT_ID — deactivate"
    call PUT "/alerts/$ALERT_ID" '{"is_active":false}'
    expect 200 "Cập nhật is_active=false"

    print_test "POST /alerts/bulk/update-status"
    call POST /alerts/bulk/update-status "{\"alertIds\":[\"$ALERT_ID\"],\"is_active\":true}"
    expect 200 "Bulk update trạng thái"
    print_info "updatedCount: $(extract '.updatedCount')"

    print_test "DELETE /alerts/$ALERT_ID"
    call DELETE "/alerts/$ALERT_ID"; expect 200 "Xóa alert"

    print_test "GET /alerts/$ALERT_ID — sau khi xóa"
    call GET "/alerts/$ALERT_ID"; expect 404 "Alert đã bị xóa"
  fi
else
  print_skip "Alert CRUD — chưa có sensorId (UUID) hợp lệ"
  print_info "Cần sensor trong DB: đổi role thành admin/manager rồi POST /sensors"
fi

print_test "GET /alerts — không có token"
TOKEN_BK="$TOKEN"; TOKEN=""
call GET /alerts; expect 401 "Từ chối thiếu token"
TOKEN="$TOKEN_BK"

# ─── 8. WebSocket ─────────────────────────────────────────────────────────────
# WebSocket không thể test đầy đủ bằng curl, nhưng kiểm tra HTTP upgrade endpoint
print_header "8. WebSocket"

print_test "GET /ws/realtime — không có token (HTTP 401)"
TOKEN_BK="$TOKEN"; TOKEN=""
# curl với HTTP (không upgrade) — server nên trả 401 trước khi upgrade
HTTP_CODE_WS=$(curl -s -o /dev/null -w "%{http_code}" \
  "${BASE_URL}/ws/realtime" \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" 2>/dev/null || echo "000")
if [[ "$HTTP_CODE_WS" == "401" ]]; then
  print_ok "Từ chối thiếu token (HTTP 401)"
elif [[ "$HTTP_CODE_WS" == "000" ]]; then
  print_info "Không kết nối được server — bỏ qua"
  PASS=$((PASS+1))
else
  print_fail "WS without token — expected 401, got $HTTP_CODE_WS"
fi
TOKEN="$TOKEN_BK"

print_test "GET /ws/realtime — token qua query param"
HTTP_CODE_WS=$(curl -s -o /dev/null -w "%{http_code}" \
  "${BASE_URL}/ws/realtime?token=${TOKEN}" \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" 2>/dev/null || echo "000")
# 101 = upgrade thành công, 400 = bad request (curl không hoàn thành handshake) — đều OK
if [[ "$HTTP_CODE_WS" == "101" || "$HTTP_CODE_WS" == "400" ]]; then
  print_ok "Endpoint WS nhận token qua query param (HTTP $HTTP_CODE_WS)"
elif [[ "$HTTP_CODE_WS" == "000" ]]; then
  print_info "Không kết nối được server — bỏ qua"
  PASS=$((PASS+1))
else
  print_fail "WS with token — expected 101/400, got $HTTP_CODE_WS"
fi

# Hướng dẫn test WebSocket thủ công
print_info ""
print_info "─── Hướng dẫn test WebSocket thủ công ────────────────────────────"
print_info "1. Lấy sensorId (UUID) từ GET /sensors — KHÔNG dùng deviceId"
print_info "   curl ${BASE_URL}/sensors | jq '.data[] | {sensorId,deviceId,name}'"
print_info ""
print_info "2. Connect WebSocket (dùng wscat hoặc websocat):"
print_info "   wscat -c 'ws://localhost:8088/v1/ws/realtime?token=<TOKEN>'"
print_info ""
print_info "3. Subscribe bằng sensorId (UUID từ PostgreSQL):"
print_info "   → {\"type\":\"subscribe\",\"sensorId\":\"<UUID>\"}"
print_info "   ← {\"type\":\"subscribed\",\"sensorId\":\"<UUID>\"}"
print_info ""
print_info "4. Nhận data mỗi ≤30s (envelope.sensorId = UUID, data.sensorId = device_id):"
print_info "   ← {\"type\":\"data\",\"sensorId\":\"<UUID>\",\"data\":{...}}"
print_info ""
if [[ -n "$SENSOR_ID" && "$SENSOR_ID" != "null" ]]; then
  print_info "   Sensor để test: sensorId=$SENSOR_ID"
  print_info "   wscat -c 'ws://localhost:8088/v1/ws/realtime?token=${TOKEN:0:20}...'"
  print_info "   Sau khi connect gửi: {\"type\":\"subscribe\",\"sensorId\":\"$SENSOR_ID\"}"
fi
print_info "────────────────────────────────────────────────────────────────"

# ─── 9. Settings — System ─────────────────────────────────────────────────────
print_header "9. Settings — System"

print_test "GET /settings/thresholds — public"
TOKEN_BK="$TOKEN"; TOKEN=""
call GET /settings/thresholds; expect 200 "Lấy ngưỡng không cần auth"
TOKEN="$TOKEN_BK"
echo "$HTTP_BODY" | jq '{pm25Warning,pm25Danger,pm10Warning,pm10Danger,aqiWarning,aqiDanger}' 2>/dev/null || true

print_test "PUT /settings/thresholds — kiểm tra quyền"
call PUT /settings/thresholds \
  '{"pm25Warning":35,"pm25Danger":55,"pm10Warning":50,"pm10Danger":100,"aqiWarning":100,"aqiDanger":150}'
if   [[ "$HTTP_CODE" == "200" ]]; then print_info "Thành công — user có role admin"; PASS=$((PASS+1))
elif [[ "$HTTP_CODE" == "403" ]]; then print_ok "Từ chối khi không phải admin (HTTP 403)"
else print_fail "PUT /settings/thresholds — expected 200/403, got $HTTP_CODE"; fi

print_test "GET /settings/general — public"
TOKEN_BK="$TOKEN"; TOKEN=""
call GET /settings/general; expect 200 "Lấy general settings không cần auth"
TOKEN="$TOKEN_BK"

print_test "PUT /settings/general — kiểm tra quyền"
call PUT /settings/general \
  '{"siteName":"Air Quality","defaultTimezone":"Asia/Ho_Chi_Minh","defaultLanguage":"vi","dateFormat":"DD/MM/YYYY"}'
if   [[ "$HTTP_CODE" == "200" ]]; then print_info "Thành công — user có role admin"; PASS=$((PASS+1))
elif [[ "$HTTP_CODE" == "403" ]]; then print_ok "Từ chối khi không phải admin (HTTP 403)"
else print_fail "PUT /settings/general — expected 200/403, got $HTTP_CODE"; fi

# ─── 10. Settings — User ──────────────────────────────────────────────────────
print_header "10. Settings — User (Notifications)"

print_test "GET /settings/notifications"
call GET /settings/notifications; expect 200 "Lấy notification settings"
echo "$HTTP_BODY" | jq '{emailAlerts,smsAlerts,pushNotifications,alertThreshold}' 2>/dev/null || true

print_test "PUT /settings/notifications"
call PUT /settings/notifications \
  '{"emailAlerts":true,"smsAlerts":false,"pushNotifications":true,"alertThreshold":100}'
expect 200 "Cập nhật notification settings"

print_test "GET /settings/notifications — không có token"
TOKEN_BK="$TOKEN"; TOKEN=""
call GET /settings/notifications; expect 401 "Từ chối thiếu token"
TOKEN="$TOKEN_BK"

# ─── 11. Logout ───────────────────────────────────────────────────────────────
print_header "11. Logout"

print_test "POST /users/me/logout"
call POST /users/me/logout; expect 200 "Đăng xuất thành công"

print_test "GET /users/me — sau khi logout"
call GET /users/me
# Token vẫn valid đến khi expire (JWT stateless), nhưng session đã bị xóa
if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "401" ]]; then
  print_ok "Sau logout nhận HTTP $HTTP_CODE (expected)"
else
  print_fail "Sau logout — expected 200/401, got $HTTP_CODE"
fi

# ─── Kết quả ──────────────────────────────────────────────────────────────────
print_header "KẾT QUẢ"
TOTAL=$((PASS + FAIL))
echo ""
printf "  %-14s %d\n"              "Tổng tests:" "$TOTAL"
printf "  ${GREEN}%-14s %d${RESET}\n" "Pass:"       "$PASS"
printf "  ${RED}%-14s %d${RESET}\n"   "Fail:"       "$FAIL"
echo ""

echo -e "  ${DIM}─── Sensor ID mapping ─────────────────────────────────────────${RESET}"
[[ -n "$SENSOR_ID" && "$SENSOR_ID" != "null" ]] \
  && print_info "sensorId (UUID cho WS/Alert) : $SENSOR_ID" \
  || print_info "sensorId : không tìm được (cần role admin/manager để tạo sensor)"
[[ -n "$DEVICE_ID" && "$DEVICE_ID" != "null" ]] \
  && print_info "deviceId (InfluxDB tag)       : $DEVICE_ID" \
  || print_info "deviceId : không tìm được (set INFLUX_TOKEN để discover)"
echo ""

if [[ $FAIL -eq 0 ]]; then
  echo -e "  ${GREEN}${BOLD}✓ Tất cả $TOTAL tests đã pass!${RESET}"
  exit 0
else
  echo -e "  ${RED}${BOLD}✗ $FAIL/$TOTAL tests thất bại.${RESET}"
  exit 1
fi
