import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Bell, Shield, Mail, User, Settings, Globe, LogOut, Loader2,
  Database, RefreshCw, CheckCircle2, XCircle, Wifi, Trash2,
} from "lucide-react";
import {
  useCurrentUser, useUpdateUser, useChangePassword,
  useGeneralSettings, useUpdateGeneralSettings,
  useNotificationSettings, useUpdateNotificationSettings,
  useThresholdSettings, useUpdateThresholdSettings,
  useEmailSettings, useUpdateEmailSettings, useSendTestEmail,
  useLogout, ChangePasswordRequest,
  useInfluxSettings, useUpsertInfluxSettings, useDeleteInfluxSettings,
  useDiscoverDevices, useRefreshDiscover,
  InfluxSettingsInput, MLModelKey,
} from "@/hooks/useApi";
import { ML_MODELS } from "@/components/dashboard/MLForecastSection";

const LEGACY_DASHBOARD_MODEL_STORAGE_KEY = "air-quality-watch:dashboard-model";
const DEFAULT_PREDICTION_MODEL_STORAGE_KEY = "air-quality-watch:default-prediction-model";
const DASHBOARD_DISPLAY_MODEL_STORAGE_KEY = "air-quality-watch:dashboard-display-model";
const DASHBOARD_VISIBLE_MODELS_STORAGE_KEY = "air-quality-watch:dashboard-visible-models";

function getSavedModel(storageKey: string, fallbackKey?: string): MLModelKey {
  const savedModel = localStorage.getItem(storageKey) || (fallbackKey ? localStorage.getItem(fallbackKey) : null);
  return ML_MODELS.includes(savedModel as MLModelKey) ? savedModel as MLModelKey : "gru";
}

