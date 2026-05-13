import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Legend,
} from "recharts";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useForecast, useClearForecastCache, MLModelKey, ForecastPoint } from "@/hooks/useApi";
import { C } from "./constants";
import { DarkTooltip } from "./DarkTooltip";
import { fmtTime } from "./utils";

export const ML_MODELS: MLModelKey[] = ["lstm", "gru", "bilstm", "informer", "arima"];

export type ForecastDisplayRange = "1h" | "24h" | "7d" | "30d";

export interface ForecastChartPoint {
  timestamp: string;
  time: string;
  isForecast: true;
  "PM1.0_fc"?: number;
  "PM2.5_fc"?: number;
  "PM10_fc"?: number;
  "AQI_fc"?: number;
  "Temp_fc"?: number;
  "Humidity_fc"?: number;
}

export function toForecastPoint(p: ForecastPoint, timeRange?: ForecastDisplayRange): ForecastChartPoint {
  return {
    timestamp: p.timestamp,
    time: fmtTime(p.timestamp, timeRange),
    isForecast: true,
    "PM1.0_fc": p.pm1_0 != null ? +p.pm1_0.toFixed(2) : undefined,
    "PM2.5_fc": p.pm2_5 != null ? +p.pm2_5.toFixed(2) : undefined,
    "PM10_fc":  p.pm10  != null ? +p.pm10.toFixed(2)  : undefined,
    "AQI_fc":   p.aqi   != null ? +p.aqi.toFixed(1)   : undefined,
    "Temp_fc":  p.temperature != null ? +p.temperature.toFixed(1) : undefined,
    "Humidity_fc": p.humidity != null ? +p.humidity.toFixed(0) : undefined,
  };
}

// ── Hook: expose forecast data to parent ─────────────────────────────────────
export function useMLForecast(
  model: MLModelKey,
  sensorNode: string,
  timeRange?: ForecastDisplayRange,
) {
  const query      = useForecast(model, { sensorNode, historyHours: 24, limit: 1000 });
  const clearCache = useClearForecastCache();

  const forecastPoints = useMemo(
    () => query.data?.forecast?.map(p => toForecastPoint(p, timeRange)) ?? [],
    [query.data, timeRange],
  );

  const forecastAlerts = useMemo(() => {
    if (!query.data?.alerts) return [];
    return Object.entries(query.data.alerts)
      .flatMap(([feature, points]) => points.map(p => ({ feature, ...p })))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [query.data]);

  return {
    ...query,
    forecastPoints,
    forecastAlerts,
    clearCache,
    meta: query.data,
    targetColumns: query.data?.target_columns ?? [],
  };
}

// ── ML Controls bar (model picker + cache clear + refresh) ───────────────────
interface MLControlsProps {
  model: MLModelKey;
  onModelChange: (m: MLModelKey) => void;
  onRefresh: () => void;
  onClearCache: () => void;
  isLoading: boolean;
  isClearPending: boolean;
  meta?: { model: string; horizon: number; resample_freq: string } | null;
}

export function MLControls({
  model, onModelChange, onRefresh, onClearCache,
  isLoading, isClearPending, meta,
}: MLControlsProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, color: C.muted, fontWeight: 600, whiteSpace: "nowrap" }}>ML Model:</span>
      {ML_MODELS.map(m => (
        <button key={m} onClick={() => onModelChange(m)} style={{
          fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 4,
          border: `1px solid ${model === m ? C.aqi : C.border}`,
          color: model === m ? C.aqi : C.muted,
          background: model === m ? "rgba(0,120,212,0.07)" : "transparent",
          cursor: "pointer", textTransform: "uppercase",
        }}>{m}</button>
      ))}
      {meta && (
        <span style={{ fontSize: 10, color: C.muted, marginLeft: 4 }}>
          · {meta.horizon} bước · {meta.resample_freq}
        </span>
      )}
      <button
        onClick={onClearCache} disabled={isClearPending}
        title="Xóa cache model, force reload từ disk"
        style={{
          fontSize: 10, padding: "3px 10px", borderRadius: 4, marginLeft: 4,
          border: `1px solid ${C.border}`, color: C.muted,
          background: "transparent", cursor: "pointer",
        }}
      >
        {isClearPending ? "..." : "↺ cache"}
      </button>
      <Button variant="outline" size="icon" onClick={onRefresh} disabled={isLoading}
        style={{ width: 28, height: 28 }}>
        <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
      </Button>
    </div>
  );
}

// ── Forecast alert strip ──────────────────────────────────────────────────────
const FEATURE_META: Record<string, { label: string; color: string }> = {
  pm2_5: { label: "PM2.5", color: C.pm25 },
  pm1_0: { label: "PM1.0", color: C.pm1  },
  pm10:  { label: "PM10",  color: C.pm10 },
  aqi:   { label: "AQI",   color: C.aqi  },
  temperature: { label: "Temp", color: C.temp },
  humidity: { label: "Humidity", color: C.hum },
};

interface ForecastAlertStripProps {
  alerts: { feature: string; timestamp: string; value: number }[];
  horizon?: number;
  error?: Error | null;
}

export function ForecastAlertStrip({ alerts, horizon, error }: ForecastAlertStripProps) {
  if (error) return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6, padding: "7px 12px",
      background: "rgba(196,49,75,0.06)", borderRadius: 5, color: "#c4314b", fontSize: 12,
    }}>
      <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0 }} />
      ML service không phản hồi: {(error as any)?.message ?? "lỗi kết nối"}
    </div>
  );

  if (alerts.length === 0) return (
    <div style={{
      fontSize: 11, color: "#00875a", padding: "6px 12px",
      background: "rgba(0,135,90,0.06)", borderRadius: 5,
      border: "1px solid rgba(0,135,90,0.2)",
    }}>
      ✓ Không có cảnh báo dự báo trong {horizon ?? "—"} bước tới
    </div>
  );

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
      {alerts.map((a, i) => {
        const meta = FEATURE_META[a.feature] ?? { label: a.feature, color: C.muted };
        return (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 5, padding: "4px 10px",
            background: C.bg, borderRadius: 4, borderLeft: `3px solid ${meta.color}`, fontSize: 11,
          }}>
            <span style={{ fontWeight: 600, color: meta.color }}>{meta.label}</span>
            <span style={{ fontFamily: "monospace", color: meta.color }}>{a.value.toFixed(1)}</span>
            <span style={{ color: C.muted, fontFamily: "monospace", fontSize: 10 }}>{fmtTime(a.timestamp)}</span>
          </div>
        );
      })}
    </div>
  );
}
