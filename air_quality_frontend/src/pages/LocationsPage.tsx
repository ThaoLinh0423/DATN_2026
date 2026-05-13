import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Search, MapPin, RefreshCw, AlertCircle, Activity, Wifi, Trash2, Plus, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSensors, Sensor, useDeleteSensor, useCreateSensor, useDiscoverDevices } from "@/hooks/useApi";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";
import { format } from "date-fns";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useQueryClient } from "@tanstack/react-query";

const LocationsPage = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "", deviceId: "", topicPath: "",
    customerId: "", type: "iot" as "iot" | "external_station",
    location: { latitude: 21.0285, longitude: 105.8581 },
  });

  const queryClient = useQueryClient();
  const { isAdminOrManager } = useRole();
  const deleteSensor = useDeleteSensor();
  const createSensor = useCreateSensor();
  const { data: discoverData } = useDiscoverDevices();
  const discoveredDevices = discoverData?.devices || [];

  const { data: sensorsData, isLoading, refetch, error } = useSensors(1000);
  const sensors = sensorsData?.data || [];

  // Group sensors by location (lat/lng)
  const locationGroups = useMemo(() => {
    const groups = new Map<string, {
      latitude: number; longitude: number; locationKey: string;
      sensors: Sensor[]; activeSensors: number; inactiveSensors: number; maintenanceSensors: number;
    }>();

    sensors.forEach(sensor => {
      const lat = sensor.location.latitude.toFixed(4);
      const lng = sensor.location.longitude.toFixed(4);
      const key = `${lat},${lng}`;

      if (!groups.has(key)) {
        groups.set(key, { latitude: sensor.location.latitude, longitude: sensor.location.longitude, locationKey: key, sensors: [], activeSensors: 0, inactiveSensors: 0, maintenanceSensors: 0 });
      }

      const g = groups.get(key)!;
      g.sensors.push(sensor);
      if (sensor.status === "active")      g.activeSensors++;
      else if (sensor.status === "inactive") g.inactiveSensors++;
      else if (sensor.status === "maintenance") g.maintenanceSensors++;
    });

    return Array.from(groups.values());
  }, [sensors]);

  const filteredLocations = useMemo(() =>
    locationGroups.filter(loc =>
      loc.locationKey.includes(searchTerm) ||
      loc.sensors.some(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.deviceId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.customerId?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    ), [locationGroups, searchTerm]);

  const mapCenter = useMemo<[number, number]>(() =>
    filteredLocations.length > 0
      ? [filteredLocations[0].latitude, filteredLocations[0].longitude]
      : [14.0583, 108.2772]
  , [filteredLocations]);

  const getGroupColor = (loc: typeof locationGroups[0]): string => {
    if (loc.maintenanceSensors > 0) return "#eab308";
    if (loc.inactiveSensors > 0)   return "#94a3b8";
    if (loc.activeSensors > 0)     return "#22c55e";
    return "#64748b";
  };

  const createCircleIcon = (color: string) =>
    L.divIcon({
      className: "bg-transparent border-none",
      html: `<div style="background-color:${color};width:24px;height:24px;border-radius:50%;opacity:0.8;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)"></div>`,
      iconSize: [24, 24], iconAnchor: [12, 12],
    });

  const getStatusBadge = (status: Sensor["status"]) => {
    const map = {
      active:      { cls: "bg-green-100 text-green-800",  label: "Hoạt động"  },
      inactive:    { cls: "bg-gray-100 text-gray-800",    label: "Tạm dừng"   },
      maintenance: { cls: "bg-yellow-100 text-yellow-800", label: "Bảo trì"   },
    };
    const s = map[status] || { cls: "bg-gray-100 text-gray-800", label: status };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.label}</span>;
  };

  // Table — expanded to show each sensor as its own row
  const handleSelectDevice = (deviceId: string) => {
    const device = discoveredDevices.find(d => d.deviceId === deviceId);
    setFormData(prev => ({
      ...prev, deviceId,
      topicPath: prev.topicPath || `${prev.customerId || "customer"}/${deviceId}/all`,
    }));
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) { toast.error("Tên trạm đo không được để trống"); return; }
    if (!formData.deviceId.trim()) { toast.error("Device ID không được để trống"); return; }
    if (!formData.topicPath.trim()) { toast.error("Topic Path không được để trống"); return; }
    if (!formData.customerId.trim()) { toast.error("Customer ID không được để trống"); return; }

    try {
      await createSensor.mutateAsync(formData);
      toast.success("Thêm trạm đo thành công");
      setFormData({ name: "", deviceId: "", topicPath: "", customerId: "", type: "iot", location: { latitude: 21.0285, longitude: 105.8581 } });
      setIsAddDialogOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Lỗi khi tạo trạm đo";
      if (msg.includes("403") || msg.toLowerCase().includes("forbidden"))
        toast.error("Cần role 'manager' hoặc 'admin' để tạo trạm đo");
      else toast.error(msg);
    }
  };

  const handleDeleteSensor = (sensorId: string, sensorName: string) => {
    if (!window.confirm(`Xóa trạm đo "${sensorName}"?`)) return;
    deleteSensor.mutate(sensorId, {
      onSuccess: () => {
        toast.success("Xóa trạm đo thành công");
        queryClient.invalidateQueries({ queryKey: ["sensors"] });
      },
      onError: (err) => {
        toast.error(`Xóa thất bại: ${err instanceof Error ? err.message : "Lỗi không xác định"}`);
      },
    });
  };

  const getTypeBadge = (type: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      iot: { label: "IoT", cls: "bg-blue-100 text-blue-800" },
      external_station: { label: "Trạm ngoài", cls: "bg-purple-100 text-purple-800" },
    };
    const t = map[type] || { label: type, cls: "bg-gray-100 text-gray-800" };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.cls}`}>{t.label}</span>;
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Quản lý theo Vị trí</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Bản đồ và danh sách các cảm biến theo vị trí địa lý
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isAdminOrManager && (
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="h-4 w-4 mr-2" />Thêm trạm đo</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Thêm trạm đo mới</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
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
                        <p className="text-xs text-muted-foreground">Hoặc điền thủ công bên dưới</p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="add-name">Tên trạm đo *</Label>
                      <Input id="add-name" placeholder="VD: Cảm biến phòng khách"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="add-deviceId">Device ID *</Label>
                      <Input id="add-deviceId" placeholder="VD: esp32_sensor_001"
                        value={formData.deviceId}
                        onChange={e => setFormData({ ...formData, deviceId: e.target.value })} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="add-customerId">Customer ID *</Label>
                      <Input id="add-customerId" placeholder="VD: customer_a"
                        value={formData.customerId}
                        onChange={e => setFormData({ ...formData, customerId: e.target.value })} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="add-topicPath">MQTT Topic Path *</Label>
                      <Input id="add-topicPath" placeholder="VD: sensors/esp32_sensor_001/all"
                        value={formData.topicPath}
                        onChange={e => setFormData({ ...formData, topicPath: e.target.value })} />
                    </div>

                    <div className="space-y-2">
                      <Label>Loại trạm đo *</Label>
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
                        <Label htmlFor="add-lat">Vĩ độ</Label>
                        <Input id="add-lat" type="number" step="0.000001"
                          value={formData.location.latitude}
                          onChange={e => setFormData({ ...formData, location: { ...formData.location, latitude: parseFloat(e.target.value) || 0 } })} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="add-lng">Kinh độ</Label>
                        <Input id="add-lng" type="number" step="0.000001"
                          value={formData.location.longitude}
                          onChange={e => setFormData({ ...formData, location: { ...formData.location, longitude: parseFloat(e.target.value) || 0 } })} />
                      </div>
                    </div>

                    <Button onClick={handleSubmit} disabled={createSensor.isPending} className="w-full">
                      {createSensor.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Thêm trạm đo
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
            <p className="text-sm text-red-800">{error instanceof Error ? error.message : "Không thể tải dữ liệu"}</p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Tổng vị trí</CardDescription>
              <CardTitle className="text-3xl">{locationGroups.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Tổng cảm biến</CardDescription>
              <CardTitle className="text-3xl">{sensors.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Hoạt động</CardDescription>
              <CardTitle className="text-3xl text-green-600">{sensors.filter(s => s.status === "active").length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Bảo trì</CardDescription>
              <CardTitle className="text-3xl text-yellow-600">{sensors.filter(s => s.status === "maintenance").length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Search */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Tìm tên, deviceId, customerId..."
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
          </div>
          <span className="text-sm text-muted-foreground">{filteredLocations.length} vị trí</span>
        </div>

        {/* Map */}
        {isLoading ? (
          <div className="flex items-center justify-center h-[400px] border rounded-lg bg-muted/20 gap-2 text-muted-foreground">
            <RefreshCw className="h-6 w-6 animate-spin" /><span>Đang tải bản đồ...</span>
          </div>
        ) : filteredLocations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[300px] border rounded-lg bg-muted/20 gap-2 text-muted-foreground">
            <MapPin className="h-10 w-10" />
            <p>{sensors.length === 0 ? "Chưa có cảm biến nào. Thêm cảm biến tại trang Cảm biến." : "Không tìm thấy vị trí phù hợp"}</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden shadow-sm">
            <MapContainer center={mapCenter} zoom={12} style={{ height: "380px", width: "100%", zIndex: 0 }} scrollWheelZoom={true}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {filteredLocations.map(loc => (
                <Marker key={loc.locationKey} position={[loc.latitude, loc.longitude]} icon={createCircleIcon(getGroupColor(loc))}>
                  <Popup maxWidth={320}>
                    <div className="p-1 w-60">
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                        <MapPin className="h-4 w-4 text-primary" />
                        <div>
                          <p className="font-bold text-xs font-mono">{loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}</p>
                          <p className="text-xs text-muted-foreground">{loc.sensors.length} cảm biến</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs mb-3">
                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500" />{loc.activeSensors}</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-yellow-500" />{loc.maintenanceSensors}</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-gray-400" />{loc.inactiveSensors}</span>
                      </div>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {loc.sensors.map(s => (
                          <div key={s.sensorId} className="p-2 bg-muted/50 rounded-md text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 overflow-hidden">
                                <Activity className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                <span className="font-medium truncate">{s.name}</span>
                              </div>
                              {getStatusBadge(s.status)}
                            </div>
                            {s.deviceId && (
                              <div className="flex items-center gap-1 mt-1 text-muted-foreground">
                                <Wifi className="h-2.5 w-2.5" />
                                <code className="text-[10px]">{s.deviceId}</code>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        )}

        {/* Table — each sensor is its own row with expanded columns */}
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b">
                <tr>
                  {["Vị trí (lat, lng)", "Cảm biến", "Customer", "MQTT Topic", "Loại", "Trạng thái", "Ngày tạo", "Xóa"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sensors
                  .filter(s =>
                    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    s.deviceId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    s.customerId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    s.topicPath?.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map(s => (
                    <tr key={s.sensorId} className="hover:bg-muted/50">
                      <td className="px-4 py-3 font-mono text-sm">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                          <span className="text-xs">{s.location.latitude.toFixed(4)}, {s.location.longitude.toFixed(4)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-sm">{s.name}</span>
                          {s.deviceId && <code className="text-xs text-muted-foreground">{s.deviceId}</code>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">{s.customerId || "—"}</td>
                      <td className="px-4 py-3 text-xs max-w-[200px] truncate" title={s.topicPath}>
                        <span className="font-mono text-muted-foreground">{s.topicPath || "—"}</span>
                      </td>
                      <td className="px-4 py-3">{getTypeBadge(s.type)}</td>
                      <td className="px-4 py-3">{getStatusBadge(s.status)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {s.createdAt ? format(new Date(s.createdAt), "dd/MM/yyyy HH:mm") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {isAdminOrManager ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDeleteSensor(s.sensorId, s.name)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default LocationsPage;
