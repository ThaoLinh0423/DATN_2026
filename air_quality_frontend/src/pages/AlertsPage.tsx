import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, BellOff, AlertTriangle, CheckCircle, XCircle, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useAlerts, useUpdateAlert, useDeleteAlert, useAlertStatistics, useBulkUpdateAlerts, useGeneralSettings, useSensors } from "@/hooks/useApi";
import { formatDateVN } from "@/lib/utils";

const AlertsPage = () => {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [limit] = useState(50);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [selectedAlertIds, setSelectedAlertIds] = useState<string[]>([]);

  const { data: alertsData, isLoading: alertsLoading } = useAlerts(
    statusFilter as "all" | "active" | "inactive",
    limit,
    cursor
  );
  const { data: statsData, isLoading: statsLoading } = useAlertStatistics();
  const { data: generalSettings } = useGeneralSettings();
  const timezone = generalSettings?.defaultTimezone || "Asia/Ho_Chi_Minh";
  const displayTimezone = timezone === "Asia/Ho_Chi_Minh" ? "UTC" : timezone;

  // Sensors for mapping
  const { data: sensorsData } = useSensors(1000);
  const sensors = sensorsData?.data || [];
  const sensorMap = useMemo(() => {
    const map = new Map<string, string>();
    sensors.forEach(s => map.set(s.sensorId, s.name));
    return map;
  }, [sensors]);
  const getSensorName = (sensorId: string) => sensorMap.get(sensorId) || sensorId;

  // Mutations
  const updateAlert = useUpdateAlert();
  const deleteAlert = useDeleteAlert();
  const bulkUpdateAlerts = useBulkUpdateAlerts();

  const alerts = alertsData?.data || [];
  const nextCursor = alertsData?.nextCursor;
  const visibleAlertIds = useMemo(() => alerts.map(alert => alert.id), [alerts]);
  const selectedAlerts = useMemo(
    () => alerts.filter(alert => selectedAlertIds.includes(alert.id)),
    [alerts, selectedAlertIds],
  );
  const selectedCount = selectedAlertIds.length;
  const allVisibleSelected = visibleAlertIds.length > 0 && visibleAlertIds.every(id => selectedAlertIds.includes(id));
  const someVisibleSelected = visibleAlertIds.some(id => selectedAlertIds.includes(id));

  const stats = statsData || {
    totalAlerts: 0,
    activeAlerts: 0,
    inactiveAlerts: 0,
    alertsByType: {
      high_pm25: 0,
      high_pm10: 0,
      high_aqi: 0,
    },
  };

  const handleToggleStatus = async (alertId: string, currentStatus: boolean) => {
    try {
      await updateAlert.mutateAsync({
        alertId,
        data: { is_active: !currentStatus },
      });
      toast.success("Đã cập nhật trạng thái cảnh báo");
    } catch (error) {
      toast.error("Lỗi khi cập nhật trạng thái");
    }
  };

  const handleToggleSelectAllVisible = (checked: boolean) => {
    setSelectedAlertIds(prev => {
      if (checked) return Array.from(new Set([...prev, ...visibleAlertIds]));
      return prev.filter(id => !visibleAlertIds.includes(id));
    });
  };

  const handleToggleSelectAlert = (alertId: string, checked: boolean) => {
    setSelectedAlertIds(prev => {
      if (checked) return Array.from(new Set([...prev, alertId]));
      return prev.filter(id => id !== alertId);
    });
  };

  const handleBulkUpdateStatus = async (isActive: boolean) => {
    if (selectedAlertIds.length === 0) return;

    try {
      const result = await bulkUpdateAlerts.mutateAsync({
        alertIds: selectedAlertIds,
        is_active: isActive,
      });
      toast.success(`Đã cập nhật ${result.updatedCount} cảnh báo`);
      setSelectedAlertIds([]);
    } catch (error) {
      toast.error("Lỗi khi cập nhật hàng loạt");
    }
  };

  const handleDelete = async (alertId: string) => {
    try {
      await deleteAlert.mutateAsync(alertId);
      toast.success("Đã xóa cảnh báo");
    } catch (error) {
      toast.error("Lỗi khi xóa cảnh báo");
    }
  };

  const getAlertTypeLabel = (type: string) => {
    switch (type) {
      case "high_pm25":
        return "PM2.5 cao";
      case "high_pm10":
        return "PM10 cao";
      case "high_aqi":
        return "AQI cao";
      default:
        return type;
    }
  };

  const getSeverityBadgeVariant = (severity: string) => {
    return severity === "danger" ? "destructive" : "secondary";
  };

  const isLoading = alertsLoading || statsLoading;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Quản lý Cảnh báo</h1>
            <p className="text-muted-foreground">Theo dõi và xử lý các cảnh báo chất lượng không khí</p>
          </div>
        </div>

        {/* Summary Cards */}
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Tổng cảnh báo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalAlerts}</div>
              </CardContent>
            </Card>
            <Card className="border-destructive/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Đang hoạt động
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">{stats.activeAlerts}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Đã xử lý
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{stats.inactiveAlerts}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-4">
          <Select value={statusFilter} onValueChange={(value) => {
            setStatusFilter(value);
            setCursor(undefined); // Reset pagination
            setSelectedAlertIds([]);
          }}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Lọc theo trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="active">Đang hoạt động</SelectItem>
              <SelectItem value="inactive">Đã xử lý</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {selectedCount > 0 && (
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Đã chọn {selectedCount} cảnh báo</p>
              <p className="text-xs text-muted-foreground">
                {selectedAlerts.filter(alert => alert.is_active).length} đang hoạt động · {selectedAlerts.filter(alert => !alert.is_active).length} đã xử lý
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkUpdateStatus(false)}
                disabled={bulkUpdateAlerts.isPending}
                className="gap-2"
              >
                {bulkUpdateAlerts.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Đánh dấu đã xử lý
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkUpdateStatus(true)}
                disabled={bulkUpdateAlerts.isPending}
                className="gap-2"
              >
                {bulkUpdateAlerts.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Kích hoạt lại
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedAlertIds([])}
                disabled={bulkUpdateAlerts.isPending}
              >
                Bỏ chọn
              </Button>
            </div>
          </div>
        )}

        {/* Alerts Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                    onCheckedChange={checked => handleToggleSelectAllVisible(checked === true)}
                    aria-label="Chọn tất cả cảnh báo đang hiển thị"
                  />
                </TableHead>
                <TableHead className="w-12">STT</TableHead>
                <TableHead>Trạm đo</TableHead>
                <TableHead>Loại cảnh báo</TableHead>
                <TableHead>Nội dung</TableHead>
                <TableHead>Mức độ</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Giá trị / Ngưỡng</TableHead>
                <TableHead>Thời gian</TableHead>
                <TableHead className="w-32">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alertsLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : alerts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    Không có cảnh báo nào
                  </TableCell>
                </TableRow>
              ) : (
                alerts.map((alert, index) => (
                  <TableRow key={alert.id} data-state={selectedAlertIds.includes(alert.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selectedAlertIds.includes(alert.id)}
                        onCheckedChange={checked => handleToggleSelectAlert(alert.id, checked === true)}
                        aria-label={`Chọn cảnh báo ${index + 1}`}
                      />
                    </TableCell>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className="font-medium">{getSensorName(alert.sensorId)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{getAlertTypeLabel(alert.alert_type)}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{alert.message}</TableCell>
                    <TableCell>
                      <Badge variant={getSeverityBadgeVariant(alert.severity)}>
                        {alert.severity === "danger" ? "Nguy hiểm" : "Cảnh báo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {alert.is_active ? (
                        <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                          <Bell className="h-3 w-3" />
                          Đang hoạt động
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                          <BellOff className="h-3 w-3" />
                          Đã xử lý
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {alert.value.toFixed(2)} / {alert.threshold.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDateVN(alert.created_at, displayTimezone)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleStatus(alert.id, alert.is_active)}
                          disabled={updateAlert.isPending}
                          title={alert.is_active ? "Đánh dấu đã xử lý" : "Kích hoạt lại"}
                        >
                          {alert.is_active ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <Bell className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(alert.id)}
                          disabled={deleteAlert.isPending}
                          title="Xóa"
                        >
                          <XCircle className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {nextCursor && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={() => setCursor(nextCursor)}
              disabled={alertsLoading}
            >
              Tải thêm
            </Button>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default AlertsPage;
