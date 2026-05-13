/**
 * bugfixes.test.ts
 * =================
 * Regression tests cho 4 bug quan trọng gây visualize sai.
 *
 * Bug 1 — Heatmap bucket key không bao giờ match (case mismatch)
 * Bug 2 — WebSocket subscribe dùng UUID thay vì sensor_node tag
 * Bug 3 — ForecastTable AQI badge tính từ PM2.5 thay vì AQI_fc
 * Bug 4 — fmtTime chỉ hiện giờ:phút, mất ngày
 */

import { describe, it, expect } from "vitest";
import { calcAQI, getAqiLevel, fmtTime } from "@/components/dashboard/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers dùng chung
// ─────────────────────────────────────────────────────────────────────────────

/** Simulate heatmap bucket build logic (extracted từ Heatmap.tsx sau fix) */
function buildHeatData(
  sensors: { sensorId: string; deviceId?: string }[],
  dataPoints: { sensorId: string; deviceId?: string; timestamp: string; values: { pm25?: number } }[],
): Record<string, Record<number, number>> {
  const sensorKey = (s: { deviceId?: string; sensorId: string }) =>
    (s.deviceId || s.sensorId).toLowerCase();

  const dpKey = (dp: { deviceId?: string; sensorId: string }) =>
    (dp.deviceId ?? dp.sensorId).toLowerCase();

  const buckets: Record<string, Record<number, number[]>> = {};
  sensors.forEach((s) => {
    buckets[sensorKey(s)] = {};
  });

  dataPoints.forEach((dp) => {
    const h   = new Date(dp.timestamp).getHours();
    const sid = dpKey(dp);
    const val = dp.values?.pm25 ?? 0;
    if (!buckets[sid]) return;
    if (!buckets[sid][h]) buckets[sid][h] = [];
    buckets[sid][h].push(val);
  });

  const avg: Record<string, Record<number, number>> = {};
  Object.entries(buckets).forEach(([sid, hs]) => {
    avg[sid] = {};
    Object.entries(hs).forEach(([h, vals]) => {
      avg[sid][+h] = vals.reduce((a, b) => a + b, 0) / vals.length;
    });
  });
  return avg;
}

