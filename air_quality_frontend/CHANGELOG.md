# CHANGELOG

## [Unreleased] — 2025-04-13

### Bug Fixes

---

#### Bug 1 — Heatmap luôn trống do bucket key không bao giờ match

**File:** `src/components/dashboard/Heatmap.tsx`  
**Mức độ:** 🔴 Nghiêm trọng — toàn bộ heatmap PM2.5 không hiển thị dữ liệu

**Nguyên nhân:**  
Hàm `useMemo` tạo bucket dùng `s.deviceId || s.sensorId` làm key (ví dụ:
`"ESP32_Sensor_001"`). Khi tìm data, lại lookup bằng `dp.sensorId` — là
`sensor_node` tag từ InfluxDB thường ở dạng lowercase (`"esp32_sensor_001"`).
Hai chuỗi khác nhau về case → `buckets[sid]` luôn `undefined` → heatmap trắng.

**Fix:**  
Normalize cả hai phía về lowercase trước khi dùng làm key:
```typescript
// Trước (bug):
buckets[s.deviceId || s.sensorId] = {};   // "ESP32_Sensor_001"
const sid = dp.sensorId;                   // "esp32_sensor_001" → không match

// Sau (fix):
buckets[(s.deviceId || s.sensorId).toLowerCase()] = {};
const sid = (dp.deviceId ?? dp.sensorId).toLowerCase();  // khớp
```

---

#### Bug 2 — WebSocket subscribe sai ID, không nhận được realtime data

**File:** `src/pages/Index.tsx`  
**Mức độ:** 🔴 Nghiêm trọng — mất hoàn toàn luồng dữ liệu realtime

**Nguyên nhân:**  
```typescript
// Trước (bug):
const sensorIds = sensors.map(s => s.sensorId);  // UUID: "abc-123-def-456"
```
`Sensor.sensorId` là UUID nội bộ do DB sinh ra, không liên quan InfluxDB.
Backend WebSocket nhận `sensor_node` tag (= `Sensor.deviceId`, ví dụ
`"esp32_sensor_001"`) để subscribe. Gửi UUID → backend không tìm được sensor
→ không gửi data về → `isConnected = true` nhưng data luôn rỗng.

**Fix:**  
```typescript
// Sau (fix):
const sensorIds = sensors.map(s => s.deviceId).filter(Boolean);  // "esp32_sensor_001"
```

---

#### Bug 3 — ForecastTable AQI badge hiển thị level sai

**File:** `src/components/dashboard/ForecastTable.tsx`  
**Mức độ:** 🟡 Trung bình — badge sai nhãn mức độ ô nhiễm

**Nguyên nhân:**  
```typescript
// Trước (bug):
const level = aqi != null ? getAqiLevel(p["PM2.5_fc"] ?? 0) : null;
```
`getAqiLevel(x)` so sánh `x` với các ngưỡng AQI (0–50, 51–100, 101–150…).
Truyền vào `PM2.5_fc` (giá trị µg/m³, ví dụ `30`) → function thấy `30 ≤ 50`
→ trả về `"Tốt"`. Nhưng `AQI_fc = 160` → thực ra là `"Không tốt"`. Badge
sai hoàn toàn trong các tình huống model dự báo AQI cao nhưng PM2.5 tương
đối thấp.

**Fix:**  
```typescript
// Sau (fix): truyền trực tiếp AQI_fc
const level = aqi != null ? getAqiLevel(aqi) : null;
```

---

#### Bug 4 — `fmtTime` mất ngày, chart/table không phân biệt các ngày khác nhau

**File:** `src/components/dashboard/utils.ts`  
**Mức độ:** 🟡 Trung bình — timeline của chart 24h/7d/30d hiển thị sai

**Nguyên nhân:**  
```typescript
// Trước (bug):
export function fmtTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}
```
Luôn chỉ format `HH:MM`. Với khoảng `24h`, `7d`, `30d`, các điểm ở ngày
khác nhau nhưng cùng giờ sẽ có timestamp giống hệt nhau → trục X bị trùng,
tooltip sai, forecast table không phân biệt ngày.

**Fix:**  
Thêm param `timeRange` optional, tự động chọn format phù hợp:
```typescript
export function fmtTime(
  isoString: string,
  timeRange?: "1h" | "24h" | "7d" | "30d",
): string {
  const d = new Date(isoString);
  if (!timeRange || timeRange === "1h") return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  if (timeRange === "24h")              return d.toLocaleString("vi-VN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  return d.toLocaleString("vi-VN", { month: "2-digit", day: "2-digit", hour: "2-digit" });
}
```
Backward compatible — caller không truyền `timeRange` vẫn nhận HH:MM.

---

### Tests Added

**File:** `src/test/__tests__/bugfixes.test.ts`  
21 test cases covering tất cả 4 bug:

| Nhóm | Tests | Mô tả |
|---|---|---|
| Bug 1 — Heatmap key | 5 | Case mismatch, dp.deviceId vs sensorId, average, unknown sensor |
| Bug 2 — WebSocket IDs | 4 | deviceId mapping, không chứa UUID, filter rỗng, mảng rỗng |
| Bug 3 — AQI badge | 8 | AQI level boundaries, calcAQI integration, regression case |
| Bug 4 — fmtTime | 7 | Ngày xuất hiện cho 24h/7d/30d, backward compat, khác ngày ≠ khác giờ |

---

### Files Changed

| File | Thay đổi |
|---|---|
| `src/components/dashboard/utils.ts` | `fmtTime` thêm param `timeRange`, format ngày theo range |
| `src/components/dashboard/Heatmap.tsx` | Normalize bucket key và dp key về lowercase |
| `src/components/dashboard/ForecastTable.tsx` | AQI badge dùng `AQI_fc` thay `PM2.5_fc` |
| `src/pages/Index.tsx` | WebSocket `sensorIds` dùng `s.deviceId` thay `s.sensorId` |
| `src/test/__tests__/bugfixes.test.ts` | **New** — 21 regression tests |
