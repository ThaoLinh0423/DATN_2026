import { C, STATUS_LABEL, STATUS_COLOR } from "./constants";
import { calcAQI, getAqiLevel, fmtTime } from "./utils";
import { Sensor } from "@/hooks/useApi";

interface SensorRow {
  s: Sensor;
  latest: { timestamp: string; values: { pm1?: number; pm25?: number; pm10?: number } } | undefined;
  pm25: number;
  hasRt: boolean;
}

interface SensorTableProps {
  rows: SensorRow[];
}

const HEADERS = ["Tên", "Device ID", "PM1", "PM2.5", "PM10", "AQI", "Trạng thái", "Cập nhật"];

export function SensorTable({ rows }: SensorTableProps) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${C.border}` }}>
            {HEADERS.map(h => (
              <th key={h} style={{
                textAlign: "left", padding: "6px 10px", fontSize: 10,
                fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px",
                color: C.muted, whiteSpace: "nowrap",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ textAlign: "center", padding: "32px", color: C.muted, fontSize: 13 }}>
                Chọn cảm biến để hiển thị dữ liệu.
              </td>
            </tr>
          ) : rows.map(({ s, latest, pm25, hasRt }) => {
            const level = getAqiLevel(calcAQI(pm25));
            return (
              <tr
                key={s.sensorId}
                style={{ borderBottom: `1px solid ${C.border}` }}
                onMouseEnter={e => (e.currentTarget.style.background = C.bg)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <td style={{ padding: "8px 10px", fontWeight: 600, color: C.text }}>
                  {s.name}
                  {hasRt && (
                    <span style={{
                      marginLeft: 6, width: 6, height: 6, borderRadius: "50%",
                      background: "#00875a", display: "inline-block", verticalAlign: "middle",
                    }} />
                  )}
                </td>
                <td style={{ padding: "8px 10px" }}>
                  <code style={{ fontSize: 10, background: C.bg, padding: "1px 5px", borderRadius: 3 }}>
                    {s.deviceId || "—"}
                  </code>
                </td>
                <td style={{ padding: "8px 10px", fontFamily: "monospace", fontWeight: 600, color: C.pm1 }}>
                  {latest ? (latest.values.pm1 ?? 0).toFixed(1) : "—"}
                </td>
                <td style={{ padding: "8px 10px", fontFamily: "monospace", fontWeight: 600, color: C.pm25 }}>
                  {latest ? pm25.toFixed(1) : "—"}
                </td>
                <td style={{ padding: "8px 10px", fontFamily: "monospace", fontWeight: 600, color: C.pm10 }}>
                  {latest ? (latest.values.pm10 ?? 0).toFixed(1) : "—"}
                </td>
                <td style={{ padding: "8px 10px" }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
                    background: level.bg, color: level.color,
                  }}>{level.label}</span>
                </td>
                <td style={{ padding: "8px 10px" }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
                    background: `${STATUS_COLOR[s.status]}1a`, color: STATUS_COLOR[s.status],
                  }}>{STATUS_LABEL[s.status] ?? s.status}</span>
                </td>
                <td style={{ padding: "8px 10px", fontFamily: "monospace", fontSize: 11, color: C.muted }}>
                  {latest ? fmtTime(latest.timestamp) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
