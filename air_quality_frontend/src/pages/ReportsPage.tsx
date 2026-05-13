import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Plus, Eye, Trash2, Loader2, Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { useSensors, useHistoricalData, Sensor, DataPoint } from "@/hooks/useApi";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Type cho báo cáo được tính từ data thật
interface ComputedReport {
  sensorId: string;
  sensorName: string;
  customerId: string;
  period: "daily" | "weekly" | "monthly";
  avg_pm25: number | null;
  avg_pm10: number | null;
  max_pm25: number | null;
  dataPoints: number;
  generated_at: string;
}

// Helper: Tính toán report từ historical data
function computeReport(
  sensor: Sensor,
  dataPoints: DataPoint[],
  period: "daily" | "weekly" | "monthly"
): ComputedReport {
  const pm25Values = dataPoints
    .map((d) => d.values.pm25)
    .filter((v): v is number => v !== undefined && v !== null);
  
  const pm10Values = dataPoints
    .map((d) => d.values.pm10)
    .filter((v): v is number => v !== undefined && v !== null);

  const avg_pm25 = pm25Values.length > 0
    ? Math.round((pm25Values.reduce((a, b) => a + b, 0) / pm25Values.length) * 10) / 10
    : null;
  
  const avg_pm10 = pm10Values.length > 0
    ? Math.round((pm10Values.reduce((a, b) => a + b, 0) / pm10Values.length) * 10) / 10
    : null;
  
  const max_pm25 = pm25Values.length > 0
    ? Math.round(Math.max(...pm25Values) * 10) / 10
    : null;

  return {
    sensorId: sensor.sensorId,
    sensorName: sensor.name,
    customerId: sensor.customerId,
    period,
    avg_pm25,
    avg_pm10,
    max_pm25,
    dataPoints: dataPoints.length,
    generated_at: new Date().toISOString(),
  };
}

// Helper: Tính thời gian cho period
function getPeriodRange(period: "daily" | "weekly" | "monthly"): { startTime: string; endTime: string } {
  const now = new Date();
  const endTime = now.toISOString();
  let startTime: Date;

  switch (period) {
    case "daily":
      startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "weekly":
      startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "monthly":
      startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }

  return { startTime: startTime.toISOString(), endTime };
}

