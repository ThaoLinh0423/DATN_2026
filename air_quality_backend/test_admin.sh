#!/usr/bin/env bash
# =============================================================================
# test_admin.sh — Test Admin API (quản lý users & phân quyền)
# Chạy: bash test_admin.sh
# Yêu cầu: curl, jq
#
# Env vars:
#   BASE_URL        — mặc định http://localhost:8088/v1
#   ADMIN_EMAIL     — email tài khoản admin (khớp ADMIN_EMAIL trong .env)
#   ADMIN_PASSWORD  — mật khẩu admin (khớp ADMIN_PASSWORD trong .env)
#   TEST_EMAIL      — email user thường để test phân quyền (tự tạo nếu chưa có)
#   TEST_PASS       — mật khẩu user thường
#
# Ví dụ:
#   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=Admin@123456 bash test_admin.sh
# =============================================================================

set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:8088/v1}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin@123456}"
TEST_EMAIL="${TEST_EMAIL:-testuser_$(date +%s)@example.com}"
TEST_PASS="${TEST_PASS:-Password123!}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'

PASS=0; FAIL=0
ADMIN_TOKEN=""
USER_TOKEN=""
TARGET_USER_ID=""   # userId của test user — dùng để test PATCH role
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

# call TOKEN METHOD PATH [BODY]
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

# ─── 0. Dependencies & config ─────────────────────────────────────────────────
print_header "Kiểm tra dependencies"
for dep in curl jq; do
  command -v "$dep" &>/dev/null && print_ok "$dep đã cài" || { print_fail "$dep chưa cài"; exit 1; }
done
print_info "Base URL     : $BASE_URL"
print_info "Admin email  : $ADMIN_EMAIL"
print_info "Test user    : $TEST_EMAIL"

# ─── 1. Đăng nhập admin ───────────────────────────────────────────────────────
print_header "1. Đăng nhập admin"

print_test "POST /auth/login — admin credentials"
call "" POST /auth/login "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}"
expect 200 "Admin đăng nhập thành công"
ADMIN_TOKEN=$(extract '.accessToken')
ADMIN_ROLE=$(extract '.role // empty' 2>/dev/null || echo "")

if [[ -z "$ADMIN_TOKEN" || "$ADMIN_TOKEN" == "null" ]]; then
  echo -e "${RED}Không lấy được admin token — dừng.${RESET}"
  echo -e "${DIM}Kiểm tra ADMIN_EMAIL / ADMIN_PASSWORD hoặc chạy server với ADMIN_EMAIL set trong .env${RESET}"
  exit 1
fi
print_info "Admin token  : ${ADMIN_TOKEN:0:40}..."

# Verify role từ GET /users/me
call "$ADMIN_TOKEN" GET /users/me
ADMIN_ROLE=$(extract '.role')
print_info "Admin role   : $ADMIN_ROLE"
if [[ "$ADMIN_ROLE" != "admin" ]]; then
  echo -e "${RED}Tài khoản $ADMIN_EMAIL không có role admin (role=$ADMIN_ROLE) — dừng.${RESET}"
  exit 1
fi

# ─── 2. Tạo test user (role=user) ─────────────────────────────────────────────
print_header "2. Chuẩn bị test user"

print_test "POST /auth/register — tạo user thường"
call "" POST /auth/register \
  "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\",\"timezone\":\"Asia/Ho_Chi_Minh\"}"
if   [[ "$HTTP_CODE" == "201" ]]; then print_ok "Tạo user mới (HTTP 201)"
elif [[ "$HTTP_CODE" == "400" ]]; then print_info "User đã tồn tại — dùng lại (HTTP 400)"; PASS=$((PASS+1))
else print_fail "Register — expected 201/400, got $HTTP_CODE"; fi

print_test "POST /auth/login — lấy token của test user"
call "" POST /auth/login "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}"
expect 200 "Test user đăng nhập thành công"
USER_TOKEN=$(extract '.accessToken')
[[ -z "$USER_TOKEN" || "$USER_TOKEN" == "null" ]] && { echo -e "${RED}Không lấy được user token.${RESET}"; exit 1; }

call "$USER_TOKEN" GET /users/me
TARGET_USER_ID=$(extract '.userId')
TARGET_ROLE=$(extract '.role')
print_info "Test userId  : $TARGET_USER_ID"
print_info "Test role    : $TARGET_ROLE"

# ─── 3. GET /admin/users — danh sách users ────────────────────────────────────
print_header "3. GET /admin/users"

print_test "GET /admin/users — không có token"
call "" GET /admin/users
expect 401 "Từ chối thiếu token"

