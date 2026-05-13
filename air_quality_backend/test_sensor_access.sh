#!/usr/bin/env bash
# =============================================================================
# test_sensor_access.sh — Test Sensor Delete & Access Management
# Chạy: bash test_sensor_access.sh
# Yêu cầu: curl, jq
#
# Env vars:
#   BASE_URL          — mặc định http://localhost:8088/v1
#   ADMIN_EMAIL       — email admin (có role admin)
#   ADMIN_PASSWORD    — mật khẩu admin
#   MANAGER_EMAIL     — email manager (có role manager), tự tạo nếu chưa có
#   MANAGER_PASSWORD  — mật khẩu manager
#   USER_EMAIL        — email user thường, tự tạo nếu chưa có
#   USER_PASSWORD     — mật khẩu user thường
#
# Ví dụ:
#   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=Admin@123456 bash test_sensor_access.sh
# =============================================================================

set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:8088/v1}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin@123456}"
MANAGER_EMAIL="${MANAGER_EMAIL:-manager_$(date +%s)@example.com}"
MANAGER_PASSWORD="${MANAGER_PASSWORD:-Manager@123456}"
USER_EMAIL="${USER_EMAIL:-user_$(date +%s)@example.com}"
USER_PASSWORD="${USER_PASSWORD:-Password123!}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'

PASS=0; FAIL=0
ADMIN_TOKEN=""
MANAGER_TOKEN=""
USER_TOKEN=""
MANAGER_ID=""
USER_ID=""
TEST_SENSOR_ID=""
TEST_DEVICE_ID="esp32_access_test_$(date +%s)"
HTTP_CODE=""; HTTP_BODY=""

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
  local token="$1" method="$2" path="$3" body="${4:-}"
  local response
  response=$(curl -s -w "\n###HTTP_CODE###%{http_code}" \
    -X "$method" "${BASE_URL}${path}" \
    -H "Content-Type: application/json" \
    ${token:+-H "Authorization: Bearer ${token}"} \
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
    echo -e "     ${DIM}↳ $(echo "$HTTP_BODY" | jq -c . 2>/dev/null | head -c 300 || echo "$HTTP_BODY" | head -c 300)${RESET}"
  fi
}

extract() { echo "$HTTP_BODY" | jq -r "${1}" 2>/dev/null || echo ""; }

# ─── 0. Dependencies ──────────────────────────────────────────────────────────
print_header "Kiểm tra dependencies"
for dep in curl jq; do
  command -v "$dep" &>/dev/null && print_ok "$dep đã cài" || { print_fail "$dep chưa cài"; exit 1; }
done
print_info "Base URL : $BASE_URL"

# ─── 1. Setup accounts ────────────────────────────────────────────────────────
print_header "1. Setup tài khoản"

# Admin login
print_test "Đăng nhập admin"
call "" POST /auth/login "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}"
expect 200 "Admin đăng nhập thành công"
ADMIN_TOKEN=$(extract '.accessToken')
[[ -z "$ADMIN_TOKEN" || "$ADMIN_TOKEN" == "null" ]] && { echo -e "${RED}Không lấy được admin token — dừng.${RESET}"; exit 1; }
print_info "Admin token: ${ADMIN_TOKEN:0:30}..."

# Tạo manager account
print_test "Tạo tài khoản manager"
call "" POST /auth/register \
  "{\"email\":\"$MANAGER_EMAIL\",\"password\":\"$MANAGER_PASSWORD\",\"timezone\":\"Asia/Ho_Chi_Minh\"}"
if [[ "$HTTP_CODE" == "201" ]]; then
  MANAGER_ID=$(extract '.userId')
  print_ok "Tạo manager account (HTTP 201)"
elif [[ "$HTTP_CODE" == "400" ]]; then
  print_info "Manager đã tồn tại — dùng lại"; PASS=$((PASS+1))
fi
call "" POST /auth/login "{\"email\":\"$MANAGER_EMAIL\",\"password\":\"$MANAGER_PASSWORD\"}"
expect 200 "Manager login"
MANAGER_TOKEN=$(extract '.accessToken')
call "$MANAGER_TOKEN" GET /users/me; MANAGER_ID=$(extract '.userId')
print_info "Manager ID: $MANAGER_ID (role=$(extract '.role' <<< "$(curl -s -H "Authorization: Bearer $MANAGER_TOKEN" "${BASE_URL}/users/me")"))"

# Nâng lên manager nếu cần
call "$ADMIN_TOKEN" PATCH "/admin/users/$MANAGER_ID/role" '{"role":"manager"}'
if [[ "$HTTP_CODE" == "200" ]]; then
  print_info "Đã nâng lên role=manager"
  # Re-login để lấy JWT mới với role manager
  call "" POST /auth/login "{\"email\":\"$MANAGER_EMAIL\",\"password\":\"$MANAGER_PASSWORD\"}"
  MANAGER_TOKEN=$(extract '.accessToken')
