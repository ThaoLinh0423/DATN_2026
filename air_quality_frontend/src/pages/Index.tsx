import { useMemo, useState, useCallback, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { RefreshCw, AlertTriangle } from "lucide-react";
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  useSensors, useHistoricalData, useCurrentUser,
  useAlerts, useAlertStatistics,
  DataPoint, Sensor,
} from "@/hooks/useApi";
import { useWebSocket, RealtimeDataPoint } from "@/hooks/useWebSocket";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Dashboard components ──────────────────────────────────────────────────────
import { C, STATUS_COLOR, STATUS_LABEL } from "@/components/dashboard/constants";
import { calcAQI, getAqiLevel, avg }from "@/components/dashboard/utils";
import { DarkTooltip }              from "@/components/dashboard/DarkTooltip";
import { KpiCard }                  from "@/components/dashboard/KpiCard";
import { ChartCard, LiveBadge }     from "@/components/dashboard/ChartCard";
import { AqiGauge }                 from "@/components/dashboard/AqiGauge";
import { Heatmap }                  from "@/components/dashboard/Heatmap";
import { AlertList }                from "@/components/dashboard/AlertList";
import { PMChart, PMChartPoint }    from "@/components/dashboard/PMChart";
import { ForecastTable }            from "@/components/dashboard/ForecastTable";
import {
  useMLForecast, MLControls, ForecastAlertStrip, ML_MODELS,
} from "@/components/dashboard/MLForecastSection";
import { DriftTrackingSection }      from "@/components/dashboard/DriftTrackingSection";
import { MLModelKey } from "@/hooks/useApi";

// ─── Types ────────────────────────────────────────────────────────────────────
type TimeRange = "1h" | "24h" | "7d" | "30d";
type DashboardView = "overview" | "drift";
const LEGACY_DASHBOARD_MODEL_STORAGE_KEY = "air-quality-watch:dashboard-model";
const DEFAULT_PREDICTION_MODEL_STORAGE_KEY = "air-quality-watch:default-prediction-model";
const DASHBOARD_DISPLAY_MODEL_STORAGE_KEY = "air-quality-watch:dashboard-display-model";
const DASHBOARD_VISIBLE_MODELS_STORAGE_KEY = "air-quality-watch:dashboard-visible-models";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getHistRange(timeRange: TimeRange) {
  const now = new Date();
  const hrs = timeRange === "1h" ? 1 : timeRange === "24h" ? 24 : timeRange === "7d" ? 168 : 720;
  return {
    startTime: new Date(now.getTime() - hrs * 3_600_000).toISOString(),
    endTime:   now.toISOString(),
  };
}

function getBucketHrs(timeRange: TimeRange): number {
  return timeRange === "1h" ? 1 / 12 : timeRange === "24h" ? 1 : timeRange === "7d" ? 6 : 24;
}

function getMaxPoints(timeRange: TimeRange): number {
  return timeRange === "1h" ? 12 : timeRange === "24h" ? 48 : timeRange === "7d" ? 56 : 60;
}

function getInitialMlModel(): MLModelKey {
  const savedModel =
    localStorage.getItem(DASHBOARD_DISPLAY_MODEL_STORAGE_KEY) ||
    localStorage.getItem(LEGACY_DASHBOARD_MODEL_STORAGE_KEY) ||
    localStorage.getItem(DEFAULT_PREDICTION_MODEL_STORAGE_KEY);
  return ML_MODELS.includes(savedModel as MLModelKey) ? savedModel as MLModelKey : "gru";
}

function getVisibleMlModels(): MLModelKey[] {
  const savedModels = localStorage.getItem(DASHBOARD_VISIBLE_MODELS_STORAGE_KEY);
  if (!savedModels) return ML_MODELS;

  try {
    const parsed = JSON.parse(savedModels);
    if (!Array.isArray(parsed)) return ML_MODELS;
    const models = parsed.filter((model): model is MLModelKey => ML_MODELS.includes(model as MLModelKey));
    return models.length ? models : ML_MODELS;
  } catch {
    return ML_MODELS;
  }
}

