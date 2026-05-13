import { C } from "./constants";

interface ChartCardProps {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}

export function ChartCard({ title, subtitle, badge, children }: ChartCardProps) {
  return (
    <div style={{
      background: C.white,
      border: `1px solid ${C.border}`,
      borderRadius: 6,
      boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px",
        borderBottom: `1px solid ${C.border}`,
        background: C.skyBg,
      }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0 }}>
            {title}
          </p>
          {subtitle && (
            <p style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
              {subtitle}
            </p>
          )}
        </div>
        {badge}
      </div>

      {/* Body */}
      <div style={{ padding: "12px 14px 14px" }}>
        {children}
      </div>
    </div>
  );
}

export const LiveBadge = () => (
  <span style={{
    fontSize: 10, fontWeight: 600,
    padding: "2px 10px", borderRadius: 10,
    background: "rgba(0,135,90,0.12)",
    color: "#00875a",
    border: "1px solid rgba(0,135,90,0.3)",
    letterSpacing: "0.6px",
  }}>
    LIVE
  </span>
);