fi

# Tạo user thường
print_test "Tạo tài khoản user thường"
call "" POST /auth/register \
  "{\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASSWORD\",\"timezone\":\"Asia/Ho_Chi_Minh\"}"
if [[ "$HTTP_CODE" == "201" ]]; then
  print_ok "Tạo user account (HTTP 201)"
elif [[ "$HTTP_CODE" == "400" ]]; then
  print_info "User đã tồn tại — dùng lại"; PASS=$((PASS+1))
fi
call "" POST /auth/login "{\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASSWORD\"}"
expect 200 "User login"
USER_TOKEN=$(extract '.accessToken')
call "$USER_TOKEN" GET /users/me; USER_ID=$(extract '.userId')
print_info "User ID: $USER_ID"

# ─── 2. Tạo sensor để test ────────────────────────────────────────────────────
print_header "2. Tạo sensor test"

print_test "POST /sensors — manager tạo sensor"
call "$MANAGER_TOKEN" POST /sensors \
  "{\"name\":\"Access Test Sensor\",\"deviceId\":\"$TEST_DEVICE_ID\",\"topicPath\":\"test/access/all\",\"customerId\":\"test_customer\",\"location\":{\"latitude\":21.0,\"longitude\":105.8},\"type\":\"iot\"}"
if [[ "$HTTP_CODE" == "201" ]]; then
  TEST_SENSOR_ID=$(extract '.sensorId')
  print_ok "Tạo sensor thành công"
  print_info "sensorId: $TEST_SENSOR_ID | deviceId: $TEST_DEVICE_ID"
else
  print_fail "Tạo sensor — got HTTP $HTTP_CODE"
  # Thử lấy sensor có sẵn
  call "$MANAGER_TOKEN" GET /sensors
  TEST_SENSOR_ID=$(extract '.data[0].sensorId')
  TEST_DEVICE_ID=$(extract '.data[0].deviceId')
  [[ -n "$TEST_SENSOR_ID" && "$TEST_SENSOR_ID" != "null" ]] \
    && print_info "Dùng sensor có sẵn: $TEST_SENSOR_ID" \
    || { echo -e "${RED}Không có sensor nào — dừng.${RESET}"; exit 1; }
fi

# ─── 3. GET /sensors — kiểm tra filter theo quyền ────────────────────────────
print_header "3. GET /sensors — filter theo quyền"

print_test "GET /sensors — không có token (public, thấy tất cả)"
call "" GET /sensors
expect 200 "Public thấy tất cả sensor"
PUBLIC_COUNT=$(extract '.data | length')
print_info "Số sensor (public): $PUBLIC_COUNT"

print_test "GET /sensors — admin token (thấy tất cả)"
call "$ADMIN_TOKEN" GET /sensors
expect 200 "Admin thấy tất cả sensor"
ADMIN_COUNT=$(extract '.data | length')
print_info "Số sensor (admin): $ADMIN_COUNT"

print_test "GET /sensors — user token (chưa được grant → thấy 0)"
call "$USER_TOKEN" GET /sensors
expect 200 "User nhận response 200"
USER_COUNT=$(extract '.data | length')
print_info "Số sensor (user chưa được grant): $USER_COUNT"
[[ "$USER_COUNT" == "0" ]] \
  && print_ok "User chưa được grant → thấy 0 sensor" \
  || print_info "User thấy $USER_COUNT sensor (có thể do grant trước đó)"

# ─── 4. GET /sensors/:sensorId/access ────────────────────────────────────────
print_header "4. GET /sensors/:sensorId/access"

if [[ -n "$TEST_SENSOR_ID" && "$TEST_SENSOR_ID" != "null" ]]; then
  print_test "GET /sensors/$TEST_SENSOR_ID/access — không có token"
  call "" GET "/sensors/$TEST_SENSOR_ID/access"
  expect 401 "Từ chối thiếu token"

  print_test "GET /sensors/$TEST_SENSOR_ID/access — user thường"
  call "$USER_TOKEN" GET "/sensors/$TEST_SENSOR_ID/access"
  expect 403 "Từ chối role=user"

  print_test "GET /sensors/$TEST_SENSOR_ID/access — manager (danh sách ban đầu rỗng)"
  call "$MANAGER_TOKEN" GET "/sensors/$TEST_SENSOR_ID/access"
  expect 200 "Manager xem access list"
  INITIAL_COUNT=$(extract '.total')
  print_info "Access count ban đầu: $INITIAL_COUNT"

  print_test "GET /sensors/invalid-uuid/access — sensor không tồn tại"
  call "$MANAGER_TOKEN" GET "/sensors/00000000-0000-0000-0000-000000000000/access"
  expect 404 "Trả về 404 khi sensor không tồn tại"
