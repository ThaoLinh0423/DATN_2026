import { useMemo } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DriftFeatureStatus,
  DriftStatus,
  MLModelKey,
  useDriftSummary,
  useDriftTimeseries,
  useLatestFeatureDrift,
} from "@/hooks/useApi";
import { C, SENSOR_COLORS } from "./constants";
import { ChartCard } from "./ChartCard";
import { DarkTooltip } from "./DarkTooltip";
import { fmtTime } from "./utils";

const STATUS_META: Record<DriftStatus, { label: string; color: string; bg: string }> = {
  stable: { label: "Stable", color: "#00875a", bg: "rgba(0,135,90,0.08)" },
  warning: { label: "Warning", color: "#b8860b", bg: "rgba(184,134,11,0.10)" },
  drift: { label: "Drift", color: "#c4314b", bg: "rgba(196,49,75,0.10)" },
  insufficient_data: { label: "Not enough data", color: "#6b7a90", bg: "rgba(107,122,144,0.10)" },
  not_available: { label: "N/A", color: "#6b7a90", bg: "rgba(107,122,144,0.10)" },
};

const PSI_WARNING_THRESHOLD = 5.0;
const PSI_DRIFT_THRESHOLD = 10.0;

interface DriftTrackingSectionProps {
  model: MLModelKey;
}

type DriftChartRow = {
  time: string;
  timestamp: string;
  [key: string]: string | number | undefined;
};

export function DriftTrackingSection({ model }: DriftTrackingSectionProps) {
  const summary = useDriftSummary(model);
  const timeseries = useDriftTimeseries(model);
  const latestFeatures = useLatestFeatureDrift(model);

  const inputFeatures = summary.data?.input_drift ?? [];
  const predictionFeatures = summary.data?.prediction_drift ?? [];

  const featureRows = useMemo(() => {
    const fromSummary = [...inputFeatures, ...predictionFeatures];
    const fromLatest = latestFeatures.data ?? [];
    const rows = fromLatest.length ? fromLatest : fromSummary;
    return dedupeFeatureRows(rows.map(normalizeFeatureStatus))
      .sort((a, b) => (b.psi ?? -1) - (a.psi ?? -1));
  }, [inputFeatures, latestFeatures.data, predictionFeatures]);

  const overallStatus = useMemo(() => getOverallStatus(featureRows), [featureRows]);

  const barRows = useMemo(
    () => featureRows.slice(0, 10).map(row => ({
      feature: prettyFeature(row.feature),
      psi: roundPsi(row.psi),
      status: row.status,
      sample_size: row.sample_size,
    })),
    [featureRows],
  );

  const inputChart = useMemo(
    () => buildSeriesRows(timeseries.data?.series.filter(p => p.scope === "input") ?? []),
    [timeseries.data],
  );

  const predictionChart = useMemo(
    () => buildSeriesRows(timeseries.data?.series.filter(p => p.scope === "prediction") ?? []),
    [timeseries.data],
  );

  const featureKeys = useMemo(
    () => Array.from(new Set((timeseries.data?.series ?? []).map(p => p.feature))).slice(0, 6),
    [timeseries.data],
  );

  const isLoading = summary.isLoading || timeseries.isLoading || latestFeatures.isLoading;
  const error = summary.error || timeseries.error || latestFeatures.error;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <ChartCard
        title="ML drift tracking"
        subtitle={`Model: ${model.toUpperCase()} · Warning >= ${PSI_WARNING_THRESHOLD.toFixed(1)} · Drift >= ${PSI_DRIFT_THRESHOLD.toFixed(1)}${summary.data?.generated_at ? ` · ${fmtTime(summary.data.generated_at)}` : ""}`}
        badge={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <StatusBadge status={overallStatus} />
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                summary.refetch();
                timeseries.refetch();
                latestFeatures.refetch();
              }}
              disabled={isLoading}
              style={{ width: 28, height: 28 }}
            >
              <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
            </Button>
          </div>
        }
      >
        {error ? (
          <InlineError message={(error as Error).message} />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            <DriftMetric label="Overall" value={STATUS_META[overallStatus].label} color={STATUS_META[overallStatus].color} />
            <DriftMetric label="Events" value={summary.data?.events_in_window ?? "-"} color={C.aqi} />
            <DriftMetric label="History points" value={summary.data?.history_points ?? "-"} color={C.pm25} />
            <DriftMetric label="Features tracked" value={featureRows.length || "-"} color={C.temp} />
          </div>
        )}
      </ChartCard>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <ChartCard title="Input PSI trend" subtitle="Feature drift over time">
          <DriftLineChart data={inputChart.rows} featureKeys={featureKeys} emptyText={timeseries.isLoading ? "Loading..." : "No input drift data"} />
        </ChartCard>

        <ChartCard title="Prediction PSI trend" subtitle="Prediction drift over time">
          <DriftLineChart data={predictionChart.rows} featureKeys={featureKeys} emptyText={timeseries.isLoading ? "Loading..." : "No prediction drift data"} />
        </ChartCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 10 }}>
        <ChartCard title="Latest feature PSI" subtitle="Higher PSI means stronger distribution shift">
          {barRows.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barRows} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
                <XAxis dataKey="feature" tick={{ fontSize: 10, fill: C.muted }} tickLine={false} axisLine={{ stroke: C.border }} />
                <YAxis tick={{ fontSize: 10, fill: C.muted }} tickLine={false} axisLine={false} width={34} domain={[0, "dataMax"]} />
                <Tooltip content={<DarkTooltip />} />
                <Bar dataKey="psi" name="PSI" radius={[3, 3, 0, 0]}>
                  {barRows.map(row => (
                    <Cell key={row.feature} fill={STATUS_META[row.status].color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState text={isLoading ? "Loading..." : "No feature drift data"} />
          )}
        </ChartCard>

        <ChartCard title="Feature status" subtitle="Latest feature-level monitoring">
          <FeatureStatusTable rows={featureRows} isLoading={isLoading} />
        </ChartCard>
      </div>
    </div>
  );
}