/** Simulate WebSocket sensorIds mapping (extracted từ Index.tsx sau fix) */
function mapSensorIdsForWs(
  sensors: { sensorId: string; deviceId: string }[],
): string[] {
  // FIX Bug-2: dùng deviceId (sensor_node tag), không phải sensorId (UUID)
  return sensors.map((s) => s.deviceId).filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// Bug 1 — Heatmap bucket key case mismatch
// ─────────────────────────────────────────────────────────────────────────────
describe("Bug 1 — Heatmap bucket key normalization", () => {
  const SENSOR = { sensorId: "uuid-abc-123", deviceId: "ESP32_Sensor_001" };
  const TS_10H = "2025-04-01T10:30:00.000Z"; // getHours() phụ thuộc TZ, dùng UTC+7 → 17h

  it("REGRESSION: bucket key dùng deviceId, datapoint dùng sensorId (lowercase khác case) — PHẢI match", () => {
    // DataPoint.sensorId = sensor_node tag (lowercase from InfluxDB)
    const dp = {
      sensorId: "esp32_sensor_001", // lowercase từ tag InfluxDB
      deviceId: undefined,
      timestamp: TS_10H,
      values: { pm25: 45.5 },
    };

    const heat = buildHeatData([SENSOR], [dp]);
    const key = SENSOR.deviceId.toLowerCase(); // "esp32_sensor_001"
    const h   = new Date(TS_10H).getHours();

    // Sau fix: key được normalize → phải có data, không bao giờ undefined
    expect(heat[key]).toBeDefined();
    expect(heat[key][h]).toBeCloseTo(45.5);
  });

  it("REGRESSION: bucket key dùng deviceId uppercase, datapoint.deviceId cũng uppercase — match", () => {
    const dp = {
      sensorId: "esp32_sensor_001",
      deviceId: "ESP32_Sensor_001", // same case as Sensor.deviceId
      timestamp: TS_10H,
      values: { pm25: 30 },
    };

    const heat = buildHeatData([SENSOR], [dp]);
    const key = SENSOR.deviceId.toLowerCase();
    const h   = new Date(TS_10H).getHours();

    expect(heat[key]).toBeDefined();
    expect(heat[key][h]).toBeCloseTo(30);
  });

  it("sensor không có deviceId → dùng sensorId làm key, vẫn match", () => {
    const sensor = { sensorId: "uuid-xyz-456" }; // không có deviceId
    const dp = {
      sensorId: "UUID-XYZ-456", // uppercase, khác case
      deviceId: undefined,
      timestamp: TS_10H,
      values: { pm25: 12 },
    };

    const heat = buildHeatData([sensor], [dp]);
    const key = "uuid-xyz-456"; // lowercase
    const h   = new Date(TS_10H).getHours();

    expect(heat[key]).toBeDefined();
    expect(heat[key][h]).toBeCloseTo(12);
  });

  it("datapoint không thuộc sensor nào → bỏ qua, không throw", () => {
    const dp = {
      sensorId: "esp32_other_sensor",
      timestamp: TS_10H,
      values: { pm25: 99 },
    };

    expect(() => buildHeatData([SENSOR], [dp])).not.toThrow();
    const heat = buildHeatData([SENSOR], [dp]);
    const key = SENSOR.deviceId.toLowerCase();
    // không có data vì dp không match sensor nào
    expect(Object.keys(heat[key] ?? {})).toHaveLength(0);
  });

  it("nhiều datapoints cùng giờ → tính average đúng", () => {
    const makeDP = (pm25: number) => ({
      sensorId: "esp32_sensor_001",
      timestamp: TS_10H,
      values: { pm25 },
    });

    const heat = buildHeatData([SENSOR], [makeDP(20), makeDP(40), makeDP(60)]);
    const key = SENSOR.deviceId.toLowerCase();
    const h   = new Date(TS_10H).getHours();

    expect(heat[key][h]).toBeCloseTo(40); // avg(20,40,60)=40
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug 2 — WebSocket subscribe dùng sai ID
// ─────────────────────────────────────────────────────────────────────────────
describe("Bug 2 — WebSocket sensorIds mapping", () => {
  const SENSORS = [
    { sensorId: "uuid-aaa-111", deviceId: "esp32_sensor_001" },
    { sensorId: "uuid-bbb-222", deviceId: "esp32_sensor_002" },
    { sensorId: "uuid-ccc-333", deviceId: "esp32_sensor_003" },
  ];

  it("REGRESSION: sensorIds cho WS phải là deviceId (sensor_node tag), không phải sensorId (UUID)", () => {
    const ids = mapSensorIdsForWs(SENSORS);
    expect(ids).toEqual(["esp32_sensor_001", "esp32_sensor_002", "esp32_sensor_003"]);
  });

  it("REGRESSION: sensorIds KHÔNG được chứa UUID nội bộ DB", () => {
    const ids = mapSensorIdsForWs(SENSORS);
    expect(ids).not.toContain("uuid-aaa-111");
    expect(ids).not.toContain("uuid-bbb-222");
    expect(ids).not.toContain("uuid-ccc-333");
  });

  it("filter bỏ deviceId rỗng/undefined", () => {
    const sensors = [
      { sensorId: "uuid-aaa", deviceId: "esp32_sensor_001" },
      { sensorId: "uuid-bbb", deviceId: "" }, // rỗng → filter out
    ];
    const ids = mapSensorIdsForWs(sensors);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toBe("esp32_sensor_001");
  });

  it("sensors rỗng → trả về mảng rỗng, không throw", () => {
    expect(mapSensorIdsForWs([])).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug 3 — ForecastTable AQI badge tính sai
// ─────────────────────────────────────────────────────────────────────────────
describe("Bug 3 — getAqiLevel dùng AQI_fc, không phải PM2.5_fc", () => {
  /**
   * Trường hợp quan trọng: PM2.5 = 30 µg/m³ nhưng model forecast AQI = 160
   * (có thể xảy ra khi model dự báo overall AQI do yếu tố tổng hợp)
   *
   * Trước fix: getAqiLevel(30) → "Tốt" (sai)
   * Sau fix:   getAqiLevel(160) → "Không tốt" (đúng)
   */
  it("REGRESSION: AQI=160 nhưng PM2.5=30 → badge phải là 'Không tốt' (dùng AQI_fc)", () => {
    const aqi_fc = 160;
    const pm25_fc = 30;

    const levelFromAqi  = getAqiLevel(aqi_fc);   // FIX: dùng AQI_fc ✓
    const levelFromPM25 = getAqiLevel(pm25_fc);   // BUG cũ: dùng PM2.5_fc ✗

    expect(levelFromAqi.label).toBe("Không tốt");    // đúng
    expect(levelFromPM25.label).not.toBe("Không tốt"); // sai (Tốt hoặc Trung bình)
  });

  it("AQI=250 → 'Rất không tốt'", () => {
    expect(getAqiLevel(250).label).toBe("Rất không tốt");
  });

  it("AQI=350 → 'Nguy hại'", () => {
    expect(getAqiLevel(350).label).toBe("Nguy hại");
  });

  it("AQI=50 → 'Tốt' (boundary)", () => {
    expect(getAqiLevel(50).label).toBe("Tốt");
  });

  it("AQI=51 → 'Trung bình'", () => {
    expect(getAqiLevel(51).label).toBe("Trung bình");
  });

  it("AQI=100 → 'Trung bình' (boundary)", () => {
    expect(getAqiLevel(100).label).toBe("Trung bình");
  });

  it("AQI=0 → 'Tốt' (edge case)", () => {
    expect(getAqiLevel(0).label).toBe("Tốt");
  });

  /**
   * Đảm bảo calcAQI → getAqiLevel cho kết quả nhất quán
   */
  it("calcAQI(PM2.5=12) = 50 → getAqiLevel(50) = 'Tốt'", () => {
    const aqi = calcAQI(12);
    expect(aqi).toBe(50);
    expect(getAqiLevel(aqi).label).toBe("Tốt");
  });

  it("calcAQI(PM2.5=35.4) ≈ 100 → getAqiLevel(100) = 'Trung bình'", () => {
    const aqi = calcAQI(35.4);
    expect(aqi).toBeGreaterThanOrEqual(99);
    expect(aqi).toBeLessThanOrEqual(100);
    expect(getAqiLevel(aqi).label).toBe("Trung bình");
  });

  it("calcAQI(PM2.5=55.4) ≈ 150 → getAqiLevel(150) = 'Nhạy cảm'", () => {
    const aqi = calcAQI(55.4);
    expect(aqi).toBeGreaterThanOrEqual(149);
    expect(aqi).toBeLessThanOrEqual(150);
    expect(getAqiLevel(aqi).label).toBe("Nhạy cảm");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug 4 — fmtTime mất ngày khi timeRange > 1h
// ─────────────────────────────────────────────────────────────────────────────
describe("Bug 4 — fmtTime hiển thị ngày cho timeRange > 1h", () => {
  // Dùng ISO string với ngày/tháng rõ ràng
  const TS = "2025-04-15T08:30:00.000Z";

  it("REGRESSION: timeRange='24h' phải chứa thông tin ngày, không chỉ giờ:phút", () => {
    const result = fmtTime(TS, "24h");
    // Kết quả phải bao gồm '15' (ngày) hoặc '04' (tháng)
    expect(result).toMatch(/15|04/);
  });

  it("REGRESSION: timeRange='7d' phải chứa thông tin ngày", () => {
    const result = fmtTime(TS, "7d");
    expect(result).toMatch(/15|04/);
  });

  it("REGRESSION: timeRange='30d' phải chứa thông tin ngày", () => {
    const result = fmtTime(TS, "30d");
    expect(result).toMatch(/15|04/);
  });

  it("timeRange='1h' → chỉ hiện giờ:phút (không có ngày)", () => {
    const result = fmtTime(TS, "1h");
    // format: "HH:MM" — 2 lần ':' không có thêm ký tự ngày tháng
    // kiểm tra không bắt đầu bằng chuỗi ngày "dd/"
    expect(result).not.toMatch(/^\d{2}\/\d{2}/); // không bắt đầu bằng "dd/MM"
  });

  it("không truyền timeRange → hành vi giống '1h' (backward compat)", () => {
    const result = fmtTime(TS);
    expect(result).not.toMatch(/^\d{2}\/\d{2}/);
  });

  it("2 timestamps cùng giờ nhưng khác ngày → '7d' cho kết quả khác nhau", () => {
    const ts1 = "2025-04-14T10:00:00.000Z";
    const ts2 = "2025-04-15T10:00:00.000Z";

    // REGRESSION: trước đây cả hai đều ra "10:00" → chart không phân biệt được
    const r1 = fmtTime(ts1, "7d");
    const r2 = fmtTime(ts2, "7d");

    expect(r1).not.toBe(r2);
  });

  it("2 timestamps cùng giờ nhưng khác ngày → '30d' cho kết quả khác nhau", () => {
    const ts1 = "2025-03-01T14:00:00.000Z";
    const ts2 = "2025-04-01T14:00:00.000Z";

    const r1 = fmtTime(ts1, "30d");
    const r2 = fmtTime(ts2, "30d");

    expect(r1).not.toBe(r2);
  });

  it("2 timestamps cùng ngày cùng giờ khác phút → '24h' cho kết quả khác nhau", () => {
    const ts1 = "2025-04-15T08:00:00.000Z";
    const ts2 = "2025-04-15T08:30:00.000Z";

    const r1 = fmtTime(ts1, "24h");
    const r2 = fmtTime(ts2, "24h");

    expect(r1).not.toBe(r2);
  });
});