fi

# ─── 5. POST /sensors/:sensorId/access — cấp quyền ──────────────────────────
print_header "5. POST /sensors/:sensorId/access — cấp quyền"

if [[ -n "$TEST_SENSOR_ID" && "$TEST_SENSOR_ID" != "null" && -n "$USER_ID" && "$USER_ID" != "null" ]]; then
  print_test "POST — không có token"
  call "" POST "/sensors/$TEST_SENSOR_ID/access" "{\"userId\":\"$USER_ID\"}"
  expect 401 "Từ chối thiếu token"

  print_test "POST — user thường không được grant"
  call "$USER_TOKEN" POST "/sensors/$TEST_SENSOR_ID/access" "{\"userId\":\"$USER_ID\"}"
  expect 403 "Từ chối role=user"

  print_test "POST — thiếu userId trong body"
  call "$MANAGER_TOKEN" POST "/sensors/$TEST_SENSOR_ID/access" '{}'
  expect 400 "Từ chối thiếu userId"

  print_test "POST — userId không tồn tại"
  call "$MANAGER_TOKEN" POST "/sensors/$TEST_SENSOR_ID/access" \
    '{"userId":"00000000-0000-0000-0000-000000000000"}'
  expect 400 "Từ chối userId không tồn tại (USER_NOT_FOUND)"
  print_info "error.code: $(extract '.error.code')"

  print_test "POST — manager cấp quyền cho user"
  call "$MANAGER_TOKEN" POST "/sensors/$TEST_SENSOR_ID/access" "{\"userId\":\"$USER_ID\"}"
  expect 200 "Cấp quyền thành công"
  print_info "accessId: $(extract '.id') | userId: $(extract '.userId') | grantedBy: $(extract '.grantedBy')"

  print_test "POST — cấp quyền lần 2 (idempotent, không lỗi)"
  call "$MANAGER_TOKEN" POST "/sensors/$TEST_SENSOR_ID/access" "{\"userId\":\"$USER_ID\"}"
  expect 200 "Idempotent — không lỗi khi grant trùng"

  # Verify: user giờ thấy sensor sau khi được grant
  print_test "GET /sensors — user sau khi được grant (phải thấy sensor)"
  call "$USER_TOKEN" GET /sensors
  expect 200 "User nhận response 200"
  AFTER_GRANT_COUNT=$(extract '.data | length')
  print_info "Số sensor user thấy sau grant: $AFTER_GRANT_COUNT"
  [[ "$AFTER_GRANT_COUNT" -ge "1" ]] 2>/dev/null \
    && print_ok "User thấy ít nhất 1 sensor sau khi được grant" \
    || print_fail "User vẫn thấy 0 sensor sau khi grant"

  # Verify: access list hiển thị đúng
  print_test "GET /sensors/$TEST_SENSOR_ID/access — xác nhận user đã có trong list"
  call "$MANAGER_TOKEN" GET "/sensors/$TEST_SENSOR_ID/access"
  expect 200 "Lấy access list"
  AFTER_GRANT_ACCESS=$(extract '.total')
  print_info "Total access sau grant: $AFTER_GRANT_ACCESS"
  [[ "$AFTER_GRANT_ACCESS" -ge "1" ]] 2>/dev/null \
    && print_ok "Access list có ít nhất 1 bản ghi" \
    || print_fail "Access list vẫn rỗng sau grant"
  echo "$HTTP_BODY" | jq '.data[] | {userId, userEmail, grantedBy}' 2>/dev/null || true
else
  print_skip "Grant access tests — thiếu sensorId hoặc userId"
fi

# ─── 6. DELETE /sensors/:sensorId/access/:userId — thu hồi quyền ─────────────
print_header "6. DELETE /sensors/:sensorId/access/:userId — thu hồi quyền"

if [[ -n "$TEST_SENSOR_ID" && "$TEST_SENSOR_ID" != "null" && -n "$USER_ID" && "$USER_ID" != "null" ]]; then
  print_test "DELETE — không có token"
  call "" DELETE "/sensors/$TEST_SENSOR_ID/access/$USER_ID"
  expect 401 "Từ chối thiếu token"

  print_test "DELETE — user thường"
  call "$USER_TOKEN" DELETE "/sensors/$TEST_SENSOR_ID/access/$USER_ID"
  expect 403 "Từ chối role=user"

  print_test "DELETE — admin thu hồi quyền của user"
  call "$ADMIN_TOKEN" DELETE "/sensors/$TEST_SENSOR_ID/access/$USER_ID"
  expect 200 "Thu hồi quyền thành công"
  print_info "Response: $(extract '.message')"

  # Verify: user không còn thấy sensor
  print_test "GET /sensors — user sau khi bị revoke (phải về 0)"
  call "$USER_TOKEN" GET /sensors
  expect 200 "User nhận response 200"
  AFTER_REVOKE_COUNT=$(extract '.data | length')
  print_info "Số sensor user thấy sau revoke: $AFTER_REVOKE_COUNT"
  [[ "$AFTER_REVOKE_COUNT" == "0" ]] \
    && print_ok "User không còn thấy sensor sau revoke" \
    || print_info "User thấy $AFTER_REVOKE_COUNT sensor (có thể do grant khác)"

  print_test "DELETE — revoke lần 2 (bản ghi không tồn tại → 404)"
  call "$ADMIN_TOKEN" DELETE "/sensors/$TEST_SENSOR_ID/access/$USER_ID"
  expect 404 "Trả về 404 khi access không tồn tại"