function getSavedVisibleModels(): MLModelKey[] {
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

const SettingsPage = () => {
  const navigate = useNavigate();

  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const updateUser = useUpdateUser();
  const changePassword = useChangePassword();
  const logout = useLogout();

  const { data: generalSettings, isLoading: generalLoading } = useGeneralSettings();
  const updateGeneralSettings = useUpdateGeneralSettings();

  const { data: notificationSettings, isLoading: notifLoading } = useNotificationSettings();
  const updateNotificationSettings = useUpdateNotificationSettings();

  const { data: thresholdSettings, isLoading: thresholdLoading } = useThresholdSettings();
  const updateThresholdSettings = useUpdateThresholdSettings();

  const { data: emailSettings, isLoading: emailLoading } = useEmailSettings();
  const updateEmailSettings = useUpdateEmailSettings();
  const sendTestEmail = useSendTestEmail();

  // InfluxDB settings
  const { data: influxSettings, isLoading: influxLoading } = useInfluxSettings();
  const upsertInflux = useUpsertInfluxSettings();
  const deleteInflux = useDeleteInfluxSettings();
  const { data: discoverData, isLoading: discoverLoading, error: discoverError } = useDiscoverDevices();
  const refreshDiscover = useRefreshDiscover();

  // ─── Local state ─────────────────────────────────────────────────────────────
  const [userData, setUserData] = useState({ name: "", email: "", phone: "" });
  const [passwordData, setPasswordData] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [generalData, setGeneralData] = useState({ siteName: "", defaultTimezone: "Asia/Ho_Chi_Minh", defaultLanguage: "vi", dateFormat: "DD/MM/YYYY" });
  const [notificationData, setNotificationData] = useState({ emailAlerts: true, smsAlerts: false, pushNotifications: true, alertThreshold: 100 });
  const [thresholdData, setThresholdData] = useState({ pm25Warning: 35, pm25Danger: 55, pm10Warning: 50, pm10Danger: 100, aqiWarning: 100, aqiDanger: 150 });
  const [emailData, setEmailData] = useState({ smtpHost: "", smtpPort: 587, smtpUser: "", smtpPassword: "", fromEmail: "" });
  const [defaultPredictionModel, setDefaultPredictionModel] = useState<MLModelKey>(() => getSavedModel(DEFAULT_PREDICTION_MODEL_STORAGE_KEY, LEGACY_DASHBOARD_MODEL_STORAGE_KEY));
  const [dashboardDisplayModel, setDashboardDisplayModel] = useState<MLModelKey>(() => getSavedModel(DASHBOARD_DISPLAY_MODEL_STORAGE_KEY, LEGACY_DASHBOARD_MODEL_STORAGE_KEY));
  const [visibleDashboardModels, setVisibleDashboardModels] = useState<MLModelKey[]>(getSavedVisibleModels);
  const [influxData, setInfluxData] = useState<InfluxSettingsInput>({
    influxUrl: "https://us-east-1-1.aws.cloud2.influxdata.com",
    influxToken: "",
    influxOrg: "",
    influxBucket: "",
    measurement: "sensor_data",
  });

  // ─── Sync remote → local state ───────────────────────────────────────────────
  useEffect(() => { if (currentUser) setUserData({ name: currentUser.name || "", email: currentUser.email || "", phone: currentUser.phone || "" }); }, [currentUser]);
  useEffect(() => { if (generalSettings) setGeneralData({ siteName: generalSettings.siteName, defaultTimezone: generalSettings.defaultTimezone, defaultLanguage: generalSettings.defaultLanguage, dateFormat: generalSettings.dateFormat }); }, [generalSettings]);
  useEffect(() => { if (notificationSettings) setNotificationData({ emailAlerts: notificationSettings.emailAlerts, smsAlerts: notificationSettings.smsAlerts, pushNotifications: notificationSettings.pushNotifications, alertThreshold: notificationSettings.alertThreshold }); }, [notificationSettings]);
  useEffect(() => { if (thresholdSettings) setThresholdData({ pm25Warning: thresholdSettings.pm25Warning, pm25Danger: thresholdSettings.pm25Danger, pm10Warning: thresholdSettings.pm10Warning, pm10Danger: thresholdSettings.pm10Danger, aqiWarning: thresholdSettings.aqiWarning, aqiDanger: thresholdSettings.aqiDanger }); }, [thresholdSettings]);
  useEffect(() => { if (emailSettings) setEmailData({ smtpHost: emailSettings.smtpHost, smtpPort: emailSettings.smtpPort, smtpUser: emailSettings.smtpUser, smtpPassword: "", fromEmail: emailSettings.fromEmail }); }, [emailSettings]);
  useEffect(() => {
    if (!visibleDashboardModels.includes(dashboardDisplayModel)) {
      setDashboardDisplayModel(visibleDashboardModels[0] ?? "gru");
    }
  }, [dashboardDisplayModel, visibleDashboardModels]);
  useEffect(() => {
    if (influxSettings) {
      setInfluxData({
        influxUrl: influxSettings.influxUrl,
        influxToken: "", // không pre-fill token (bị mask)
        influxOrg: influxSettings.influxOrg,
        influxBucket: influxSettings.influxBucket,
        measurement: influxSettings.measurement,
      });
    }
  }, [influxSettings]);

  // ─── Handlers ────────────────────────────────────────────────────────────────
  const handleSaveUser = () => updateUser.mutateAsync(userData, {
    onSuccess: () => toast.success("Cập nhật thông tin thành công!"),
    onError: e => toast.error(e.message),
  });

  const handleChangePassword = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) { toast.error("Mật khẩu xác nhận không khớp!"); return; }
    changePassword.mutateAsync({ currentPassword: passwordData.currentPassword, newPassword: passwordData.newPassword } as ChangePasswordRequest, {
      onSuccess: () => { toast.success("Đổi mật khẩu thành công!"); setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" }); },
      onError: e => toast.error(e.message),
    });
  };

  const handleSaveInflux = async () => {
    if (!influxData.influxToken) { toast.error("Vui lòng nhập InfluxDB Token"); return; }
    upsertInflux.mutateAsync(influxData, {
      onSuccess: () => {
        toast.success("Lưu InfluxDB settings thành công! Đang verify kết nối...");
        setInfluxData(prev => ({ ...prev, influxToken: "" }));
        refreshDiscover();
      },
      onError: e => {
        if (e.message?.includes("INFLUX_CONNECTION_FAILED")) toast.error("Không kết nối được InfluxDB — kiểm tra lại token/URL");
        else toast.error(e.message);
      },
    });
  };

  const handleDeleteInflux = async () => {
    if (!confirm("Xóa InfluxDB settings?")) return;
    deleteInflux.mutateAsync(undefined, {
      onSuccess: () => {
        toast.success("Đã xóa InfluxDB settings");
        setInfluxData({ influxUrl: "https://us-east-1-1.aws.cloud2.influxdata.com", influxToken: "", influxOrg: "", influxBucket: "", measurement: "sensor_data" });
      },
      onError: e => toast.error(e.message),
    });
  };

  const handleLogout = () => logout.mutateAsync(undefined, {
    onSuccess: () => { toast.success("Đã đăng xuất!"); navigate("/login"); },
    onError: e => toast.error(e.message),
  });

  const handleVisibleModelChange = (model: MLModelKey, checked: boolean) => {
    setVisibleDashboardModels(prev => {
      if (checked) return Array.from(new Set([...prev, model]));
      if (prev.length <= 1) {
        toast.error("Dashboard cần hiển thị ít nhất 1 model");
        return prev;
      }
      const next = prev.filter(item => item !== model);
      if (dashboardDisplayModel === model) setDashboardDisplayModel(next[0]);
      return next;
    });
  };

  const handleSaveDashboardSettings = () => {
    localStorage.setItem(DEFAULT_PREDICTION_MODEL_STORAGE_KEY, defaultPredictionModel);
    localStorage.setItem(DASHBOARD_DISPLAY_MODEL_STORAGE_KEY, dashboardDisplayModel);
    localStorage.setItem(DASHBOARD_VISIBLE_MODELS_STORAGE_KEY, JSON.stringify(visibleDashboardModels));
    window.dispatchEvent(new Event("dashboard-model-settings-updated"));
    updateThresholdSettings.mutateAsync(thresholdData, {
      onSuccess: () => toast.success("Đã lưu cài đặt dashboard!"),
      onError: e => toast.error(e.message),
    });
  };

  const isPageLoading = userLoading || generalLoading || notifLoading || thresholdLoading || emailLoading;
  const isAdmin = currentUser?.role === 'admin';

  if (isPageLoading) {
    return <MainLayout><div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div></MainLayout>;
  }

  return (
    <MainLayout>
      <div className="settings-page space-y-6">
        <div className="settings-hero">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                <Badge variant="outline" className="border-primary/30 text-primary">
                  {isAdmin ? "Quản trị hệ thống" : "Tài khoản cá nhân"}
                </Badge>
              </div>
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Cài đặt hệ thống</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Quản lý tài khoản, thông báo và cấu hình vận hành.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm md:min-w-64">
              <div className="rounded-md border bg-white/80 p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Vai trò</p>
                <p className="mt-1 font-semibold">{currentUser?.role || "user"}</p>
              </div>
              <div className="rounded-md border bg-white/80 p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Email</p>
                <p className="mt-1 truncate font-semibold">{currentUser?.email || "—"}</p>
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="account" className="space-y-4">
          <TabsList className="grid h-auto w-full gap-2 bg-muted/50 p-2 settings-tab-list">
            {[
              { value: "account",       icon: <User className="h-4 w-4" />,     label: "Tài khoản", adminOnly: false },
              { value: "influx",        icon: <Database className="h-4 w-4" />, label: "InfluxDB",  adminOnly: true },
              { value: "dashboard",     icon: <Shield className="h-4 w-4" />,   label: "Cài đặt dashboard", adminOnly: true },
              { value: "general",       icon: <Settings className="h-4 w-4" />, label: "Cài đặt chung", adminOnly: true },
            ].filter(t => !t.adminOnly || isAdmin).map(t => (
              <TabsTrigger 
                key={t.value} 
                value={t.value} 
                className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-transparent px-3 py-2 text-xs transition-all data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm"
              >
                {t.icon}<span className="hidden sm:inline">{t.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── Account ── */}
          <TabsContent value="account">
            <div className="space-y-4">
              <Card className="settings-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" />Thông tin tài khoản</CardTitle>
                  <CardDescription>Quản lý thông tin cá nhân và bảo mật</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    {[
                      { id: "name", label: "Họ tên", value: userData.name, key: "name" },
                      { id: "email", label: "Email", value: userData.email, key: "email", type: "email" },
                      { id: "phone", label: "Số điện thoại", value: userData.phone, key: "phone" },
                    ].map(f => (
                      <div key={f.id} className="space-y-2">
                        <Label htmlFor={f.id}>{f.label}</Label>
                        <Input id={f.id} type={f.type} value={f.value}
                          onChange={e => setUserData({ ...userData, [f.key]: e.target.value })} />
                      </div>
                    ))}
                    <div className="space-y-2">
                      <Label>Vai trò</Label>
                      <Input value={currentUser?.role || ""} disabled />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button onClick={handleSaveUser} disabled={updateUser.isPending}>
                      {updateUser.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Đang lưu...</> : "Lưu thay đổi"}
                    </Button>
                  </div>
                  <Separator />
                  <h4 className="font-medium">Đổi mật khẩu</h4>
                  <div className="grid gap-4 md:grid-cols-3">
                    {[
                      { id: "cur", label: "Mật khẩu hiện tại", key: "currentPassword" },
                      { id: "new", label: "Mật khẩu mới", key: "newPassword" },
                      { id: "conf", label: "Xác nhận", key: "confirmPassword" },
                    ].map(f => (
                      <div key={f.id} className="space-y-2">
                        <Label htmlFor={f.id}>{f.label}</Label>
                        <Input id={f.id} type="password" value={(passwordData as any)[f.key]}
                          onChange={e => setPasswordData({ ...passwordData, [f.key]: e.target.value })} />
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button onClick={handleChangePassword} disabled={changePassword.isPending}>
                      {changePassword.isPending ? "Đang xử lý..." : "Đổi mật khẩu"}
                    </Button>
                  </div>
                  <Separator />
                  <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-sm">Đăng xuất</p>
                      <p className="text-xs text-muted-foreground">Kết thúc phiên làm việc hiện tại</p>
                    </div>
                    <Button variant="destructive" onClick={handleLogout} disabled={logout.isPending} className="gap-2">
                      <LogOut className="h-4 w-4" />{logout.isPending ? "Đang xử lý..." : "Đăng xuất"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="settings-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" />Cài đặt thông báo</CardTitle>
                  <CardDescription>Quản lý cách nhận thông báo cảnh báo</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {[
                    { key: "emailAlerts", label: "Thông báo qua Email", desc: "Nhận cảnh báo qua email" },
                    { key: "smsAlerts", label: "Thông báo qua SMS", desc: "Nhận cảnh báo qua tin nhắn" },
                    { key: "pushNotifications", label: "Push Notifications", desc: "Thông báo trên trình duyệt" },
                  ].map((item, i) => (
                    <div key={item.key}>
                      {i > 0 && <Separator className="mb-6" />}
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <Label>{item.label}</Label>
                          <p className="text-sm text-muted-foreground">{item.desc}</p>
                        </div>
                        <Switch checked={(notificationData as any)[item.key]}
                          onCheckedChange={v => setNotificationData({ ...notificationData, [item.key]: v })} />
                      </div>
                    </div>
                  ))}
                  <Separator />
                  <div className="space-y-2">
                    <Label>Ngưỡng cảnh báo (AQI)</Label>
                    <Input type="number" value={notificationData.alertThreshold}
                      onChange={e => setNotificationData({ ...notificationData, alertThreshold: Number(e.target.value) })} />
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button onClick={() => updateNotificationSettings.mutateAsync(notificationData, { onSuccess: () => toast.success("Đã lưu!"), onError: e => toast.error(e.message) })}
                      disabled={updateNotificationSettings.isPending}>
                      {updateNotificationSettings.isPending ? "Đang lưu..." : "Lưu thay đổi"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {isAdmin && (
                <Card className="settings-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />Cài đặt Email (SMTP)</CardTitle>
                    <CardDescription>Cấu hình máy chủ gửi email cảnh báo</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      {[
                        { id: "smtpHost", label: "SMTP Host", key: "smtpHost", placeholder: "smtp.gmail.com" },
                        { id: "smtpUser", label: "SMTP Username", key: "smtpUser", placeholder: "user@gmail.com" },
                        { id: "fromEmail", label: "From Email", key: "fromEmail", type: "email", placeholder: "noreply@example.com" },
                      ].map(f => (
                        <div key={f.id} className="space-y-2">
                          <Label htmlFor={f.id}>{f.label}</Label>
                          <Input id={f.id} type={f.type} placeholder={f.placeholder}
                            value={(emailData as any)[f.key]}
                            onChange={e => setEmailData({ ...emailData, [f.key]: e.target.value })} />
                        </div>
                      ))}
                      <div className="space-y-2">
                        <Label htmlFor="smtpPort">SMTP Port</Label>
                        <Input id="smtpPort" type="number" value={emailData.smtpPort}
                          onChange={e => setEmailData({ ...emailData, smtpPort: Number(e.target.value) })} />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="smtpPass">SMTP Password</Label>
                        <Input id="smtpPass" type="password" placeholder="Nhập mật khẩu SMTP"
                          value={emailData.smtpPassword}
                          onChange={e => setEmailData({ ...emailData, smtpPassword: e.target.value })} />
                      </div>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                      <Button variant="outline" onClick={() => sendTestEmail.mutateAsync(undefined, { onSuccess: () => toast.success("Email test đã gửi!"), onError: e => toast.error(e.message) })}
                        disabled={sendTestEmail.isPending}>
                        {sendTestEmail.isPending ? "Đang gửi..." : "Gửi email test"}
                      </Button>
                      <Button onClick={() => updateEmailSettings.mutateAsync(emailData, { onSuccess: () => toast.success("Đã lưu!"), onError: e => toast.error(e.message) })}
                        disabled={updateEmailSettings.isPending}>
                        {updateEmailSettings.isPending ? "Đang lưu..." : "Lưu thay đổi"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ── InfluxDB (Admin only) ── */}
          {isAdmin && (
          <TabsContent value="influx">
            <div className="space-y-4">
              {/* Status card */}
              <Card className="settings-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />InfluxDB Cloud API Key
                    {influxSettings && !influxLoading && (
                      <Badge variant="default" className="ml-2 gap-1">
                        <CheckCircle2 className="h-3 w-3" />Đã cấu hình
                      </Badge>
                    )}
                    {!influxSettings && !influxLoading && (
                      <Badge variant="secondary" className="ml-2 gap-1">
                        <XCircle className="h-3 w-3" />Chưa cấu hình
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    Nhập thông tin InfluxDB Cloud để hệ thống tự động đọc dữ liệu cảm biến.
                    Token chỉ cần quyền <strong>read</strong> trên bucket.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {influxSettings && (
                    <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                      <p><span className="text-muted-foreground">URL:</span> {influxSettings.influxUrl}</p>
                      <p><span className="text-muted-foreground">Org:</span> {influxSettings.influxOrg}</p>
                      <p><span className="text-muted-foreground">Bucket:</span> {influxSettings.influxBucket}</p>
                      <p><span className="text-muted-foreground">Measurement:</span> {influxSettings.measurement}</p>
                      <p><span className="text-muted-foreground">Token:</span> {influxSettings.influxToken}</p>
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="influxUrl">InfluxDB URL</Label>
                      <Input id="influxUrl" placeholder="https://us-east-1-1.aws.cloud2.influxdata.com"
                        value={influxData.influxUrl}
                        onChange={e => setInfluxData({ ...influxData, influxUrl: e.target.value })} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="influxToken">
                        API Token *
                        {influxSettings && <span className="text-xs text-muted-foreground ml-1">(để trống nếu không muốn thay đổi)</span>}
                      </Label>
                      <Input id="influxToken" type="password"
                        placeholder={influxSettings ? "Nhập token mới để cập nhật..." : "Dán InfluxDB API token..."}
                        value={influxData.influxToken}
                        onChange={e => setInfluxData({ ...influxData, influxToken: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="influxOrg">Organization</Label>
                      <Input id="influxOrg" placeholder="NCKH"
                        value={influxData.influxOrg}
                        onChange={e => setInfluxData({ ...influxData, influxOrg: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="influxBucket">Bucket</Label>
                      <Input id="influxBucket" placeholder="SENSOR"
                        value={influxData.influxBucket}
                        onChange={e => setInfluxData({ ...influxData, influxBucket: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="measurement">Measurement</Label>
                      <Input id="measurement" placeholder="sensor_data"
                        value={influxData.measurement}
                        onChange={e => setInfluxData({ ...influxData, measurement: e.target.value })} />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-between">
                    {influxSettings && (
                      <Button variant="outline" onClick={handleDeleteInflux} disabled={deleteInflux.isPending} className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />Xóa cấu hình
                      </Button>
                    )}
                    <Button onClick={handleSaveInflux} disabled={upsertInflux.isPending} className="sm:ml-auto">
                      {upsertInflux.isPending
                        ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Đang kiểm tra kết nối...</>
                        : <><Database className="h-4 w-4 mr-2" />{influxSettings ? "Cập nhật" : "Lưu & Kết nối"}</>}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Discover devices */}
              <Card className="settings-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wifi className="h-5 w-5" />Tự động phát hiện cảm biến
                    {discoverData && (
                      <Badge variant="secondary">{discoverData.total} device</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    Hệ thống tự động quét bucket InfluxDB để tìm các cảm biến đang có dữ liệu (30 ngày gần nhất).
                    Dùng kết quả này để đăng ký cảm biến trong tab Sensors.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!influxSettings ? (
                    <p className="text-sm text-muted-foreground">Cần cấu hình InfluxDB trước.</p>
                  ) : discoverLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />Đang quét InfluxDB...
                    </div>
                  ) : discoverError ? (
                    <p className="text-sm text-destructive">{discoverError.message}</p>
                  ) : !discoverData?.devices?.length ? (
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>Không tìm thấy device nào.</p>
                      <p className="text-xs">Kiểm tra: bucket <code>{influxSettings.influxBucket}</code>, measurement <code>{influxSettings.measurement}</code>, có dữ liệu trong 30 ngày gần nhất.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid gap-2">
                        {discoverData.devices.map(d => (
                          <div key={d.deviceId} className="flex flex-col gap-3 rounded-lg border bg-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                              <div>
                                <code className="text-sm font-medium">{d.deviceId}</code>
                                {d.location && <p className="text-xs text-muted-foreground">{d.location}</p>}
                              </div>
                            </div>
                            <Badge variant="outline" className="text-xs">Có dữ liệu</Badge>
                          </div>
                        ))}
                      </div>
                      <Button variant="outline" size="sm" onClick={() => refreshDiscover()} className="gap-2">
                        <RefreshCw className="h-3 w-3" />Quét lại
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          )}

          {/* ── General (Admin only) ── */}
          {isAdmin && (
          <TabsContent value="general">
            <Card className="settings-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" />Cài đặt chung</CardTitle>
                <CardDescription>Cấu hình cơ bản của hệ thống</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Tên hệ thống</Label>
                    <Input value={generalData.siteName} onChange={e => setGeneralData({ ...generalData, siteName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Múi giờ</Label>
                    <Select value={generalData.defaultTimezone} onValueChange={v => setGeneralData({ ...generalData, defaultTimezone: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Asia/Ho_Chi_Minh">Việt Nam (GMT+7)</SelectItem>
                        <SelectItem value="Asia/Bangkok">Bangkok (GMT+7)</SelectItem>
                        <SelectItem value="Asia/Singapore">Singapore (GMT+8)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Ngôn ngữ</Label>
                    <Select value={generalData.defaultLanguage} onValueChange={v => setGeneralData({ ...generalData, defaultLanguage: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vi">Tiếng Việt</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Định dạng ngày</Label>
                    <Select value={generalData.dateFormat} onValueChange={v => setGeneralData({ ...generalData, dateFormat: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                        <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                        <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button onClick={() => updateGeneralSettings.mutateAsync(generalData, { onSuccess: () => toast.success("Đã lưu!"), onError: e => toast.error(e.message) })}
                    disabled={updateGeneralSettings.isPending}>
                    {updateGeneralSettings.isPending ? "Đang lưu..." : "Lưu thay đổi"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          )}

          {/* ── Dashboard settings (Admin only) ── */}
          {isAdmin && (
          <TabsContent value="dashboard">
            <Card className="settings-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Cài đặt dashboard</CardTitle>
                <CardDescription>Chọn model mặc định, model hiển thị trên dashboard và thiết lập ngưỡng cảnh báo</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Model dự báo mặc định</Label>
                    <Select value={defaultPredictionModel} onValueChange={v => setDefaultPredictionModel(v as MLModelKey)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ML_MODELS.map(model => (
                          <SelectItem key={model} value={model}>{model.toUpperCase()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Model dùng làm mặc định cho luồng dự báo.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Model đang hiển thị trên dashboard</Label>
                    <Select value={dashboardDisplayModel} onValueChange={v => setDashboardDisplayModel(v as MLModelKey)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {visibleDashboardModels.map(model => (
                          <SelectItem key={model} value={model}>{model.toUpperCase()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Model được chọn sẵn khi mở dashboard.
                    </p>
                  </div>
                  <div className="space-y-3 md:col-span-2">
                    <Label>Danh sách model hiển thị trên dashboard</Label>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {ML_MODELS.map(model => (
                        <label
                          key={model}
                          className="flex items-center gap-3 rounded-md border bg-white p-3 text-sm font-medium"
                        >
                          <Checkbox
                            checked={visibleDashboardModels.includes(model)}
                            onCheckedChange={checked => handleVisibleModelChange(model, checked === true)}
                          />
                          <span>{model.toUpperCase()}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Dashboard chỉ hiển thị các model được tick trong nhóm chọn model.
                    </p>
                  </div>
                </div>
                <Separator />
                {[
                  { label: "PM2.5 (µg/m³)", wKey: "pm25Warning", dKey: "pm25Danger" },
                  { label: "PM10 (µg/m³)",  wKey: "pm10Warning", dKey: "pm10Danger" },
                  { label: "AQI",           wKey: "aqiWarning",  dKey: "aqiDanger"  },
                ].map((row, i) => (
                  <div key={row.label}>
                    {i > 0 && <Separator className="mb-6" />}
                    <h4 className="font-medium mb-3">{row.label}</h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      {[{ label: "Mức cảnh báo", key: row.wKey }, { label: "Mức nguy hiểm", key: row.dKey }].map(f => (
                        <div key={f.key} className="space-y-2">
                          <Label>{f.label}</Label>
                          <Input type="number" value={(thresholdData as any)[f.key]}
                            onChange={e => setThresholdData({ ...thresholdData, [f.key]: Number(e.target.value) })} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button onClick={handleSaveDashboardSettings}
                    disabled={updateThresholdSettings.isPending}>
                    {updateThresholdSettings.isPending ? "Đang lưu..." : "Lưu thay đổi"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          )}
        </Tabs>
      </div>
    </MainLayout>
  );
};

export default SettingsPage;
