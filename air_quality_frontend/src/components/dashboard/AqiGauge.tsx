import { C } from "./constants";
import { calcAQI, getAqiLevel } from "./utils";

interface AqiGaugeProps {
  pm25: number;
  pm10: number;
}

export function AqiGauge({ pm25, pm10 }: AqiGaugeProps) {
  const aqi   = calcAQI(pm25);
  const level = getAqiLevel(aqi);
  const pct   = Math.min(99, (aqi / 300) * 100);

  const bars = [
    { label: "PM2.5", val: pm25, unit: "µg/m³", color: C.pm25, max: 150 },
    { label: "PM10",  val: pm10, unit: "µg/m³", color: C.pm10, max: 200 },
    { label: "AQI",   val: aqi,  unit: "",       color: C.aqi,  max: 300 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Label */}
      <p style={{ fontSize: 10, fontWeight: 600, color: "#a0a0a0", marginBottom: 4, letterSpacing: "0.8px", textTransform: "uppercase" }}>
        Chỉ số AQI tổng hợp
      </p>

      {/* Big AQI number */}
      <p style={{
        fontFamily: "'Inconsolata', monospace",
        fontSize: 48, fontWeight: 700,
        color: level.color, lineHeight: 1,
      }}>
        {aqi}
      </p>

      {/* Level badge */}
      <span style={{
        fontSize: 11, fontWeight: 600,
        padding: "3px 14px", borderRadius: 20,
        background: level.bg, color: level.color,
        marginTop: 6, marginBottom: 18,
        border: `1px solid ${level.color}40`,
      }}>
        {level.label}
      </span>

      {/* Gradient bar */}
      <div style={{
        width: "100%", display: "flex",
        borderRadius: 3, overflow: "hidden", height: 8,
      }}>
        {["#06d6a0", "#ffd166", "#f77f00", "#ef476f", "#9d4edd", "#7b2d8b"].map((c, i) => (
          <div key={i} style={{ flex: 1, background: c }} />
        ))}
      </div>

      {/* Pointer */}
      <div style={{ width: "100%", position: "relative", height: 16, marginBottom: 2 }}>
        <div style={{
          position: "absolute", left: `${pct}%`,
          transform: "translateX(-50%)",
          color: level.color, fontSize: 12,
          transition: "left 1s ease", lineHeight: 1,
        }}>▲</div>
      </div>

      {/* Scale labels */}
      <div style={{
        width: "100%", display: "flex", justifyContent: "space-between",
        fontFamily: "'Inconsolata', monospace",
        fontSize: 9, color: "#414141", marginBottom: 18,
      }}>
        {["0", "50", "100", "150", "200", "300"].map(l => <span key={l}>{l}</span>)}
      </div>

      {/* Sub-bars */}
      {bars.map(row => (
        <div key={row.label} style={{
          width: "100%", display: "flex", alignItems: "center",
          gap: 8, marginBottom: 9, fontSize: 12,
        }}>
          <span style={{ width: 38, color: "#a0a0a0", flexShrink: 0, fontSize: 11 }}>
            {row.label}
          </span>
          <div style={{
            flex: 1, height: 4,
            background: "rgba(65,65,65,0.8)",
            borderRadius: 2, overflow: "hidden",
          }}>
            <div style={{
              width: `${Math.min(100, (row.val / row.max) * 100)}%`,
              height: "100%", background: row.color, borderRadius: 2,
            }} />
          </div>
          <span style={{
            fontFamily: "'Inconsolata', monospace",
            fontWeight: 600, fontSize: 12,
            color: row.color, minWidth: 56, textAlign: "right",
          }}>
            {row.val.toFixed(1)}{row.unit ? ` ${row.unit}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
