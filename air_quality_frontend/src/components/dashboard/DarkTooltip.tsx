import { C } from "./constants";

export const DarkTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "rgba(22,27,39,0.96)", border: `1px solid ${C.border}`,
      borderRadius: 6, padding: "8px 12px", fontSize: 12, lineHeight: 1.6,
    }}>
      <p style={{ color: "#cdd5e0", fontWeight: 600, marginBottom: 4, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 4 }}>
        {label}
      </p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color, margin: 0 }}>
          {p.name}: <strong>{typeof p.value === "number" ? p.value.toFixed(2) : p.value}</strong>{p.unit ?? ""}
        </p>
      ))}
    </div>
  );
};
