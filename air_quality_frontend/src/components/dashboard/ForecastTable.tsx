import { C } from "./constants";
import { getAqiLevel } from "./utils";
import { ForecastChartPoint } from "./MLForecastSection";

interface ForecastTableProps {
  points: ForecastChartPoint[];
  isLoading?: boolean;
}

const COLS: { key: keyof ForecastChartPoint; label: string; color: string; unit: string; digits: number }[] = [
  { key: "AQI_fc",      label: "AQI",      color: C.aqi,  unit: "",       digits: 1 },
  { key: "PM1.0_fc",    label: "PM1.0",    color: C.pm1,  unit: "µg/m³",  digits: 2 },
  { key: "PM2.5_fc",    label: "PM2.5",    color: C.pm25, unit: "µg/m³",  digits: 2 },
  { key: "PM10_fc",     label: "PM10",     color: C.pm10, unit: "µg/m³",  digits: 2 },
];

export function ForecastTable({ points, isLoading }: ForecastTableProps) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${C.border}` }}>
            <th style={thStyle}>Thời gian</th>
            {COLS.map(c => (
              <th key={c.key} style={{ ...thStyle, color: c.color }}>
                {c.label}
                {c.unit && (
                  <span style={{ fontWeight: 400, color: C.muted, marginLeft: 3 }}>({c.unit})</span>
                )}
              </th>
            ))}
            <th style={thStyle}>Mức AQI</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={COLS.length + 2} style={{ textAlign: "center", padding: "28px", color: C.muted, fontSize: 12 }}>
                Đang tải dự báo...
              </td>
            </tr>
          ) : points.length === 0 ? (
            <tr>
              <td colSpan={COLS.length + 2} style={{ textAlign: "center", padding: "28px", color: C.muted, fontSize: 12 }}>
                Không có dữ liệu dự báo
              </td>
            </tr>
          ) : points.map((p, i) => {
            const aqi = p["AQI_fc"];
            const level = aqi != null ? getAqiLevel(aqi) : null;
            return (
              <tr
                key={p.timestamp + i}
                style={{ borderBottom: `1px solid ${C.border}` }}
                onMouseEnter={e => (e.currentTarget.style.background = C.bg)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <td style={{ padding: "7px 10px", fontFamily: "monospace", fontSize: 11, color: C.muted, whiteSpace: "nowrap" }}>
                  <span style={{
                    display: "inline-block", marginRight: 6,
                    fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
                    background: "rgba(0,120,212,0.08)", color: C.aqi,
                    border: `1px dashed ${C.aqi}`, verticalAlign: "middle",
                  }}>FC</span>
                  {p.time}
                </td>

                {COLS.map(c => {
                  const val = p[c.key] as number | undefined;
                  return (
                    <td key={c.key} style={{ padding: "7px 10px", fontFamily: "monospace", fontWeight: 600, color: c.color }}>
                      {val != null ? val.toFixed(c.digits) : <span style={{ color: C.muted }}>-</span>}
                    </td>
                  );
                })}

                <td style={{ padding: "7px 10px" }}>
                  {level ? (
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 10,
                      background: level.bg, color: level.color,
                    }}>{level.label}</span>
                  ) : <span style={{ color: C.muted }}>-</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left", padding: "6px 10px", fontSize: 10,
  fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px",
  color: C.muted, whiteSpace: "nowrap",
};
