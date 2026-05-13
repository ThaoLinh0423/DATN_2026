import { AQI_LEVELS } from "./constants";

export function calcAQI(pm25: number): number {
  if (pm25 <= 12)    return Math.round(50  * pm25 / 12);
  if (pm25 <= 35.4)  return Math.round(50  + 50  * (pm25 - 12)    / 23.4);
  if (pm25 <= 55.4)  return Math.round(100 + 50  * (pm25 - 35.4)  / 20);
  if (pm25 <= 150.4) return Math.round(150 + 50  * (pm25 - 55.4)  / 95);
  if (pm25 <= 250.4) return Math.round(200 + 100 * (pm25 - 150.4) / 100);
  return Math.round(300 + 200 * (pm25 - 250.4) / 249.6);
}

export function getAqiLevel(aqi: number) {
  return AQI_LEVELS.find(l => aqi <= l.max) ?? AQI_LEVELS[AQI_LEVELS.length - 1];
}

export function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

/**
 * Format timestamp thành chuỗi hiển thị.
 * - "1h"          → HH:MM
 * - "24h"         → DD/MM HH:MM
 * - "7d" | "30d" → DD/MM HH:00
 *
 * @param isoString  ISO 8601 timestamp
 * @param timeRange  khoảng thời gian đang chọn (optional, default → chỉ giờ:phút)
 */
export function fmtTime(
  isoString: string,
  timeRange?: "1h" | "24h" | "7d" | "30d",
): string {
  const d = new Date(isoString);
  if (!timeRange || timeRange === "1h") {
    return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  }
  if (timeRange === "24h") {
    return d.toLocaleString("vi-VN", {
      month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  }
  // 7d / 30d — chỉ cần ngày + giờ (không cần phút vì bucket đã là 6h/24h)
  return d.toLocaleString("vi-VN", {
    month: "2-digit", day: "2-digit",
    hour: "2-digit",
  });
}
