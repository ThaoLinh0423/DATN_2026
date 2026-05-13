import { useState, useMemo, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Download, RefreshCw, AlertTriangle, Thermometer, Droplets } from "lucide-react";
import { useSensors, useGeneralSettings } from "@/hooks/useApi";
import { useWebSocket, RealtimeDataPoint } from "@/hooks/useWebSocket";
import { formatDateVN } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { apiClient, PaginatedResponse, DataPoint } from "@/api/client";

// ─── AQI helpers ──────────────────────────────────────────────────────────────
const getAQIInfo = (pm25: number) => {
  if (pm25 <= 12)    return { color: "bg-green-500",  label: "Tốt",                   badge: "default" };
  if (pm25 <= 35.4)  return { color: "bg-yellow-500", label: "Trung bình",             badge: "secondary" };
  if (pm25 <= 55.4)  return { color: "bg-orange-500", label: "Nhóm nhạy cảm",         badge: "secondary" };
  if (pm25 <= 150.4) return { color: "bg-red-500",    label: "Không lành mạnh",        badge: "destructive" };
  if (pm25 <= 250.4) return { color: "bg-purple-500", label: "Rất không lành mạnh",   badge: "destructive" };
  return               { color: "bg-rose-900",         label: "Nguy hại",              badge: "destructive" };
};

