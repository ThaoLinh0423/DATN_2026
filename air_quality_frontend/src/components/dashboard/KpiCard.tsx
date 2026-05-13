import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { C } from "./constants";

interface KpiCardProps {
  label: string;
  value: string | number;
  unit: string;
  color: string;
  subLabel?: string;
  sparkData?: number[];
}

export function KpiCard({ label, value, unit, color, subLabel, sparkData }: KpiCardProps) {
  const points = sparkData && sparkData.length > 1
    ? sparkData.map((v, i) => ({ i, v }))
    : null;

  let trendSign: "↑" | "↓" | "" = "";
  let trendColor: string = C.muted;
  if (sparkData && sparkData.length >= 4) {
    const half = Math.floor(sparkData.length / 2);
    const a = (arr: number[]) => arr.reduce((s, x) => s + x, 0) / arr.length;
    const diff = a(sparkData.slice(half)) - a(sparkData.slice(0, half));
    if (diff >  0.5) { trendSign = "↑"; trendColor = "#c4314b"; }
    if (diff < -0.5) { trendSign = "↓"; trendColor = "#00875a"; }
  }

  return (
    <div style={{
      background: "#ffffff",
      border: "1px solid #c8d6e5",
      borderRadius: 8,
      padding: "12px 14px",
      position: "relative",
      overflow: "hidden",
      boxShadow: "0 2px 6px rgba(0,80,160,0.08)",
    }}>
      {/* Top color accent bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        height: 3, background: color,
        borderRadius: "8px 8px 0 0",
      }} />

      {/* Label */}
      <p style={{
        fontSize: 10, fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "1.2px",
        color: "#6b7a90",
        marginBottom: 8,
      }}>
        {label}
      </p>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
        <div>
          <p style={{
            fontFamily: "'Inconsolata', monospace",
            fontSize: 26, fontWeight: 700,
            color, lineHeight: 1, marginBottom: 3,
          }}>
            {value}
            {trendSign && (
              <span style={{ fontSize: 13, marginLeft: 5, color: trendColor, verticalAlign: "middle" }}>
                {trendSign}
              </span>
            )}
          </p>
          <p style={{ fontSize: 11, color: "#6b7a90" }}>{unit}</p>
          {subLabel && (
            <p style={{ fontSize: 10, color: "#93b8d8", marginTop: 3 }}>{subLabel}</p>
          )}
        </div>

        {points && (
          <div style={{ width: 68, height: 34, flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`spark-${label.replace(/\s/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="10%" stopColor={color} stopOpacity={0.25} />
                    <stop offset="90%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  dataKey="v"
                  stroke={color}
                  strokeWidth={1.5}
                  fill={`url(#spark-${label.replace(/\s/g, "")})`}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