function bucketKey(timestamp: string, timeRange: TimeRange, bucketHrs: number): string {
  const d = new Date(timestamp);
  if (timeRange === "1h") {
    const mins = Math.floor(d.getMinutes() / 5) * 5;
    return `${String(d.getHours()).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  }
  const h = Math.floor(d.getHours() / bucketHrs) * bucketHrs;
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(h).padStart(2, "0")}:00`;
}

function mergeActualForecast(
  actual: { time: string; value: number }[],
  forecast: { timestamp: string; time: string; value: number | undefined }[],
): PMChartPoint[] {
  const points: PMChartPoint[] = actual.map(p => ({ time: p.time, actual: p.value }));
  const lastActual = actual[actual.length - 1];

  if (lastActual && forecast.length > 0 && points.length > 0) {
    points[points.length - 1] = {
      ...points[points.length - 1],
      forecast: lastActual.value,
    };
  }

  forecast.forEach(p => {
    points.push({
      timestamp: p.timestamp,
      time: p.time,
      forecast: p.value,
    });
  });

  return points;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const Index = () => {
  const { data: user } = useCurrentUser();

  const [realtimeReadings, setRealtimeReadings] = useState<Map<string, RealtimeDataPoint>>(new Map());
  const [timeRange,        setTimeRange]         = useState<TimeRange>("24h");
  const [selectedSensor,   setSelectedSensor]    = useState<string>("");
  const [mlModel,          setMlModel]            = useState<MLModelKey>(getInitialMlModel);
  const [visibleMlModels,  setVisibleMlModels]    = useState<MLModelKey[]>(getVisibleMlModels);
  const [dashboardView,    setDashboardView]      = useState<DashboardView>("overview");

  useEffect(() => {
    const syncVisibleModels = () => setVisibleMlModels(getVisibleMlModels());
    window.addEventListener("storage", syncVisibleModels);
    window.addEventListener("dashboard-model-settings-updated", syncVisibleModels);
    return () => {
      window.removeEventListener("storage", syncVisibleModels);
      window.removeEventListener("dashboard-model-settings-updated", syncVisibleModels);
    };
  }, []);

  useEffect(() => {
    if (!visibleMlModels.includes(mlModel)) {
      setMlModel(visibleMlModels[0] ?? "gru");
    }
  }, [mlModel, visibleMlModels]);

  useEffect(() => {
    localStorage.setItem(DASHBOARD_DISPLAY_MODEL_STORAGE_KEY, mlModel);
  }, [mlModel]);

  // ── Sensors ──────────────────────────────────────────────────────────────────
  const { data: sensorsData, isLoading: sensorsLoading, refetch: refetchSensors } = useSensors(100);
  const sensors   = sensorsData?.data ?? [];
  // FIX Bug-2: WebSocket cần sensor_node tag = Sensor.deviceId
  // (không phải Sensor.sensorId = UUID nội bộ DB)
  const sensorIds = useMemo(() => sensors.map(s => s.deviceId).filter(Boolean), [sensors]);

  useMemo(() => {
    if (!selectedSensor && sensors.length > 0)
      setSelectedSensor(sensors[0].deviceId);
  }, [sensors, selectedSensor]);

  const activeSensor = useMemo(
    () => sensors.find(s => s.deviceId === selectedSensor),
    [sensors, selectedSensor],
  );

  // ── Historical data ──────────────────────────────────────────────────────────
  const histRange = useMemo(() => getHistRange(timeRange), [timeRange]);

  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useHistoricalData({
    sensorNode: selectedSensor, ...histRange, limit: 500,
  });

  const historicalPoints: DataPoint[] = historyData?.data ?? [];

  // ── Alerts ───────────────────────────────────────────────────────────────────
  const { data: alertsData } = useAlerts("active", 20);
  const { data: alertStats } = useAlertStatistics();
  const activeAlerts          = alertsData?.data ?? [];

  // ── WebSocket ────────────────────────────────────────────────────────────────
  const handleRealtimeData = useCallback((d: RealtimeDataPoint) => {
    setRealtimeReadings(prev => new Map(prev).set(d.sensorId, d));
  }, []);

  const { isConnected, error: wsError } = useWebSocket({
    sensorIds, enabled: sensorIds.length > 0,
    onDataReceived: handleRealtimeData,
    reconnectAttempts: 5, reconnectDelay: 3000, throttleMs: 1000,
  });

  // ── Merged data ──────────────────────────────────────────────────────────────
  const allDataPoints = useMemo(() => {
    const combined: DataPoint[] = [...historicalPoints];
    const rt = realtimeReadings.get(selectedSensor);
    if (rt) combined.push(rt as any);
    return combined;
  }, [historicalPoints, realtimeReadings, selectedSensor]);

  const latestReading = useMemo(() => {
    if (!allDataPoints.length) return null;
    return allDataPoints.reduce((latest, p) =>
      new Date(p.timestamp) > new Date(latest.timestamp) ? p : latest
    );
  }, [allDataPoints]);

  // ── KPI ──────────────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const v = latestReading?.values;
    return {
      pm1:  v?.pm1         ?? 0,
      pm25: v?.pm25        ?? 0,
      pm10: v?.pm10        ?? 0,
      temp: v?.temperature ?? 0,
      hum:  v?.humidity    ?? 0,
      aqi:  calcAQI(v?.pm25 ?? 0),
    };
  }, [latestReading]);

  // ── Timeseries ───────────────────────────────────────────────────────────────
  const timeseries = useMemo(() => {
    const bucketHrs = getBucketHrs(timeRange);
    const buckets: Record<string, { pm1: number[]; pm25: number[]; pm10: number[]; temp: number[]; hum: number[] }> = {};
    allDataPoints.forEach(p => {
      const key = bucketKey(p.timestamp, timeRange, bucketHrs);
      if (!buckets[key]) buckets[key] = { pm1: [], pm25: [], pm10: [], temp: [], hum: [] };
      buckets[key].pm1.push(p.values.pm1  ?? 0);
      buckets[key].pm25.push(p.values.pm25 ?? 0);
      buckets[key].pm10.push(p.values.pm10 ?? 0);
      if (p.values.temperature) buckets[key].temp.push(p.values.temperature);
      if (p.values.humidity)    buckets[key].hum.push(p.values.humidity);
    });
    return Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-getMaxPoints(timeRange))
      .map(([time, v]) => {
        const pm25 = +avg(v.pm25).toFixed(2);
        return {
          time,
          pm1:  +avg(v.pm1).toFixed(2),
          pm25,
          pm10: +avg(v.pm10).toFixed(2),
          aqi:  calcAQI(pm25),
          temp: v.temp.length ? +avg(v.temp).toFixed(1) : null,
          hum:  v.hum.length  ? +avg(v.hum).toFixed(0)  : null,
        };
      });
  }, [allDataPoints, timeRange]);

  const spark = useMemo(() => ({
    pm1:  timeseries.slice(-16).map(d => d.pm1),
    pm25: timeseries.slice(-16).map(d => d.pm25),
    pm10: timeseries.slice(-16).map(d => d.pm10),
    temp: timeseries.slice(-16).map(d => d.temp ?? 0),
    hum:  timeseries.slice(-16).map(d => d.hum  ?? 0),
  }), [timeseries]);

  // ── ML Forecast ──────────────────────────────────────────────────────────────
  const ml = useMLForecast(mlModel, selectedSensor, timeRange);

  const aqiChart = useMemo(() => mergeActualForecast(
    timeseries.map(d => ({ time: d.time, value: d.aqi })),
    ml.forecastPoints.map(p => ({ timestamp: p.timestamp, time: p.time, value: p["AQI_fc"] })),
  ), [timeseries, ml.forecastPoints]);

  const pm1Chart  = useMemo(() => mergeActualForecast(
    timeseries.map(d => ({ time: d.time, value: d.pm1  })),
    ml.forecastPoints.map(p => ({ timestamp: p.timestamp, time: p.time, value: p["PM1.0_fc"] })),
  ), [timeseries, ml.forecastPoints]);

  const pm25Chart = useMemo(() => mergeActualForecast(
    timeseries.map(d => ({ time: d.time, value: d.pm25 })),
    ml.forecastPoints.map(p => ({ timestamp: p.timestamp, time: p.time, value: p["PM2.5_fc"] })),
  ), [timeseries, ml.forecastPoints]);

  const pm10Chart = useMemo(() => mergeActualForecast(
    timeseries.map(d => ({ time: d.time, value: d.pm10 })),
    ml.forecastPoints.map(p => ({ timestamp: p.timestamp, time: p.time, value: p["PM10_fc"] })),
  ), [timeseries, ml.forecastPoints]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const isLoading = sensorsLoading || historyLoading;
  const handleRefresh = () => { refetchSensors(); refetchHistory(); setRealtimeReadings(new Map()); };

  const aqiLevel = getAqiLevel(kpi.aqi);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <MainLayout>
      {/* ── Outer page background ── */}
      <div style={{ background: C.bgPage, minHeight: "100%", padding: "0 0 32px" }}>
        {/* ── Dashboard panel bao trọn toàn bộ nội dung ── */}
        <div style={{
          background: C.white,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          boxShadow: "0 2px 12px rgba(0,60,120,0.08)",
          padding: "20px 20px 24px",
        }}>
          <div className="dashboard-shell">

          {/* ══ FILTER BAR (tất cả filter gom vào đây) ══════════════════════════ */}
          <div style={{
            background: C.white, border: `1px solid ${C.border}`, borderRadius: 6,
            padding: "10px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}>
            {/* Row 1: title + meta + actions */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexWrap: "wrap", gap: 10, marginBottom: 10,
            }}>
              <div>
                <h1 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>
                  Tổng quan chất lượng không khí
                </h1>
                <p style={{ fontSize: 11, color: C.muted, margin: "2px 0 0" }}>
                  {user?.name || user?.email || "Guest"} · {allDataPoints.length.toLocaleString()} điểm đo
                </p>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* WS status */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600,
                  padding: "4px 10px", borderRadius: 20,
                  border: `1px solid ${isConnected ? "rgba(0,135,90,0.3)" : "rgba(196,49,75,0.3)"}`,
                  color: isConnected ? "#00875a" : "#c4314b",
                  background: isConnected ? "rgba(0,135,90,0.07)" : "rgba(196,49,75,0.07)",
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block", background: isConnected ? "#00875a" : "#c4314b" }} />
                  {isConnected ? "Live" : "Offline"}
                </div>
                <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isLoading}>
                  <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                </Button>
              </div>
            </div>

            {/* Divider */}
            <div style={{ borderTop: `1px solid ${C.border}`, marginBottom: 10 }} />

            {/* Row 2: tất cả controls */}
            <div className="dashboard-filter-row">

              {/* Sensor dropdown */}
              <div className="dashboard-control-group">
                <span style={{ fontSize: 11, color: C.muted, fontWeight: 600, whiteSpace: "nowrap" }}>Cảm biến:</span>
                <select
                  value={selectedSensor}
                  onChange={e => setSelectedSensor(e.target.value)}
                  style={{
                    fontSize: 12, fontWeight: 600, padding: "5px 28px 5px 10px",
                    borderRadius: 5, border: `1px solid ${C.border}`,
                    background: C.white, color: C.text,
                    cursor: "pointer", appearance: "none",
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238a96a8'/%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 8px center",
                    minWidth: 160,
                  }}
                >
                  {sensors.map(s => (
                    <option key={s.sensorId} value={s.deviceId}>
                      {s.name || s.deviceId}
                    </option>
                  ))}
                </select>
              </div>

              <div className="dashboard-divider" style={{ width: 1, height: 20, background: C.border, flexShrink: 0 }} />

              {/* Time range pills */}
              <div className="dashboard-control-group">
                <span style={{ fontSize: 11, color: C.muted, fontWeight: 600, whiteSpace: "nowrap" }}>Khoảng thời gian:</span>
                <div style={{ display: "flex", gap: 3 }}>
                  {(["1h", "24h", "7d", "30d"] as TimeRange[]).map(r => (
                    <button key={r} onClick={() => setTimeRange(r)} style={{
                      fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 4,
                      border: `1px solid ${timeRange === r ? C.aqi : C.border}`,
                      color: timeRange === r ? C.aqi : C.muted,
                      background: timeRange === r ? "rgba(0,120,212,0.07)" : "transparent",
                      cursor: "pointer",
                    }}>{r}</button>
                  ))}
                </div>
              </div>

              <div className="dashboard-divider" style={{ width: 1, height: 20, background: C.border, flexShrink: 0 }} />

              {/* Dashboard view pills */}
              <div className="dashboard-control-group">
                <span style={{ fontSize: 11, color: C.muted, fontWeight: 600, whiteSpace: "nowrap" }}>Hiển thị:</span>
                <div style={{ display: "flex", gap: 3 }}>
                  {([
                    { key: "overview", label: "Tổng quan" },
                    { key: "drift", label: "Drift tracking" },
                  ] as { key: DashboardView; label: string }[]).map(view => (
                    <button key={view.key} onClick={() => setDashboardView(view.key)} style={{
                      fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 4,
                      border: `1px solid ${dashboardView === view.key ? C.aqi : C.border}`,
                      color: dashboardView === view.key ? C.aqi : C.muted,
                      background: dashboardView === view.key ? "rgba(0,120,212,0.07)" : "transparent",
                      cursor: "pointer",
                    }}>{view.label}</button>
                  ))}
                </div>
              </div>

              <div className="dashboard-divider" style={{ width: 1, height: 20, background: C.border, flexShrink: 0 }} />

              {/* ML model pills */}
              <div className="dashboard-control-group" style={{ flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: C.muted, fontWeight: 600, whiteSpace: "nowrap" }}>ML Model:</span>
                <div style={{ display: "flex", gap: 3 }}>
                  {visibleMlModels.map(m => (
                    <button key={m} onClick={() => setMlModel(m)} style={{
                      fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 4,
                      border: `1px solid ${mlModel === m ? C.aqi : C.border}`,
                      color: mlModel === m ? C.aqi : C.muted,
                      background: mlModel === m ? "rgba(0,120,212,0.07)" : "transparent",
                      cursor: "pointer", textTransform: "uppercase",
                    }}>{m}</button>
                  ))}
                </div>
                {ml.meta && (
                  <span style={{ fontSize: 10, color: C.muted }}>
                    · {ml.meta.horizon} bước · {ml.meta.resample_freq}
                  </span>
                )}
                <button
                  onClick={() => ml.clearCache.mutate()} disabled={ml.clearCache.isPending}
                  title="Xóa cache model"
                  style={{
                    fontSize: 10, padding: "3px 10px", borderRadius: 4,
                    border: `1px solid ${C.border}`, color: C.muted,
                    background: "transparent", cursor: "pointer",
                  }}
                >
                  {ml.clearCache.isPending ? "..." : "↺ cache"}
                </button>
                <Button variant="outline" size="icon" onClick={() => ml.refetch()} disabled={ml.isLoading}
                  style={{ width: 28, height: 28 }}>
                  <RefreshCw className={cn("h-3 w-3", ml.isLoading && "animate-spin")} />
                </Button>
              </div>
            </div>
          </div>

          {dashboardView === "overview" ? (
            <>
          {/* ══ ROW 1: KPI CARDS ════════════════════════════════════════════════ */}
          <div className="dashboard-kpi-grid">
            <KpiCard label="PM1.0"    color={C.pm1}  unit="µg/m³" value={isLoading ? "—" : kpi.pm1.toFixed(1)}  sparkData={spark.pm1}  />
            <KpiCard label="PM2.5"    color={C.pm25} unit="µg/m³" value={isLoading ? "—" : kpi.pm25.toFixed(1)} sparkData={spark.pm25} subLabel="WHO: 35.4 µg/m³" />
            <KpiCard label="PM10"     color={C.pm10} unit="µg/m³" value={isLoading ? "—" : kpi.pm10.toFixed(1)} sparkData={spark.pm10} subLabel="WHO: 50 µg/m³" />
            <KpiCard label="AQI"      color={aqiLevel.color} unit={aqiLevel.label} value={isLoading ? "—" : kpi.aqi} />
            <KpiCard label="Nhiệt độ" color={C.temp} unit="°C"    value={isLoading || !kpi.temp ? "—" : kpi.temp.toFixed(1)} sparkData={spark.temp} />
            <KpiCard label="Độ ẩm"   color={C.hum}  unit="%"     value={isLoading || !kpi.hum  ? "—" : kpi.hum.toFixed(0)}  sparkData={spark.hum}  />
          </div>

          {/* ══ ROW 2: 3 PM CHARTS ══════════════════════════════════════════════ */}
          <ChartCard title="AQI" subtitle={`Line chart · ${timeRange} · forecast: ${mlModel.toUpperCase()}`} badge={<LiveBadge />}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <span style={{ fontFamily: "monospace", fontSize: 26, fontWeight: 700, color: C.aqi }}>
                {kpi.aqi}
              </span>
              <span style={{ fontSize: 11, color: C.muted }}>{aqiLevel.label}</span>
              <ForecastValueBadge value={aqiChart[aqiChart.length - 1]?.forecast} color={C.aqi} />
            </div>
            <PMChart data={aqiChart} color={C.aqi} unit="" referenceValue={100} referenceLabel="AQI 100" height={190} />
          </ChartCard>

          <div className="dashboard-three-grid">

            <ChartCard title="PM1.0" subtitle={`µg/m³ · ${timeRange}`} badge={<LiveBadge />}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <span style={{ fontFamily: "monospace", fontSize: 26, fontWeight: 700, color: C.pm1 }}>
                  {kpi.pm1.toFixed(1)}
                </span>
                <span style={{ fontSize: 11, color: C.muted }}>µg/m³</span>
                <ForecastValueBadge value={pm1Chart[pm1Chart.length - 1]?.forecast} color={C.pm1} />
              </div>
              <PMChart data={pm1Chart} color={C.pm1} height={160} />
            </ChartCard>

            <ChartCard title="PM2.5" subtitle={`µg/m³ · ${timeRange} · WHO: 35.4`} badge={<LiveBadge />}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <span style={{ fontFamily: "monospace", fontSize: 26, fontWeight: 700, color: C.pm25 }}>
                  {kpi.pm25.toFixed(1)}
                </span>
                <span style={{ fontSize: 11, color: C.muted }}>µg/m³</span>
                <ForecastValueBadge value={pm25Chart[pm25Chart.length - 1]?.forecast} color={C.pm25} />
              </div>
              <PMChart data={pm25Chart} color={C.pm25} referenceValue={35.4} referenceLabel="WHO" height={160} />
            </ChartCard>

            <ChartCard title="PM10" subtitle={`µg/m³ · ${timeRange} · WHO: 50`} badge={<LiveBadge />}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <span style={{ fontFamily: "monospace", fontSize: 26, fontWeight: 700, color: C.pm10 }}>
                  {kpi.pm10.toFixed(1)}
                </span>
                <span style={{ fontSize: 11, color: C.muted }}>µg/m³</span>
                <ForecastValueBadge value={pm10Chart[pm10Chart.length - 1]?.forecast} color={C.pm10} />
              </div>
              <PMChart data={pm10Chart} color={C.pm10} referenceValue={50} referenceLabel="WHO" height={160} />
            </ChartCard>
          </div>

          {/* ══ ROW 3: AQI GAUGE + HEATMAP + TEMP/HUM ══════════════════════════ */}
          <div className="dashboard-insight-grid">

            <ChartCard title="AQI" subtitle={activeSensor?.name}>
              <AqiGauge pm25={kpi.pm25} pm10={kpi.pm10} />
            </ChartCard>

            <ChartCard title="Heatmap bụi mịn theo giờ" subtitle="PM1.0 / PM2.5 / PM10 · mỗi ô = trung bình giờ đó">
              <Heatmap
                sensors={activeSensor ? [activeSensor] : []}
                dataPoints={allDataPoints}
              />
            </ChartCard>

            <ChartCard title="Nhiệt độ & Độ ẩm" subtitle={`${timeRange}`}>
              <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
                {[
                  { label: "Nhiệt độ", val: kpi.temp, unit: "°C", color: C.temp },
                  { label: "Độ ẩm",   val: kpi.hum,  unit: "%",  color: C.hum  },
                ].map(m => (
                  <div key={m.label}>
                    <p style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 2 }}>{m.label}</p>
                    <p style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: m.color, lineHeight: 1 }}>
                      {m.val > 0 ? m.val.toFixed(1) : "—"}<span style={{ fontSize: 11, fontWeight: 400, marginLeft: 3 }}>{m.unit}</span>
                    </p>
                  </div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart
                  data={timeseries.filter(d => d.temp !== null)}
                  margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                >
                  <defs>
                    <linearGradient id="gTemp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={C.temp} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={C.temp} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gHum" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={C.hum} stopOpacity={0.12} />
                      <stop offset="95%" stopColor={C.hum} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: C.muted }} tickLine={false} axisLine={{ stroke: C.border }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: C.muted }} tickLine={false} axisLine={false} width={32} />
                  <Tooltip content={<DarkTooltip />} />
                  <Area dataKey="temp" name="Nhiệt độ" stroke={C.temp} fill="url(#gTemp)" strokeWidth={1.5} dot={false} unit="°C" />
                  <Area dataKey="hum"  name="Độ ẩm"   stroke={C.hum}  fill="url(#gHum)"  strokeWidth={1.5} dot={false} unit="%" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* ══ ROW 4: BẢNG DỰ ĐOÁN ML ════════════════════════════════════════ */}
          <ChartCard
            title="Bảng giá trị dự đoán"
            subtitle={`Model: ${mlModel.toUpperCase()} · ${ml.forecastPoints.length} bước dự báo`}
            badge={
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
                background: "rgba(0,120,212,0.08)", color: C.aqi,
                border: `1px dashed ${C.aqi}`,
              }}>FORECAST</span>
            }
          >
            <ForecastTable points={ml.forecastPoints} isLoading={ml.isLoading} />
          </ChartCard>

          {/* ══ ROW 5: SENSOR INFO + ALERTS ════════════════════════════════════ */}
          <div className="dashboard-bottom-grid">

            <ChartCard title="Thông tin cảm biến" subtitle={`${sensors.length} cảm biến · Đang chọn: ${activeSensor?.name ?? "—"}`}>
              <DashboardSensorMap sensors={sensors} selectedSensor={selectedSensor} realtimeReadings={realtimeReadings} />
              {wsError && !isConnected && (
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, fontSize: 11, padding: "7px 10px", borderRadius: 5, background: "rgba(196,49,75,0.06)", color: "#c4314b" }}>
                  <AlertTriangle style={{ width: 12, height: 12, flexShrink: 0 }} />
                  WebSocket: {wsError}
                </div>
              )}
            </ChartCard>

            <ChartCard
              title="Cảnh báo đang hoạt động"
              subtitle={`Tổng: ${alertStats?.totalAlerts ?? 0} · Active: ${alertStats?.activeAlerts ?? 0}`}
              badge={activeAlerts.length > 0 ? (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
                  background: "rgba(196,49,75,0.08)", color: "#c4314b",
                  border: "1px solid rgba(196,49,75,0.25)",
                }}>{activeAlerts.length} ACTIVE</span>
              ) : undefined}
            >
              <AlertList alerts={activeAlerts} />

              {alertStats && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: C.muted, marginBottom: 8 }}>Phân loại</p>
                  {[
                    { label: "PM2.5", val: alertStats.alertsByType?.high_pm25 ?? 0, color: C.pm25 },
                    { label: "PM10",  val: alertStats.alertsByType?.high_pm10 ?? 0, color: C.pm10 },
                    { label: "AQI",   val: alertStats.alertsByType?.high_aqi  ?? 0, color: C.aqi  },
                  ].map(row => {
                    const total = Math.max(alertStats.totalAlerts ?? 1, 1);
                    return (
                      <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, fontSize: 12 }}>
                        <span style={{ width: 36, color: C.subtext, flexShrink: 0 }}>{row.label}</span>
                        <div style={{ flex: 1, height: 5, background: C.border, borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${(row.val / total) * 100}%`, height: "100%", background: row.color, borderRadius: 3 }} />
                        </div>
                        <span style={{ fontFamily: "monospace", fontWeight: 600, color: row.color, minWidth: 18, textAlign: "right" }}>
                          {row.val}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </ChartCard>
          </div>
            </>
          ) : (
            <DriftTrackingSection model={mlModel} />
          )}

        </div>
        </div>
      </div>
    </MainLayout>
  );
};

// ── Inline helper ─────────────────────────────────────────────────────────────
function ForecastValueBadge({ value, color }: { value?: number; color: string }) {
  if (value == null) return null;
  return (
    <span style={{
      marginLeft: "auto", fontSize: 11, fontWeight: 600,
      padding: "2px 8px", borderRadius: 4,
      background: `${color}15`, color,
      border: `1px dashed ${color}`,
      whiteSpace: "nowrap",
    }}>
      ⤳ {value.toFixed(1)} dự báo
    </span>
  );
}

function DashboardSensorMap({
  sensors,
  selectedSensor,
  realtimeReadings,
}: {
  sensors: Sensor[];
  selectedSensor: string;
  realtimeReadings: Map<string, RealtimeDataPoint>;
}) {
  const mapSensors = useMemo(
    () => sensors.filter(s => isValidCoordinate(s.location?.latitude, s.location?.longitude)),
    [sensors],
  );

  const mapCenter = useMemo<[number, number]>(() => {
    const selected = mapSensors.find(s => s.deviceId === selectedSensor);
    const centerSensor = selected ?? mapSensors[0];
    return centerSensor
      ? [centerSensor.location.latitude, centerSensor.location.longitude]
      : [14.0583, 108.2772];
  }, [mapSensors, selectedSensor]);

  const markerRows = useMemo(() => {
    const locationCounts = new Map<string, number>();
    return mapSensors.map(sensor => {
      const key = `${sensor.location.latitude.toFixed(6)},${sensor.location.longitude.toFixed(6)}`;
      const index = locationCounts.get(key) ?? 0;
      locationCounts.set(key, index + 1);
      const offset = getMarkerOffset(index);
      return {
        sensor,
        position: [
          sensor.location.latitude + offset.lat,
          sensor.location.longitude + offset.lng,
        ] as [number, number],
      };
    });
  }, [mapSensors]);

  if (!mapSensors.length) {
    return (
      <div style={{
        height: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: `1px dashed ${C.border}`,
        borderRadius: 5,
        background: "rgba(0,0,0,0.015)",
        color: C.muted,
        fontSize: 12,
      }}>
        Chưa có cảm biến có tọa độ hợp lệ.
      </div>
    );
  }

  return (
    <div style={{ height: 500, border: `1px solid ${C.border}`, borderRadius: 5, overflow: "hidden" }}>
      <MapContainer center={mapCenter} zoom={12} style={{ height: "100%", width: "100%", zIndex: 0 }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {markerRows.map(({ sensor, position }) => {
          const isSelected = sensor.deviceId === selectedSensor;
          const hasRealtime = realtimeReadings.has(sensor.deviceId);
          return (
            <Marker
              key={sensor.sensorId}
              position={position}
              icon={createSensorMapIcon(sensor.status, isSelected, hasRealtime)}
            >
              <Popup maxWidth={260}>
                <div style={{ minWidth: 210, fontSize: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: STATUS_COLOR[sensor.status] ?? C.muted,
                      flexShrink: 0,
                    }} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 700, color: C.text }}>{sensor.name}</p>
                      <code style={{ fontSize: 10, color: C.muted }}>{sensor.deviceId || "—"}</code>
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 4, color: C.subtext }}>
                    <span>Trạng thái: <strong style={{ color: STATUS_COLOR[sensor.status] ?? C.text }}>{STATUS_LABEL[sensor.status] ?? sensor.status}</strong></span>
                    <span>Vị trí: {sensor.location.latitude.toFixed(4)}, {sensor.location.longitude.toFixed(4)}</span>
                    {sensor.customerId && <span>Customer: {sensor.customerId}</span>}
                    {isSelected && <span style={{ color: C.aqi, fontWeight: 700 }}>Đang được chọn trên filter</span>}
                    {hasRealtime && <span style={{ color: C.green, fontWeight: 700 }}>Có dữ liệu realtime</span>}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}

function createSensorMapIcon(status: Sensor["status"], isSelected: boolean, hasRealtime: boolean) {
  const color = STATUS_COLOR[status] ?? C.muted;
  const size = isSelected ? 30 : 20;
  const ringColor = isSelected ? C.aqi : "rgba(255,255,255,0.95)";
  const shadow = isSelected
    ? "0 0 0 5px rgba(0,120,212,0.18), 0 3px 8px rgba(0,0,0,0.32)"
    : "0 2px 5px rgba(0,0,0,0.28)";
  const realtimeDot = hasRealtime
    ? `<span style="position:absolute;right:-1px;top:-1px;width:8px;height:8px;border-radius:50%;background:${C.green};border:1px solid white;"></span>`
    : "";

  return L.divIcon({
    className: "dashboard-sensor-marker",
    html: `<div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:${isSelected ? 4 : 2}px solid ${ringColor};box-shadow:${shadow};">${realtimeDot}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function getMarkerOffset(index: number) {
  if (index === 0) return { lat: 0, lng: 0 };
  const angle = (index - 1) * 1.35;
  const radius = 0.00018 + Math.floor((index - 1) / 6) * 0.00008;
  return {
    lat: Math.cos(angle) * radius,
    lng: Math.sin(angle) * radius,
  };
}

function isValidCoordinate(latitude?: number, longitude?: number) {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export default Index;
