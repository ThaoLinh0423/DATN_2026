import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Trash2, RefreshCw, Loader2, AlertCircle, Cpu, Wifi } from "lucide-react";
import { toast } from "sonner";
import {
  useSensors, useCreateSensor, useDeleteSensor, Sensor, SensorInput,
  useDiscoverDevices,
} from "@/hooks/useApi";
import { useRole } from "@/hooks/useRole";

const SensorsPage = () => {
  const { isAdminOrManager, isUser } = useRole();
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [formData, setFormData] = useState<SensorInput>({
    name: "",
    deviceId: "",
    topicPath: "",
    customerId: "",
    type: "iot",
    location: { latitude: 21.0285, longitude: 105.8581 },
  });

  const { data: sensorsData, isLoading, refetch, error } = useSensors(100);
  const sensors = sensorsData?.data || [];

  // Discover devices từ InfluxDB để gợi ý deviceId
  const { data: discoverData } = useDiscoverDevices();
  const discoveredDevices = discoverData?.devices || [];

  const createSensor = useCreateSensor();
  const deleteSensor = useDeleteSensor();

  const filteredSensors = useMemo(() => sensors.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase())
      || s.deviceId?.toLowerCase().includes(searchTerm.toLowerCase())
      || s.customerId?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchType = typeFilter === "all" || s.type === typeFilter;
    const matchStatus = statusFilter === "all" || s.status === statusFilter;
    return matchSearch && matchType && matchStatus;
  }), [sensors, searchTerm, typeFilter, statusFilter]);

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      active: { label: "Hoạt động", variant: "default" },
      maintenance: { label: "Bảo trì", variant: "secondary" },
      inactive: { label: "Không hoạt động", variant: "destructive" },
    };
    const s = map[status] || { label: status, variant: "outline" };
    return <Badge variant={s.variant}>{s.label}</Badge>;
  };

  const handleSelectDevice = (deviceId: string) => {
    const device = discoveredDevices.find(d => d.deviceId === deviceId);
    setFormData(prev => ({
      ...prev,
      deviceId,
      topicPath: prev.topicPath || `${prev.customerId || "customer"}/${deviceId}/all`,
    }));
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) { toast.error("Tên cảm biến không được để trống"); return; }
    if (!formData.deviceId.trim()) { toast.error("Device ID không được để trống"); return; }
    if (!formData.topicPath.trim()) { toast.error("Topic Path không được để trống"); return; }
    if (!formData.customerId.trim()) { toast.error("Customer ID không được để trống"); return; }

    try {
      await createSensor.mutateAsync(formData);
      toast.success("Thêm cảm biến thành công");
      setFormData({ name: "", deviceId: "", topicPath: "", customerId: "", type: "iot", location: { latitude: 21.0285, longitude: 105.8581 } });
      setIsAddDialogOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Lỗi khi tạo cảm biến";
      if (msg.includes("403") || msg.toLowerCase().includes("forbidden"))
        toast.error("Cần role 'manager' hoặc 'admin' để tạo cảm biến");
      else toast.error(msg);
    }
  };

  const handleDelete = async (sensorId: string, name: string) => {
    if (!confirm(`Xóa cảm biến "${name}"?`)) return;
    try {
      await deleteSensor.mutateAsync(sensorId);
      toast.success("Xóa cảm biến thành công");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi khi xóa");
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Quản lý Cảm biến</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Danh sách cảm biến đã đăng ký và liên kết với InfluxDB
            </p>
          </div>
          <div className="flex items-center gap-2">
<Button variant="outline" size="icon" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
            {/* Chỉ admin/manager mới được thêm sensor */}
            {isAdminOrManager && (
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="h-4 w-4 mr-2" />Thêm cảm biến</Button>
                </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Thêm cảm biến mới</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  {/* Gợi ý từ InfluxDB */}
                  {discoveredDevices.length > 0 && (
                    <div className="space-y-2">
                      <Label>Chọn từ InfluxDB (đã discover)</Label>
                      <Select onValueChange={handleSelectDevice}>
                        <SelectTrigger>
                          <SelectValue placeholder="-- Chọn device đã có dữ liệu --" />
                        </SelectTrigger>
                        <SelectContent>
                          {discoveredDevices.map(d => (
                            <SelectItem key={d.deviceId} value={d.deviceId}>
                              <div className="flex items-center gap-2">
                                <Wifi className="h-3 w-3 text-green-500" />
                                {d.deviceId}
                                {d.location && <span className="text-muted-foreground">({d.location})</span>}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Hoặc điền thủ công bên dưới
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="name">Tên cảm biến *</Label>
                    <Input id="name" placeholder="VD: Cảm biến phòng khách"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="deviceId">
                      Device ID *
                      <span className="text-xs text-muted-foreground ml-1">(tag sensor_node trong InfluxDB)</span>
                    </Label>
                    <Input id="deviceId" placeholder="VD: esp32_sensor_001"
                      value={formData.deviceId}
                      onChange={e => setFormData({ ...formData, deviceId: e.target.value })} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="customerId">Customer ID *</Label>
                    <Input id="customerId" placeholder="VD: customer_a"
                      value={formData.customerId}
                      onChange={e => setFormData({ ...formData, customerId: e.target.value })} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="topicPath">
                      MQTT Topic Path *
                      <span className="text-xs text-muted-foreground ml-1">(pattern: customer/sensor/all)</span>
                    </Label>
                    <Input id="topicPath" placeholder="VD: sensors/esp32_sensor_001/all"
                      value={formData.topicPath}
                      onChange={e => setFormData({ ...formData, topicPath: e.target.value })} />
                  </div>

                  <div className="space-y-2">
                    <Label>Loại cảm biến *</Label>
                    <Select value={formData.type}
                      onValueChange={v => setFormData({ ...formData, type: v as "iot" | "external_station" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="iot">IoT</SelectItem>
                        <SelectItem value="external_station">Trạm ngoài</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="lat">Vĩ độ</Label>
                      <Input id="lat" type="number" step="0.000001"
                        value={formData.location.latitude}
                        onChange={e => setFormData({ ...formData, location: { ...formData.location, latitude: parseFloat(e.target.value) || 0 } })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lng">Kinh độ</Label>
                      <Input id="lng" type="number" step="0.000001"
                        value={formData.location.longitude}
                        onChange={e => setFormData({ ...formData, location: { ...formData.location, longitude: parseFloat(e.target.value) || 0 } })} />
                    </div>
                  </div>

                  <Button onClick={handleSubmit} disabled={createSensor.isPending} className="w-full">
                    {createSensor.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Thêm cảm biến
                  </Button>
                </div>
</DialogContent>
            </Dialog>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
            <p className="text-sm text-destructive">{error.message}</p>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Tìm tên, deviceId, customerId..."
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Loại" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả loại</SelectItem>
              <SelectItem value="iot">IoT</SelectItem>
              <SelectItem value="external_station">Trạm ngoài</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Trạng thái" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="active">Hoạt động</SelectItem>
              <SelectItem value="maintenance">Bảo trì</SelectItem>
              <SelectItem value="inactive">Không hoạt động</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <p className="text-sm text-muted-foreground">{filteredSensors.length} cảm biến</p>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /><span>Đang tải...</span>
            </div>
) : filteredSensors.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <Cpu className="h-8 w-8" />
              {isUser ? (
                <>
                  <p>Bạn chưa được cấp quyền xem sensor nào</p>
                  <p className="text-xs">Liên hệ admin để được cấp quyền truy cập</p>
                </>
              ) : (
                <>
                  <p>Chưa có cảm biến nào</p>
                  {discoveredDevices.length > 0 && (
                    <p className="text-xs">Đã phát hiện {discoveredDevices.length} device từ InfluxDB — nhấn "Thêm cảm biến" để đăng ký</p>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    {["STT","Tên","Device ID","Customer","MQTT Topic","Loại","Trạng thái","Ngày tạo",""].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredSensors.map((sensor, i) => (
                    <tr key={sensor.sensorId} className="hover:bg-muted/50">
                      <td className="px-4 py-3 text-sm">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm">{sensor.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {sensor.location.latitude.toFixed(4)}, {sensor.location.longitude.toFixed(4)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{sensor.deviceId || "—"}</code>
                      </td>
                      <td className="px-4 py-3 text-sm">{sensor.customerId || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted-foreground font-mono truncate max-w-[180px] block">{sensor.topicPath || "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-sm">{sensor.type === "iot" ? "IoT" : "Trạm ngoài"}</td>
                      <td className="px-4 py-3">{getStatusBadge(sensor.status)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(sensor.createdAt).toLocaleDateString("vi-VN")}
                      </td>
<td className="px-4 py-3">
                        {isAdminOrManager ? (
                          <Button variant="ghost" size="icon"
                            onClick={() => handleDelete(sensor.sensorId, sensor.name)}
                            disabled={deleteSensor.isPending}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default SensorsPage;