// ─── Component ────────────────────────────────────────────────────────────────
const DustReadingsPage = () => {
  const [sensorFilter, setSensorFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [realtimeReadings, setRealtimeReadings] = useState<Map<string, RealtimeDataPoint>>(new Map());

  // Sensors từ DB — dùng deviceId (= sensor_node) làm key
  const { data: sensorsData, isLoading: sensorsLoading, refetch: refetchSensors } = useSensors(100);
  const sensors = sensorsData?.data || [];

  // WebSocket cần sensorId (UUID) để subscribe
  const sensorIds = sensors.map(s => s.sensorId).filter(Boolean);
  // deviceId dùng để query data và map với InfluxDB tag sensor_node
  const sensorNodes = sensors.map(s => s.deviceId).filter(Boolean);

  // Historical data — fetch all sensors when "all" is selected, or single sensor otherwise
  const timeRange = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return { startTime: start.toISOString(), endTime: now.toISOString() };
  }, []);

  const targetNodes = useMemo(() => {
    if (sensorFilter === "all") return sensorNodes;
    return sensorNodes.includes(sensorFilter) ? [sensorFilter] : [];
  }, [sensorFilter, sensorNodes]);

  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: ["data", "historical", targetNodes, timeRange.startTime, timeRange.endTime],
    queryFn: async () => {
      if (targetNodes.length === 0) return [];
      // Fetch all sensors in parallel
      const results = await Promise.all(
        targetNodes.map(node =>
          apiClient.get<PaginatedResponse<DataPoint>>("/data/historical", {
            params: { sensorNode: node, startTime: timeRange.startTime, endTime: timeRange.endTime, limit: 500 },
          })
        )
      );
      // Merge and deduplicate by dataPointId
      const all: DataPoint[] = [];
      const seen = new Set<string>();
      for (const res of results) {
        for (const dp of res.data || []) {
          if (!seen.has(dp.dataPointId)) {
            seen.add(dp.dataPointId);
            all.push(dp);
          }
        }
      }
      // Sort by timestamp descending
      all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return all;
    },
    enabled: targetNodes.length > 0,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const dataPoints = historyData || [];
  const { data: generalSettings } = useGeneralSettings();
  const timezone = generalSettings?.defaultTimezone || "Asia/Ho_Chi_Minh";

  // WebSocket realtime — subscribe tất cả sensor_node
  const handleRealtimeData = useCallback((newData: RealtimeDataPoint) => {
    setRealtimeReadings(prev => new Map(prev).set(newData.sensorId, newData));
  }, []);

  const { isConnected, error: wsError } = useWebSocket({
    sensorIds: sensorIds,
    enabled: sensorIds.length > 0,
    onDataReceived: handleRealtimeData,
    reconnectAttempts: 5,
    throttleMs: 1000,
  });

  // Merge historical + realtime
  const allDataPoints = useMemo(() => {
    const combined = [...dataPoints];
    realtimeReadings.forEach(rt => {
      if (sensorFilter === "all" || rt.sensorId === sensorFilter) {
        combined.unshift(rt as unknown as DataPoint);
      }
    });
    return combined;
  }, [dataPoints, realtimeReadings, sensorFilter]);

  // Filter by date
  const filteredReadings = useMemo(() => {
    return allDataPoints.filter(r => {
      if (!startDate && !endDate) return true;
      const d = new Date(r.timestamp);
      if (startDate && d < new Date(startDate)) return false;
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (d > end) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [allDataPoints, startDate, endDate]);

  // Stats
  const stats = useMemo(() => {
    if (!filteredReadings.length) return { avgPM25: 0, avgPM10: 0, avgTemp: 0, avgHumidity: 0, count: 0 };
    const n = filteredReadings.length;
    const sum = (key: string) =>
      filteredReadings.reduce((acc, r) => acc + (Number((r.values as Record<string, number>)[key]) || 0), 0);
    return {
      avgPM25:    sum("pm25") / n,
      avgPM10:    sum("pm10") / n,
      avgTemp:    sum("temperature") / n,
      avgHumidity: sum("humidity") / n,
      count: n,
    };
  }, [filteredReadings]);

  // Sensor name helper
  const getSensorLabel = (sensorId: string) => {
    const s = sensors.find(s => s.sensorId === sensorId);
    return s?.name || sensorId;
  };

  const isLoading = sensorsLoading || historyLoading;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dữ liệu Nồng độ Bụi</h1>
            <p className="text-muted-foreground">PM1, PM2.5, PM10, Nhiệt độ, Độ ẩm, Chỉ số nhiệt</p>
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500 animate-pulse" : "bg-red-400"}`} />
                <span className="text-xs text-muted-foreground">
                  {isConnected
                    ? `Realtime: ${realtimeReadings.size} sensor đang nhận`
                    : "Realtime: Đang kết nối..."}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">{filteredReadings.length} bản ghi</span>
            </div>
            {wsError && !isConnected && (
              <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />{wsError}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { refetchSensors(); refetchHistory(); setRealtimeReadings(new Map()); }} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />Làm mới
            </Button>
            <Button variant="outline"><Download className="h-4 w-4 mr-2" />Xuất Excel</Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "PM2.5 TB", value: stats.avgPM25.toFixed(1), unit: "µg/m³" },
            { label: "PM10 TB",  value: stats.avgPM10.toFixed(1),  unit: "µg/m³" },
            { label: "Nhiệt độ TB", value: stats.avgTemp.toFixed(1), unit: "°C",
              icon: <Thermometer className="h-4 w-4 text-orange-500" /> },
            { label: "Độ ẩm TB", value: stats.avgHumidity.toFixed(0), unit: "%",
              icon: <Droplets className="h-4 w-4 text-blue-500" /> },
          ].map(s => (
            <Card key={s.label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  {s.icon}{s.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{isLoading ? "—" : s.value}</div>
                <p className="text-xs text-muted-foreground">{s.unit}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <Select value={sensorFilter} onValueChange={setSensorFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Chọn cảm biến" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả cảm biến</SelectItem>
              {sensors.map(s => (
                <SelectItem key={s.sensorId} value={s.deviceId || s.sensorId}>
                  {s.name} <span className="text-muted-foreground text-xs ml-1">({s.deviceId})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-36" />
            <span className="text-muted-foreground text-sm">—</span>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-36" />
          </div>
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">STT</TableHead>
                <TableHead>Cảm biến</TableHead>
                <TableHead>PM1 (µg/m³)</TableHead>
                <TableHead>PM2.5 (µg/m³)</TableHead>
                <TableHead>PM10 (µg/m³)</TableHead>
                <TableHead>Nhiệt độ (°C)</TableHead>
                <TableHead>Độ ẩm (%)</TableHead>
                <TableHead>Chỉ số nhiệt (°C)</TableHead>
                <TableHead>Trạng thái KK</TableHead>
                <TableHead>Thời gian</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-10">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filteredReadings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-10 text-muted-foreground">
                    Không có dữ liệu
                    {targetNodes.length === 0 && <p className="text-xs mt-1">Hãy thêm cảm biến và cấu hình InfluxDB</p>}
                  </TableCell>
                </TableRow>
              ) : (
                filteredReadings.slice(0, 200).map((reading, i) => {
                  const pm25 = reading.values.pm25 ?? 0;
                  const pm1  = reading.values.pm1;
                  const pm10 = reading.values.pm10;
                  const temp = reading.values.temperature;
                  const humidity = reading.values.humidity;
                  const heatIndex = reading.values.heatIndex;
                  const aqiStatus = (reading.values as Record<string, unknown>).aqiStatus as string || (reading.values as Record<string, unknown>).comfort as string;
                  const aqi = getAQIInfo(pm25);
                  const isLive = realtimeReadings.has(reading.sensorId)
                    && realtimeReadings.get(reading.sensorId)?.dataPointId === reading.dataPointId;

                  return (
                    <TableRow key={`${reading.dataPointId}-${i}`}
                      className={isLive ? "bg-green-50 dark:bg-green-950/20" : ""}>
                      <TableCell className="text-sm">{i + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{getSensorLabel(reading.sensorId)}</span>
                          {isLive && <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-green-600">LIVE</Badge>}
                        </div>
                        {(reading as unknown as Record<string, string>).location && (
                          <span className="text-xs text-muted-foreground">{(reading as unknown as Record<string, string>).location}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{pm1 != null ? pm1.toFixed(0) : "—"}</TableCell>
                      <TableCell>
                        <span className={`text-sm font-medium ${pm25 > 35 ? "text-orange-600" : ""}`}>
                          {pm25.toFixed(1)}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{pm10 != null ? pm10.toFixed(0) : "—"}</TableCell>
                      <TableCell className="text-sm">{temp != null ? `${temp.toFixed(1)}` : "—"}</TableCell>
                      <TableCell className="text-sm">{humidity != null ? `${humidity.toFixed(0)}` : "—"}</TableCell>
                      <TableCell className="text-sm">
                        {heatIndex != null ? (
                          <span className={heatIndex > 32 ? "text-orange-600 font-medium" : ""}>
                            {heatIndex.toFixed(1)}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2.5 h-2.5 rounded-full ${aqi.color}`} />
                          <span className="text-xs">{aqiStatus || aqi.label}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateVN(reading.timestamp, timezone)}
                      </TableCell>
                      <TableCell>
                        <div className={`w-2 h-2 rounded-full ${isLive ? "bg-green-500 animate-pulse" : "bg-muted-foreground/30"}`}
                          title={isLive ? "Realtime" : "Lịch sử"} />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </MainLayout>
  );
};

export default DustReadingsPage;