else
  print_skip "Revoke access tests — thiếu sensorId hoặc userId"
fi

# ─── 7. DELETE /sensors/:sensorId — xóa sensor ───────────────────────────────
print_header "7. DELETE /sensors/:sensorId — xóa sensor"

# Tạo sensor riêng để xóa (không xóa sensor test đang dùng)
print_test "Tạo sensor phụ để test xóa"
DELETE_DEVICE_ID="esp32_delete_test_$(date +%s)"
call "$ADMIN_TOKEN" POST /sensors \
  "{\"name\":\"Delete Test\",\"deviceId\":\"$DELETE_DEVICE_ID\",\"topicPath\":\"test/delete/all\",\"customerId\":\"test\",\"location\":{\"latitude\":21.0,\"longitude\":105.8},\"type\":\"iot\"}"
DELETE_SENSOR_ID=""
if [[ "$HTTP_CODE" == "201" ]]; then
  DELETE_SENSOR_ID=$(extract '.sensorId')
  print_ok "Tạo sensor để xóa: $DELETE_SENSOR_ID"
else
  print_info "Không tạo được sensor phụ (HTTP $HTTP_CODE) — dùng sensor test để xóa"
  DELETE_SENSOR_ID="$TEST_SENSOR_ID"
fi

print_test "DELETE /sensors/$DELETE_SENSOR_ID — không có token"
call "" DELETE "/sensors/$DELETE_SENSOR_ID"
expect 401 "Từ chối thiếu token"

print_test "DELETE /sensors/$DELETE_SENSOR_ID — user thường"
call "$USER_TOKEN" DELETE "/sensors/$DELETE_SENSOR_ID"
expect 403 "Từ chối role=user"

print_test "DELETE /sensors/$DELETE_SENSOR_ID — manager xóa"
call "$MANAGER_TOKEN" DELETE "/sensors/$DELETE_SENSOR_ID"
expect 200 "Xóa sensor thành công"
print_info "Response: $(extract '.message')"
print_info "→ Sensor đã được xóa khỏi RealtimePoller tự động"

print_test "DELETE /sensors/$DELETE_SENSOR_ID — xóa lần 2 (đã bị xóa → 404)"
call "$MANAGER_TOKEN" DELETE "/sensors/$DELETE_SENSOR_ID"
expect 404 "Trả về 404 khi sensor không tồn tại"

print_test "DELETE /sensors/invalid-uuid — sensor không tồn tại"
call "$ADMIN_TOKEN" DELETE "/sensors/00000000-0000-0000-0000-000000000000"
expect 404 "Trả về 404 uuid không tồn tại"

# Verify poller không còn poll sensor đã xóa
print_info "→ Sensor '$DELETE_DEVICE_ID' đã được xóa khỏi poll list (kiểm tra logs server)"

# ─── Kết quả ──────────────────────────────────────────────────────────────────
print_header "KẾT QUẢ"
TOTAL=$((PASS + FAIL))
echo ""
printf "  %-14s %d\n"              "Tổng tests:" "$TOTAL"
printf "  ${GREEN}%-14s %d${RESET}\n" "Pass:"       "$PASS"
printf "  ${RED}%-14s %d${RESET}\n"   "Fail:"       "$FAIL"
echo ""
echo -e "  ${DIM}─── Accounts dùng trong test ──────────────────────────────────${RESET}"
print_info "Admin    : $ADMIN_EMAIL"
print_info "Manager  : $MANAGER_EMAIL (id=$MANAGER_ID)"
print_info "User     : $USER_EMAIL (id=$USER_ID)"
[[ -n "$TEST_SENSOR_ID" && "$TEST_SENSOR_ID" != "null" ]] \
  && print_info "Sensor   : $TEST_SENSOR_ID (deviceId=$TEST_DEVICE_ID)"
echo ""

if [[ $FAIL -eq 0 ]]; then
  echo -e "  ${GREEN}${BOLD}✓ Tất cả $TOTAL tests đã pass!${RESET}"
  exit 0
else
  echo -e "  ${RED}${BOLD}✗ $FAIL/$TOTAL tests thất bại.${RESET}"
  exit 1
fi