print_test "GET /admin/users — token của user thường"
call "$USER_TOKEN" GET /admin/users
expect 403 "Từ chối role=user"

print_test "GET /admin/users — token admin (lấy tất cả)"
call "$ADMIN_TOKEN" GET /admin/users
expect 200 "Admin lấy danh sách thành công"
TOTAL=$(extract '.total')
COUNT=$(extract '.data | length')
print_info "Total users: $TOTAL | Trong trang: $COUNT"
echo "$HTTP_BODY" | jq '.data[] | {userId,email,role}' 2>/dev/null || true

print_test "GET /admin/users?role=user"
call "$ADMIN_TOKEN" GET "/admin/users?role=user"
expect 200 "Lọc theo role=user"
print_info "Users với role=user: $(extract '.total')"

print_test "GET /admin/users?role=admin"
call "$ADMIN_TOKEN" GET "/admin/users?role=admin"
expect 200 "Lọc theo role=admin"
print_info "Users với role=admin: $(extract '.total')"

print_test "GET /admin/users?limit=1 — phân trang"
call "$ADMIN_TOKEN" GET "/admin/users?limit=1"
expect 200 "Phân trang limit=1"
NEXT_CURSOR=$(extract '.nextCursor')
print_info "nextCursor: $NEXT_CURSOR"
if [[ -n "$NEXT_CURSOR" && "$NEXT_CURSOR" != "null" ]]; then
  print_test "GET /admin/users?limit=1&cursor=$NEXT_CURSOR — trang tiếp theo"
  call "$ADMIN_TOKEN" GET "/admin/users?limit=1&cursor=$NEXT_CURSOR"
  expect 200 "Cursor pagination trang 2"
  print_info "Users trang 2: $(extract '.data | length')"
fi

# ─── 4. GET /admin/users/:userId — chi tiết user ──────────────────────────────
print_header "4. GET /admin/users/:userId"

if [[ -n "$TARGET_USER_ID" && "$TARGET_USER_ID" != "null" ]]; then
  print_test "GET /admin/users/$TARGET_USER_ID — admin xem chi tiết"
  call "$ADMIN_TOKEN" GET "/admin/users/$TARGET_USER_ID"
  expect 200 "Admin xem chi tiết user"
  echo "$HTTP_BODY" | jq '{userId,email,role,name}' 2>/dev/null || true

  print_test "GET /admin/users/$TARGET_USER_ID — user thường không được xem"
  call "$USER_TOKEN" GET "/admin/users/$TARGET_USER_ID"
  expect 403 "Từ chối role=user"

  print_test "GET /admin/users/invalid-uuid — user không tồn tại"
  call "$ADMIN_TOKEN" GET "/admin/users/00000000-0000-0000-0000-000000000000"
  expect 404 "Trả về 404 khi không tìm thấy"
else
  print_skip "GET /admin/users/:userId — không có TARGET_USER_ID"
fi

# ─── 5. PATCH /admin/users/:userId/role ───────────────────────────────────────
print_header "5. PATCH /admin/users/:userId/role"

if [[ -z "$TARGET_USER_ID" || "$TARGET_USER_ID" == "null" ]]; then
  print_skip "Toàn bộ PATCH role tests — không có TARGET_USER_ID"
