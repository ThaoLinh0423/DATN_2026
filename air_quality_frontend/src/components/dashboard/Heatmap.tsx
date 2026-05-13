import { useMemo } from "react";
import { C } from "./constants";

interface HeatmapProps {
  sensors: { sensorId: string; deviceId?: string; name?: string }[];
  dataPoints: {
    sensorId: string;
    deviceId?: string;
    sensorNode?: string;
    sensor_node?: string;
    device_id?: string;
    timestamp: string;
    values: {
      pm1?: number;
      pm1_0?: number;
      "PM1.0"?: number;
      pm25?: number;
      pm2_5?: number;
      "PM2.5"?: number;
      pm10?: number;
      PM10?: number;
    };
  }[];
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const METRICS = [
  { key: "pm1", label: "PM1.0", unit: "µg/m³", aliases: ["pm1", "pm1_0", "PM1.0"] },
  { key: "pm25", label: "PM2.5", unit: "µg/m³", aliases: ["pm25", "pm2_5", "PM2.5"] },
  { key: "pm10", label: "PM10", unit: "µg/m³", aliases: ["pm10", "PM10"] },
] as const;

type MetricKey = typeof METRICS[number]["key"];
type HeatData = Record<string, Record<MetricKey, Record<number, number>>>;

function cellColor(v: number): string {
  if (!v || v <= 0) return "#eef0f3";
  if (v < 12) return "#06d6a0";
  if (v < 35.4) return "#ffd166";
  if (v < 55.4) return "#f77f00";
  if (v < 150) return "#ef476f";
  return "#9d4edd";
}

function cellTextColor(v: number): string {
  if (!v || v <= 0) return "transparent";
  if (v < 35.4) return "#1e2a3a";
  return "#ffffff";
}

export function Heatmap({ sensors, dataPoints }: HeatmapProps) {
  const rows = sensors.slice(0, 7);

  const heatData = useMemo<HeatData>(() => {
    const sensorKey = (s: { deviceId?: string; sensorId: string }) =>
      (s.deviceId || s.sensorId).toLowerCase();

    const dpKey = (dp: HeatmapProps["dataPoints"][number]) =>
      (dp.deviceId ?? dp.device_id ?? dp.sensorNode ?? dp.sensor_node ?? dp.sensorId).toLowerCase();

    const buckets: Record<string, Record<MetricKey, Record<number, number[]>>> = {};
    rows.forEach(s => {
      buckets[sensorKey(s)] = { pm1: {}, pm25: {}, pm10: {} };
    });

    dataPoints.forEach(dp => {
      const h = new Date(dp.timestamp).getHours();
      const sid = dpKey(dp);
      const bucketKey = buckets[sid] ? sid : rows.length === 1 ? sensorKey(rows[0]) : null;
      if (!bucketKey) return;

      METRICS.forEach(metric => {
        const val = getMetricValue(dp.values, metric.aliases);
        if (!buckets[bucketKey][metric.key][h]) buckets[bucketKey][metric.key][h] = [];
        buckets[bucketKey][metric.key][h].push(val);
      });
    });

    const avg: HeatData = {};
    Object.entries(buckets).forEach(([sid, metrics]) => {
      avg[sid] = { pm1: {}, pm25: {}, pm10: {} };
      METRICS.forEach(metric => {
        Object.entries(metrics[metric.key]).forEach(([h, vals]) => {
          avg[sid][metric.key][+h] = vals.reduce((a, b) => a + b, 0) / vals.length;
        });
      });
    });

    return avg;
  }, [dataPoints, rows]);

  if (!rows.length) {
    return (
      <p style={{ textAlign: "center", color: C.muted, fontSize: 13, padding: "32px 0" }}>
        Chưa có dữ liệu
      </p>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: 620 }}>
        <div style={{ display: "grid", gridTemplateColumns: "92px 38px repeat(24,1fr)", gap: 3, marginBottom: 3 }}>
          <div />
          <div />
          {HOURS.map(h => (
            <div key={h} style={{ fontSize: 9, color: C.muted, textAlign: "center" }}>
              {h % 6 === 0 ? `${h}h` : ""}
            </div>
          ))}
        </div>

        {rows.map(sensor => {
          const key = (sensor.deviceId || sensor.sensorId).toLowerCase();
          return (
            <div key={sensor.sensorId} style={{ display: "grid", gridTemplateColumns: "92px 1fr", gap: 3, marginBottom: 8 }}>
              <div style={{
                height: 60,
                fontSize: 10,
                color: C.muted,
                textAlign: "right",
                paddingRight: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                overflow: "hidden",
              }}>
                <span style={{ maxWidth: 84, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {sensor.name?.slice(0, 13) ?? sensor.sensorId.slice(0, 8)}
                </span>
              </div>

              <div style={{ display: "grid", gap: 3 }}>
                {METRICS.map(metric => (
                  <div key={metric.key} style={{ display: "grid", gridTemplateColumns: "38px repeat(24,1fr)", gap: 3 }}>
                    <div style={{
                      height: 18,
                      lineHeight: "18px",
                      fontSize: 9,
                      fontWeight: 700,
                      color: C.muted,
                      textAlign: "right",
                      paddingRight: 2,
                    }}>
                      {metric.label}
                    </div>

                    {HOURS.map(h => {
                      const v = heatData[key]?.[metric.key]?.[h] ?? 0;
                      return (
                        <div
                          key={h}
                          title={`${sensor.name ?? sensor.sensorId} ${h}:00 - ${metric.label}: ${v.toFixed(1)} ${metric.unit}`}
                          style={{
                            height: 18,
                            borderRadius: 3,
                            cursor: "default",
                            background: cellColor(v),
                            opacity: v > 0 ? Math.max(0.3, Math.min(1, 0.3 + v / 120)) : 0.25,
                            color: cellTextColor(v),
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 8,
                            fontWeight: 700,
                            lineHeight: 1,
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {v > 0 ? Math.round(v) : ""}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 10, fontSize: 10, color: C.muted }}>
          <span>Thấp</span>
          {["#06d6a0", "#ffd166", "#f77f00", "#ef476f", "#9d4edd"].map((c, i) => (
            <div key={i} style={{ width: 22, height: 8, background: c, borderRadius: 2 }} />
          ))}
          <span>Cao</span>
          <span style={{ marginLeft: 8 }}>PM1.0 / PM2.5 / PM10 (µg/m³)</span>
        </div>
      </div>
    </div>
  );
}

function getMetricValue(
  values: HeatmapProps["dataPoints"][number]["values"] | undefined,
  aliases: readonly string[],
) {
  if (!values) return 0;

  for (const alias of aliases) {
    const value = values[alias as keyof typeof values];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }

  return 0;
}