const ReportsPage = () => {
  const [periodFilter, setPeriodFilter] = useState<string>("daily");
  const [customerIdFilter, setCustomerIdFilter] = useState<string>("all");

  // Fetch sensors
  const { data: sensorsData, isLoading: sensorsLoading, error: sensorsError } = useSensors(100);
  const sensors = sensorsData?.data ?? [];

  // Lấy danh sách customerIds unique
  const customerIds = useMemo(() => {
    const ids = new Set(sensors.map((s) => s.customerId));
    return Array.from(ids);
  }, [sensors]);

  // Period hiện tại
  const period = periodFilter as "daily" | "weekly" | "monthly";
  const periodRange = useMemo(() => getPeriodRange(period), [period]);

  // Fetch historical data cho từng sensor (chỉ fetch khi có sensors)
  // NOTE: Với nhiều sensors, có thể cần optimize bằng cách chỉ fetch cho sensors được chọn
  // Hiện tại fetch cho tất cả sensors active
  const activeSensors = sensors.filter((s) => s.status === "active");
  
  // Sử dụng hook để fetch historical data cho sensor đầu tiên (demo)
  // Trong thực tế, nên fetch song song cho nhiều sensors
  const historicalDataQueries = activeSensors.slice(0, 10).map((sensor) => ({
    sensor,
    // eslint-disable-next-line react-hooks/rules-of-hooks
    ...useHistoricalData({
      sensorNode: sensor.deviceId,
      startTime: periodRange.startTime,
      endTime: periodRange.endTime,
      limit: 500,
    }),
  }));

  // Tính reports từ data
  const reports: ComputedReport[] = useMemo(() => {
    return historicalDataQueries
      .filter((q) => q.data?.data && q.data.data.length > 0)
      .map((q) => computeReport(q.sensor, q.data!.data, period));
  }, [historicalDataQueries, period]);

  // Filter reports theo customerId
  const filteredReports = useMemo(() => {
    if (customerIdFilter === "all") return reports;
    return reports.filter((r) => r.customerId === customerIdFilter);
  }, [reports, customerIdFilter]);

  // Loading state
  const isLoading = sensorsLoading || historicalDataQueries.some((q) => q.isLoading);

  // Error state
  if (sensorsError) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-destructive">Lỗi khi tải dữ liệu: {(sensorsError as Error).message}</p>
        </div>
      </MainLayout>
    );
  }

  const getPeriodLabel = (p: string) => {
    switch (p) {
      case "daily":
        return "Hàng ngày";
      case "weekly":
        return "Hàng tuần";
      case "monthly":
        return "Hàng tháng";
      default:
        return p;
    }
  };

  const getPeriodVariant = (p: string) => {
    switch (p) {
      case "daily":
        return "default";
      case "weekly":
        return "secondary";
      case "monthly":
        return "outline";
      default:
        return "default";
    }
  };

  const handleGenerateReport = () => {
    toast.success("Đang làm mới dữ liệu báo cáo...");
    // Refetch tất cả queries
    historicalDataQueries.forEach((q) => q.refetch());
  };

  const handleView = (report: ComputedReport) => {
    toast.info(`Xem chi tiết sensor: ${report.sensorName}`);
  };

  const handleDelete = (sensorId: string) => {
    toast.success("Đã xóa báo cáo");
  };

  // Export functions
  const exportToCSV = () => {
    if (filteredReports.length === 0) {
      toast.error("Không có dữ liệu để xuất");
      return;
    }
    
    const headers = ["STT", "Sensor", "Device ID", "Khách hàng", "Kỳ báo cáo", "PM2.5 TB", "PM10 TB", "PM2.5 Max", "Điểm đo"];
    const rows = filteredReports.map((r, i) => [
      i + 1,
      r.sensorName,
      r.sensorId,
      r.customerId,
      getPeriodLabel(r.period),
      r.avg_pm25 ?? "--",
      r.avg_pm10 ?? "--",
      r.max_pm25 ?? "--",
      r.dataPoints,
    ]);
    
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(",")),
    ].join("\n");
    
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `bao-cao-${periodFilter}-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success("Đã xuất file CSV");
  };

  const exportToExcel = () => {
    if (filteredReports.length === 0) {
      toast.error("Không có dữ liệu để xuất");
      return;
    }
    
    // Tạo HTML table cho Excel
    const headers = ["STT", "Sensor", "Device ID", "Khách hàng", "Kỳ báo cáo", "PM2.5 TB (µg/m³)", "PM10 TB (µg/m³)", "PM2.5 Max (µg/m³)", "Điểm đo"];
    const rows = filteredReports.map((r, i) => [
      i + 1,
      r.sensorName,
      r.sensorId,
      r.customerId,
      getPeriodLabel(r.period),
      r.avg_pm25 ?? "--",
      r.avg_pm10 ?? "--",
      r.max_pm25 ?? "--",
      r.dataPoints,
    ]);
    
    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
        <head><meta charset="utf-8"></head>
        <body>
          <table border="1">
            <tr>${headers.map(h => `<th style="background:#0078d4;color:white;font-weight:bold;padding:8px">${h}</th>`).join("")}</tr>
            ${rows.map(row => `<tr>${row.map(cell => `<td style="padding:6px">${cell}</td>`).join("")}</tr>`).join("")}
          </table>
        </body>
      </html>
    `;
    
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `bao-cao-${periodFilter}-${new Date().toISOString().split("T")[0]}.xls`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success("Đã xuất file Excel");
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Báo cáo</h1>
            <p className="text-muted-foreground">Xem và thống kê chất lượng không khí từ dữ liệu thực</p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleGenerateReport} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Làm mới báo cáo
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={filteredReports.length === 0}>
                  <Download className="h-4 w-4 mr-2" />
                  Xuất dữ liệu
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportToCSV}>
                  <FileText className="h-4 w-4 mr-2" />
                  Xuất CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportToExcel}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Xuất Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Sensors có dữ liệu
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{reports.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tổng điểm đo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {reports.reduce((sum, r) => sum + r.dataPoints, 0).toLocaleString("vi-VN")}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                PM2.5 Trung bình
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {reports.length > 0
                  ? (
                      reports.reduce((sum, r) => sum + (r.avg_pm25 ?? 0), 0) / 
                      reports.filter((r) => r.avg_pm25 !== null).length
                    ).toFixed(1)
                  : "--"}{" "}
                µg/m³
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                PM2.5 Cao nhất
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {reports.length > 0
                  ? Math.max(...reports.map((r) => r.max_pm25 ?? 0)).toFixed(1)
                  : "--"}{" "}
                µg/m³
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Lọc theo kỳ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Hàng ngày</SelectItem>
              <SelectItem value="weekly">Hàng tuần</SelectItem>
              <SelectItem value="monthly">Hàng tháng</SelectItem>
            </SelectContent>
          </Select>
          <Select value={customerIdFilter} onValueChange={setCustomerIdFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Lọc theo khách hàng" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả khách hàng</SelectItem>
              {customerIds.map((id) => (
                <SelectItem key={id} value={id}>
                  {id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Đang tải dữ liệu...</span>
          </div>
        )}

        {/* Reports Table */}
        {!isLoading && (
          <div className="border rounded-lg">
            {filteredReports.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Không có dữ liệu cho kỳ đã chọn. Thử chọn kỳ khác hoặc kiểm tra kết nối API.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">STT</TableHead>
                    <TableHead>Sensor</TableHead>
                    <TableHead>Khách hàng</TableHead>
                    <TableHead>Kỳ báo cáo</TableHead>
                    <TableHead>PM2.5 TB</TableHead>
                    <TableHead>PM10 TB</TableHead>
                    <TableHead>PM2.5 Max</TableHead>
                    <TableHead>Điểm đo</TableHead>
                    <TableHead className="w-24">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReports.map((report, index) => (
                    <TableRow key={report.sensorId}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-medium">{report.sensorName}</TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{report.customerId}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getPeriodVariant(report.period) as any}>
                          {getPeriodLabel(report.period)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {report.avg_pm25 !== null ? `${report.avg_pm25} µg/m³` : "--"}
                      </TableCell>
                      <TableCell>
                        {report.avg_pm10 !== null ? `${report.avg_pm10} µg/m³` : "--"}
                      </TableCell>
                      <TableCell>
                        {report.max_pm25 !== null ? (
                          <span className="font-semibold">{report.max_pm25} µg/m³</span>
                        ) : (
                          "--"
                        )}
                      </TableCell>
                      <TableCell>{report.dataPoints.toLocaleString("vi-VN")}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleView(report)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(report.sensorId)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default ReportsPage;
