import { C, ALERT_META } from "./constants";
import { fmtTime } from "./utils";
import { Alert } from "@/hooks/useApi";

interface AlertListProps {
  alerts: Alert[];
}

export function AlertList({ alerts }: AlertListProps) {
  if (!alerts.length) return (
    <p style={{ textAlign: "center", color: C.muted, fontSize: 13, padding: "28px 0" }}>
      Không có cảnh báo
    </p>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {alerts.slice(0, 6).map(a => {
        const meta = ALERT_META[a.alert_type] ?? { color: C.muted, label: a.alert_type };
        return (
          <div key={a.id} style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            padding: "9px 12px", background: C.bg, borderRadius: 5,
            borderLeft: `3px solid ${meta.color}`,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: meta.color, marginBottom: 2 }}>{meta.label}</p>
              <p style={{ fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {a.message}
              </p>
            </div>
            <span style={{ fontSize: 10, color: C.muted, flexShrink: 0, fontFamily: "monospace", paddingTop: 1 }}>
              {fmtTime(a.created_at)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