else
  # ── Kiểm tra quyền ──
  print_test "PATCH role — không có token"
  call "" PATCH "/admin/users/$TARGET_USER_ID/role" '{"role":"manager"}'
  expect 401 "Từ chối thiếu token"

  print_test "PATCH role — token user thường"
  call "$USER_TOKEN" PATCH "/admin/users/$TARGET_USER_ID/role" '{"role":"manager"}'
  expect 403 "Từ chối role=user"

  # ── Validation body ──
  print_test "PATCH role — role không hợp lệ"
  call "$ADMIN_TOKEN" PATCH "/admin/users/$TARGET_USER_ID/role" '{"role":"superadmin"}'
  expect 400 "Từ chối role không hợp lệ (superadmin)"

  print_test "PATCH role — thiếu field role"
  call "$ADMIN_TOKEN" PATCH "/admin/users/$TARGET_USER_ID/role" '{}'
  expect 400 "Từ chối thiếu field role"

  # ── Nâng lên manager ──
  print_test "PATCH role — nâng $TEST_EMAIL lên manager"
  call "$ADMIN_TOKEN" PATCH "/admin/users/$TARGET_USER_ID/role" '{"role":"manager"}'
  expect 200 "Đổi role thành manager thành công"
  NEW_ROLE=$(extract '.role')
  print_info "Role mới: $NEW_ROLE"
  [[ "$NEW_ROLE" == "manager" ]] && print_ok "role=manager đúng trong response" || print_fail "role trong response không đúng: $NEW_ROLE"

  # Verify qua GET
  print_test "GET /admin/users/$TARGET_USER_ID — verify role đã thay đổi trong DB"
  call "$ADMIN_TOKEN" GET "/admin/users/$TARGET_USER_ID"
  expect 200 "Lấy thông tin sau khi đổi role"
  DB_ROLE=$(extract '.role')
  [[ "$DB_ROLE" == "manager" ]] && print_ok "DB lưu role=manager đúng" || print_fail "DB role không khớp: $DB_ROLE"

  # Verify JWT refresh lấy role mới
  print_test "POST /auth/refresh — JWT mới phản ánh role=manager"
  call "" POST /auth/login "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}"
  expect 200 "Đăng nhập lại sau khi đổi role"
  NEW_USER_TOKEN=$(extract '.accessToken')
  call "$NEW_USER_TOKEN" GET /users/me
  JWT_ROLE=$(extract '.role')
  print_info "Role trong JWT mới: $JWT_ROLE"
  [[ "$JWT_ROLE" == "manager" ]] && print_ok "JWT mới có role=manager" || print_fail "JWT role không khớp: $JWT_ROLE"

  # ── Nâng lên admin ──
  print_test "PATCH role — nâng $TEST_EMAIL lên admin"
  call "$ADMIN_TOKEN" PATCH "/admin/users/$TARGET_USER_ID/role" '{"role":"admin"}'
  expect 200 "Đổi role thành admin thành công"
  print_info "Role mới: $(extract '.role')"

  # ── Hạ xuống user ──
  print_test "PATCH role — hạ $TEST_EMAIL về user"
  call "$ADMIN_TOKEN" PATCH "/admin/users/$TARGET_USER_ID/role" '{"role":"user"}'
  expect 200 "Hạ role về user thành công"
  FINAL_ROLE=$(extract '.role')
  [[ "$FINAL_ROLE" == "user" ]] && print_ok "Đã hạ về role=user" || print_fail "role không khớp: $FINAL_ROLE"

  # ── Admin không tự đổi role mình ──
  print_test "PATCH role — admin tự đổi role của chính mình (phải bị chặn)"
  ADMIN_ID=$(extract '.userId' <<< "$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "${BASE_URL}/users/me")")
  call "$ADMIN_TOKEN" PATCH "/admin/users/$ADMIN_ID/role" '{"role":"user"}'
  expect 403 "Từ chối admin tự hạ quyền mình (self-update)"
  print_info "error.message: $(extract '.error.message')"

  # ── User không tồn tại ──
  print_test "PATCH role — userId không tồn tại"
  call "$ADMIN_TOKEN" PATCH "/admin/users/00000000-0000-0000-0000-000000000000/role" '{"role":"manager"}'
  expect 404 "Trả về 404 khi user không tồn tại"
fi

# ─── 6. Seed admin mặc định ───────────────────────────────────────────────────
print_header "6. Seed admin mặc định"

print_test "Verify tài khoản admin từ ADMIN_EMAIL/ADMIN_PASSWORD trong .env đã tồn tại"
call "" POST /auth/login "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}"
expect 200 "Admin seed account đăng nhập được"
SEEDED_ROLE=$(extract '.role // empty' 2>/dev/null)
# role nằm trong JWT claims, cần decode hoặc gọi /users/me
SEED_TOKEN=$(extract '.accessToken')
if [[ -n "$SEED_TOKEN" && "$SEED_TOKEN" != "null" ]]; then
  call "$SEED_TOKEN" GET /users/me
  SEEDED_ROLE=$(extract '.role')
  print_info "Seeded admin role: $SEEDED_ROLE"
  [[ "$SEEDED_ROLE" == "admin" ]] \
    && print_ok "Seed admin có role=admin đúng" \
    || print_fail "Seed admin role không đúng: $SEEDED_ROLE"
fi

# ─── Kết quả ──────────────────────────────────────────────────────────────────
print_header "KẾT QUẢ"
TOTAL=$((PASS + FAIL))
echo ""
printf "  %-14s %d\n"              "Tổng tests:" "$TOTAL"
printf "  ${GREEN}%-14s %d${RESET}\n" "Pass:"       "$PASS"
printf "  ${RED}%-14s %d${RESET}\n"   "Fail:"       "$FAIL"
echo ""

if [[ $FAIL -eq 0 ]]; then
  echo -e "  ${GREEN}${BOLD}✓ Tất cả $TOTAL admin tests đã pass!${RESET}"
  exit 0
else
  echo -e "  ${RED}${BOLD}✗ $FAIL/$TOTAL tests thất bại.${RESET}"
  exit 1
fi