function DriftLineChart({ data, featureKeys, emptyText }: { data: DriftChartRow[]; featureKeys: string[]; emptyText: string }) {
  if (!data.length) return <EmptyState text={emptyText} />;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
        <XAxis dataKey="time" tick={{ fontSize: 10, fill: C.muted }} tickLine={false} axisLine={{ stroke: C.border }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10, fill: C.muted }} tickLine={false} axisLine={false} width={34} domain={[0, "dataMax"]} />
        <Tooltip content={<DarkTooltip />} />
        <Legend wrapperStyle={{ fontSize: 10 }} iconType="circle" />
        <Line yAxisId={0} dataKey="warning" name="Warning" stroke="#b8860b" strokeDasharray="4 4" strokeWidth={1} dot={false} isAnimationActive={false} />
        <Line yAxisId={0} dataKey="drift" name="Drift" stroke="#c4314b" strokeDasharray="4 4" strokeWidth={1} dot={false} isAnimationActive={false} />
        {featureKeys.map((feature, i) => (
          <Line
            key={feature}
            type="monotone"
            dataKey={feature}
            name={prettyFeature(feature)}
            stroke={SENSOR_COLORS[i % SENSOR_COLORS.length]}
            strokeWidth={1.7}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function FeatureStatusTable({ rows, isLoading }: { rows: DriftFeatureStatus[]; isLoading: boolean }) {
  if (!rows.length) return <EmptyState text={isLoading ? "Loading..." : "No feature status data"} />;

  return (
    <div style={{ maxHeight: 220, overflowY: "auto", overflowX: "hidden" }}>
      <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", fontSize: 11 }}>
        <colgroup>
          <col style={{ width: "48%" }} />
          <col style={{ width: "22%" }} />
          <col style={{ width: "30%" }} />
        </colgroup>
        <thead>
          <tr style={{ color: C.muted, textAlign: "left", borderBottom: `1px solid ${C.border}` }}>
            <th style={{ padding: "0 4px 7px 0", fontWeight: 700 }}>Feature</th>
            <th style={{ padding: "0 4px 7px", fontWeight: 700 }}>PSI</th>
            <th style={{ padding: "0 0 7px 4px", fontWeight: 700 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.feature}-${i}`} style={{ borderBottom: `1px solid ${C.border}` }} title={`N=${row.sample_size}`}>
              <td style={{ padding: "8px 4px 8px 0", color: C.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {prettyFeature(row.feature)}
              </td>
              <td style={{ padding: "8px 4px", color: C.text, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {formatPsi(row.psi)}
              </td>
              <td style={{ padding: "8px 0 8px 4px", overflow: "hidden" }}><StatusBadge status={row.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DriftMetric({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 5, padding: "10px 12px", background: C.white }}>
      <p style={{ margin: 0, color: C.muted, fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{label}</p>
      <p style={{ margin: "5px 0 0", color, fontSize: 22, fontWeight: 700, fontFamily: "monospace", lineHeight: 1 }}>
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: DriftStatus }) {
  const meta = STATUS_META[status];
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      whiteSpace: "nowrap",
      fontSize: 10,
      fontWeight: 700,
      padding: "2px 8px",
      borderRadius: 10,
      background: meta.bg,
      color: meta.color,
      border: `1px solid ${meta.color}33`,
    }}>
      {meta.label}
    </span>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6, padding: "8px 12px",
      background: "rgba(196,49,75,0.06)", borderRadius: 5, color: "#c4314b", fontSize: 12,
    }}>
      <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0 }} />
      Drift service error: {message}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{
      height: 220,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: C.muted,
      fontSize: 12,
      background: "rgba(0,0,0,0.015)",
      borderRadius: 5,
      border: `1px dashed ${C.border}`,
    }}>
      {text}
    </div>
  );
}

function buildSeriesRows(points: { timestamp: string; feature: string; psi?: number | null }[]) {
  const rowsByTime = new Map<string, DriftChartRow>();

  points.forEach(point => {
    const row = rowsByTime.get(point.timestamp) ?? {
      timestamp: point.timestamp,
      time: fmtTime(point.timestamp),
      warning: PSI_WARNING_THRESHOLD,
      drift: PSI_DRIFT_THRESHOLD,
    };
    row[point.feature] = roundPsi(point.psi);
    rowsByTime.set(point.timestamp, row);
  });

  return {
    rows: Array.from(rowsByTime.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
  };
}

function normalizeFeatureStatus(row: DriftFeatureStatus): DriftFeatureStatus {
  return {
    ...row,
    status: getPsiStatus(row.psi, row.status),
  };
}

function dedupeFeatureRows(rows: DriftFeatureStatus[]) {
  const byFeature = new Map<string, DriftFeatureStatus>();

  rows.forEach(row => {
    const current = byFeature.get(row.feature);
    if (!current || getFeaturePriority(row) > getFeaturePriority(current)) {
      byFeature.set(row.feature, row);
    }
  });

  return Array.from(byFeature.values());
}

function getFeaturePriority(row: DriftFeatureStatus) {
  const severity: Record<DriftStatus, number> = {
    drift: 4,
    warning: 3,
    stable: 2,
    insufficient_data: 1,
    not_available: 0,
  };

  return (severity[row.status] * 1_000_000) + (row.psi ?? -1);
}

function getPsiStatus(value?: number | null, fallback: DriftStatus = "not_available"): DriftStatus {
  if (value == null) return fallback === "not_available" ? "insufficient_data" : fallback;
  if (value >= PSI_DRIFT_THRESHOLD) return "drift";
  if (value >= PSI_WARNING_THRESHOLD) return "warning";
  return "stable";
}

function getOverallStatus(rows: DriftFeatureStatus[]): DriftStatus {
  if (!rows.length) return "not_available";
  if (rows.some(row => row.status === "drift")) return "drift";
  if (rows.some(row => row.status === "warning")) return "warning";
  if (rows.some(row => row.status === "stable")) return "stable";
  return "insufficient_data";
}

function prettyFeature(feature: string) {
  const labels: Record<string, string> = {
    pm1_0: "PM1.0",
    pm2_5: "PM2.5",
    pm10: "PM10",
    aqi: "AQI",
    temperature: "Temp",
    humidity: "Humidity",
  };
  return labels[feature] ?? feature;
}

function roundPsi(value?: number | null) {
  return value == null ? undefined : +value.toFixed(3);
}

function formatPsi(value?: number | null) {
  return value == null ? "-" : value.toFixed(3);
}
