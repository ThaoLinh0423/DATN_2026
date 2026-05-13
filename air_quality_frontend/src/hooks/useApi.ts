import { useQuery, useMutation, UseQueryResult, UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiClient, PaginatedResponse } from "@/api/client";

// ==================== TYPES ====================
export interface User {
  userId: string;
  email: string;
  name: string;
  phone: string;
  role: "admin" | "manager" | "user";
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserSession {
  sessionId: string;
  userId: string;
  deviceInfo: string;
  ipAddress: string;
  lastActivity: string;
  expiresAt: string;
  createdAt: string;
}

export interface Sensor {
  sensorId: string;
  name: string;
  deviceId: string;
  topicPath: string;
  customerId: string;
  location: { latitude: number; longitude: number };
  ownerId: string;
  type: "iot" | "external_station";
  status: "active" | "inactive" | "maintenance";
  createdAt: string;
  updatedAt: string;
}

export interface SensorInput {
  name: string;
  deviceId: string;
  topicPath: string;
  customerId: string;
  location: { latitude: number; longitude: number };
  type: "iot" | "external_station";
}

export interface DataPoint {
  dataPointId: string;
  sensorId: string;
  deviceId?: string;
  location?: string;
  timestamp: string;
  values: {
    pm1?: number;
    pm25?: number;
    pm10?: number;
    temperature?: number;
    humidity?: number;
    heatIndex?: number;
    comfort?: string;
    aqiStatus?: string;
  };
}

export interface LoginRequest { email: string; password: string; }
export interface AuthResponse { accessToken: string; refreshToken?: string; tokenType: string; expiresIn: number; }
export interface RegisterRequest { email: string; password: string; timezone: string; }
export interface UserUpdateRequest { name: string; email: string; phone: string; }
export interface ChangePasswordRequest { currentPassword: string; newPassword: string; }

export interface GeneralSettings {
  settingId: string; siteName: string; defaultTimezone: string;
  defaultLanguage: string; dateFormat: string; createdAt: string; updatedAt: string;
}
export interface NotificationSettings {
  settingId: string; userId: string; emailAlerts: boolean; smsAlerts: boolean;
  pushNotifications: boolean; alertThreshold: number; createdAt: string; updatedAt: string;
}
export interface ThresholdSettings {
  settingId: string; pm25Warning: number; pm25Danger: number; pm10Warning: number;
  pm10Danger: number; aqiWarning: number; aqiDanger: number; createdAt: string; updatedAt: string;
}
export interface EmailSettings {
  settingId: string; smtpHost: string; smtpPort: number; smtpUser: string;
  smtpPassword: string; fromEmail: string; createdAt: string; updatedAt: string;
}
export interface InfluxSettings {
  settingId: string; userId: string; influxUrl: string; influxToken: string;
  influxOrg: string; influxBucket: string; measurement: string; createdAt: string; updatedAt: string;
}
export interface InfluxSettingsInput {
  influxUrl: string; influxToken: string; influxOrg: string; influxBucket: string; measurement: string;
}
export interface InfluxDevice { deviceId: string; location: string; }
export interface InfluxDiscoverResponse { devices: InfluxDevice[]; bucket: string; measurement: string; total: number; }

// ==================== AUTHENTICATION ====================
export function useRegister(): UseMutationResult<any, Error, RegisterRequest> {
  return useMutation({ mutationFn: (data) => apiClient.post("/auth/register", data) });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: LoginRequest) => apiClient.post<AuthResponse>("/auth/login", data),
    onSuccess: (data) => {
      if (data?.accessToken) {
        apiClient.setTokens(data.accessToken, data.refreshToken);
        queryClient.clear();
        queryClient.invalidateQueries({ queryKey: ["user", "me"] });
      }
    },
  });
}

export function useRefreshToken(): UseMutationResult<AuthResponse, Error, string> {
  return useMutation({
    mutationFn: (refreshToken) => apiClient.post<AuthResponse>("/auth/refresh", { refreshToken }),
    onSuccess: (data) => { apiClient.setTokens(data.accessToken, data.refreshToken); },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post("/users/me/logout", {}),
    onSuccess: () => { apiClient.clearTokens(); queryClient.clear(); },
  });
}

// ==================== USERS ====================
export function useCurrentUser(): UseQueryResult<User, Error> {
  return useQuery({
    queryKey: ["user", "me"],
    queryFn: () => apiClient.get<User>("/users/me"),
    enabled: !!apiClient.getAccessToken(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateUser(): UseMutationResult<User, Error, UserUpdateRequest> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => apiClient.put<User>("/users/me", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["user", "me"] }); },
  });
}

export function useChangePassword(): UseMutationResult<void, Error, ChangePasswordRequest> {
  return useMutation({ mutationFn: (data) => apiClient.post("/users/me/change-password", data) });
}

export function useUserSessions(): UseQueryResult<{ data: UserSession[] }, Error> {
  return useQuery({
    queryKey: ["user", "sessions"],
    queryFn: () => apiClient.get<{ data: UserSession[] }>("/users/me/sessions"),
    enabled: !!apiClient.getAccessToken(),
  });
}

// ==================== SENSORS ====================
export function useSensors(limit = 50, cursor?: string): UseQueryResult<PaginatedResponse<Sensor>, Error> {
  return useQuery({
    queryKey: ["sensors", limit, cursor],
    queryFn: () => apiClient.get<PaginatedResponse<Sensor>>("/sensors", {
      params: { limit, ...(cursor && { cursor }) },
    }),
    staleTime: 2 * 60 * 1000,
  });
}

export function useCreateSensor(): UseMutationResult<Sensor, Error, SensorInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => apiClient.post<Sensor>("/sensors", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sensors"] }); },
  });
}

export function useUpdateSensor(): UseMutationResult<Sensor, Error, { sensorId: string; data: Partial<SensorInput> }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sensorId, data }) => apiClient.patch<Sensor>(`/sensors/${sensorId}`, data),
    onSuccess: (_, { sensorId }) => {
      queryClient.invalidateQueries({ queryKey: ["sensor", sensorId] });
      queryClient.invalidateQueries({ queryKey: ["sensors"] });
    },
  });
}

export function useDeleteSensor(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sensorId) => apiClient.delete(`/sensors/${sensorId}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sensors"] }); },
  });
}

// ==================== DATA ====================
export function useLatestData(sensorNode: string): UseQueryResult<DataPoint, Error> {
  return useQuery({
    queryKey: ["data", "latest", sensorNode],
    queryFn: () => apiClient.get<DataPoint>("/data/latest", { params: { sensorNode } }),
    enabled: !!sensorNode && !!apiClient.getAccessToken(),
    staleTime: 30 * 1000,
    refetchInterval: 35 * 1000,
  });
}

export interface HistoricalDataParams {
  sensorNode: string; startTime: string; endTime: string; limit?: number;
}

export function useHistoricalData(params: HistoricalDataParams): UseQueryResult<PaginatedResponse<DataPoint>, Error> {
  return useQuery({
    queryKey: ["data", "historical", params.sensorNode, params.startTime, params.endTime, params.limit],
    queryFn: () => apiClient.get<PaginatedResponse<DataPoint>>("/data/historical", {
      params: { sensorNode: params.sensorNode, startTime: params.startTime, endTime: params.endTime, limit: params.limit || 100 },
    }),
    enabled: !!params.sensorNode && !!params.startTime && !!params.endTime,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

// ==================== SETTINGS - INFLUXDB ====================
export function useInfluxSettings(): UseQueryResult<InfluxSettings | null, Error> {
  return useQuery({
    queryKey: ["settings", "influx"],
    queryFn: async () => {
      try { return await apiClient.get<InfluxSettings>("/settings/influx"); }
      catch (err: any) {
        if (err?.status === 404 || err?.message?.includes("404")) return null;
        throw err;
      }
    },
    enabled: !!apiClient.getAccessToken(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpsertInfluxSettings(): UseMutationResult<InfluxSettings, Error, InfluxSettingsInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => apiClient.put<InfluxSettings>("/settings/influx", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "influx"] });
      queryClient.invalidateQueries({ queryKey: ["settings", "influx", "discover"] });
    },
  });
}

export function useDeleteInfluxSettings(): UseMutationResult<{ message: string }, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete("/settings/influx"),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["settings", "influx"] }); },
  });
}

export function useDiscoverDevices(): UseQueryResult<InfluxDiscoverResponse, Error> {
  return useQuery({
    queryKey: ["settings", "influx", "discover"],
    queryFn: () => apiClient.get<InfluxDiscoverResponse>("/settings/influx/discover"),
    enabled: !!apiClient.getAccessToken(),
    staleTime: 2 * 60 * 1000,
    retry: false,
  });
}

export function useRefreshDiscover() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["settings", "influx", "discover"] });
}

// ==================== SETTINGS - GENERAL ====================
export function useGeneralSettings(): UseQueryResult<GeneralSettings, Error> {
  return useQuery({
    queryKey: ["settings", "general"],
    queryFn: () => apiClient.get<GeneralSettings>("/settings/general"),
    staleTime: 10 * 60 * 1000,
  });
}

export function useUpdateGeneralSettings(): UseMutationResult<GeneralSettings, Error, Partial<GeneralSettings>> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => apiClient.put<GeneralSettings>("/settings/general", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["settings", "general"] }); },
  });
}

// ==================== SETTINGS - NOTIFICATIONS ====================
export function useNotificationSettings(): UseQueryResult<NotificationSettings, Error> {
  return useQuery({
    queryKey: ["settings", "notifications"],
    queryFn: () => apiClient.get<NotificationSettings>("/settings/notifications"),
    enabled: !!apiClient.getAccessToken(),
  });
}

export function useUpdateNotificationSettings(): UseMutationResult<NotificationSettings, Error, Partial<NotificationSettings>> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => apiClient.put<NotificationSettings>("/settings/notifications", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["settings", "notifications"] }); },
  });
}

// ==================== SETTINGS - THRESHOLDS ====================
export function useThresholdSettings(): UseQueryResult<ThresholdSettings, Error> {
  return useQuery({
    queryKey: ["settings", "thresholds"],
    queryFn: () => apiClient.get<ThresholdSettings>("/settings/thresholds"),
    staleTime: 10 * 60 * 1000,
  });
}

export function useUpdateThresholdSettings(): UseMutationResult<ThresholdSettings, Error, Partial<ThresholdSettings>> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => apiClient.put<ThresholdSettings>("/settings/thresholds", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["settings", "thresholds"] }); },
  });
}

// ==================== SETTINGS - EMAIL ====================
export function useEmailSettings(): UseQueryResult<EmailSettings, Error> {
  return useQuery({
    queryKey: ["settings", "email"],
    queryFn: () => apiClient.get<EmailSettings>("/settings/email"),
    enabled: !!apiClient.getAccessToken(),
  });
}

export function useUpdateEmailSettings(): UseMutationResult<EmailSettings, Error, Partial<EmailSettings>> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => apiClient.put<EmailSettings>("/settings/email", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["settings", "email"] }); },
  });
}

export function useSendTestEmail(): UseMutationResult<{ message: string }, Error, void> {
  return useMutation({ mutationFn: () => apiClient.post<{ message: string }>("/settings/email/test", {}) });
}

// ==================== ALERTS ====================
export interface Alert {
  id: string; sensorId: string; alert_type: "high_pm25" | "high_pm10" | "high_aqi";
  message: string; is_active: boolean; severity: "warning" | "danger";
  value: number; threshold: number; created_at: string; updated_at: string;
}
export interface AlertCheckPayload { sensorId: string; pm25?: number; pm10?: number; aqi?: number; }
export interface AlertCheckResult { alertCreated: boolean; alert?: Alert; message: string; }
export interface AlertStatistics {
  totalAlerts: number; activeAlerts: number; inactiveAlerts: number;
  alertsByType: { high_pm25?: number; high_pm10?: number; high_aqi?: number };
}

export function useAlerts(status: "all" | "active" | "inactive" = "all", limit = 50, cursor?: string): UseQueryResult<PaginatedResponse<Alert>, Error> {
  return useQuery({
    queryKey: ["alerts", status, limit, cursor],
    queryFn: () => apiClient.get<PaginatedResponse<Alert>>("/alerts", { params: { status, limit, ...(cursor && { cursor }) } }),
    enabled: !!apiClient.getAccessToken(),
    staleTime: 30 * 1000,
  });
}

export function useAlert(alertId: string): UseQueryResult<Alert, Error> {
  return useQuery({
    queryKey: ["alert", alertId],
    queryFn: () => apiClient.get<Alert>(`/alerts/${alertId}`),
    enabled: !!alertId && !!apiClient.getAccessToken(),
  });
}

export function useCheckAndCreateAlert(): UseMutationResult<AlertCheckResult, Error, AlertCheckPayload> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => apiClient.post<AlertCheckResult>("/alerts/check", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      queryClient.invalidateQueries({ queryKey: ["alerts", "statistics"] });
    },
  });
}

export function useUpdateAlert(): UseMutationResult<Alert, Error, { alertId: string; data: { is_active: boolean } }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ alertId, data }) => apiClient.put<Alert>(`/alerts/${alertId}`, data),
    onSuccess: (_, { alertId }) => {
      queryClient.invalidateQueries({ queryKey: ["alert", alertId] });
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      queryClient.invalidateQueries({ queryKey: ["alerts", "statistics"] });
    },
  });
}

export function useDeleteAlert(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alertId) => apiClient.delete(`/alerts/${alertId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      queryClient.invalidateQueries({ queryKey: ["alerts", "statistics"] });
    },
  });
}

export function useAlertStatistics(): UseQueryResult<AlertStatistics, Error> {
  return useQuery({
    queryKey: ["alerts", "statistics"],
    queryFn: () => apiClient.get<AlertStatistics>("/alerts/statistics"),
    enabled: !!apiClient.getAccessToken(),
    staleTime: 30 * 1000,
  });
}

export function useBulkUpdateAlerts(): UseMutationResult<{ updatedCount: number }, Error, { alertIds: string[]; is_active: boolean }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => apiClient.post<{ updatedCount: number }>("/alerts/bulk/update-status", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      queryClient.invalidateQueries({ queryKey: ["alerts", "statistics"] });
    },
  });
}

// ==================== ML FORECAST ====================
export type MLModelKey = "lstm" | "gru" | "bilstm" | "informer" | "arima";

export interface ForecastPoint {
  timestamp: string;
  aqi?: number | null;
  pm1_0?: number | null;
  pm2_5?: number | null;
  pm10?: number | null;
  temperature?: number | null;
  humidity?: number | null;
}

export interface MLAlertPoint {
  timestamp: string;
  value: number;
}

export interface ForecastResponse {
  model: MLModelKey;
  target_columns: string[];
  target_column?: string | null;
  horizon: number;
  resample_freq: string;
  forecast: ForecastPoint[];
  alerts: Record<string, MLAlertPoint[]>;
}

export interface ForecastQueryParams {
  sensorNode: string;
  startTime?: string;
  endTime?: string;
  historyHours?: number;
  limit?: number;
}

export function useForecast(
  modelKey: MLModelKey,
  params: ForecastQueryParams,
  enabled = true,
): UseQueryResult<ForecastResponse, Error> {
  const queryParams = useMemo(() => ({
    sensorNode: params.sensorNode,
    ...(params.startTime ? { startTime: params.startTime } : {}),
    ...(params.endTime ? { endTime: params.endTime } : {}),
    ...(params.historyHours != null ? { historyHours: params.historyHours } : {}),
    ...(params.limit != null ? { limit: params.limit } : {}),
  }), [params.endTime, params.historyHours, params.limit, params.sensorNode, params.startTime]);

  return useQuery({
    queryKey: ["ml", "forecast", modelKey, queryParams],
    queryFn: () => apiClient.get<ForecastResponse>(`/forecast/${modelKey}`, { params: queryParams }),
    enabled: enabled && !!apiClient.getAccessToken() && !!params.sensorNode,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useClearForecastCache(): UseMutationResult<{ detail: string }, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<{ detail: string }>("/forecast/cache/clear", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ml", "forecast"] });
    },
  });
}

// ==================== ML DRIFT MONITORING ====================
export type DriftStatus = "stable" | "warning" | "drift" | "insufficient_data" | "not_available";

export interface DriftFeatureStatus {
  feature: string;
  psi?: number | null;
  status: DriftStatus;
  sample_size: number;
  mean?: number | null;
  std?: number | null;
  min?: number | null;
  max?: number | null;
}

export interface DriftSummaryResponse {
  model: MLModelKey;
  generated_at: string;
  overall_status: DriftStatus;
  events_in_window: number;
  history_points: number;
  input_drift: DriftFeatureStatus[];
  prediction_drift: DriftFeatureStatus[];
}

export interface DriftSeriesPoint {
  timestamp: string;
  scope: "input" | "prediction";
  feature: string;
  psi?: number | null;
  status: Exclude<DriftStatus, "not_available">;
  sample_size: number;
}

export interface DriftSeriesResponse {
  model: MLModelKey;
  generated_at: string;
  series: DriftSeriesPoint[];
}

export function useDriftSummary(
  modelKey: MLModelKey,
  enabled = true,
): UseQueryResult<DriftSummaryResponse, Error> {
  return useQuery({
    queryKey: ["ml", "drift", modelKey, "summary"],
    queryFn: () => apiClient.get<DriftSummaryResponse>(`/monitoring/drift/${modelKey}/summary`),
    enabled: enabled && !!apiClient.getAccessToken(),
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
    retry: 1,
  });
}

export function useDriftTimeseries(
  modelKey: MLModelKey,
  enabled = true,
): UseQueryResult<DriftSeriesResponse, Error> {
  return useQuery({
    queryKey: ["ml", "drift", modelKey, "timeseries"],
    queryFn: () => apiClient.get<DriftSeriesResponse>(`/monitoring/drift/${modelKey}/timeseries`),
    enabled: enabled && !!apiClient.getAccessToken(),
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
    retry: 1,
  });
}

export function useLatestFeatureDrift(
  modelKey: MLModelKey,
  enabled = true,
): UseQueryResult<DriftFeatureStatus[], Error> {
  return useQuery({
    queryKey: ["ml", "drift", modelKey, "features", "latest"],
    queryFn: () => apiClient.get<DriftFeatureStatus[]>(`/monitoring/drift/${modelKey}/features/latest`),
    enabled: enabled && !!apiClient.getAccessToken(),
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
    retry: 1,
  });
}

// ==================== HELPER ====================
export function useTokenRefresh() {
  const refreshToken = useRefreshToken();
  useQuery({
    queryKey: ["token", "refresh"],
    queryFn: async () => {
      const token = apiClient.getRefreshToken();
      if (!token) throw new Error("No refresh token");
      await refreshToken.mutateAsync(token);
      return true;
    },
    refetchInterval: 30 * 60 * 1000,
    enabled: !!apiClient.getRefreshToken(),
  });
}

// ==================== ADMIN - USER MANAGEMENT ====================
export interface AdminUser {
  userId: string; email: string; name: string; phone: string;
  role: "admin" | "manager" | "user"; timezone: string; createdAt: string; updatedAt: string;
}
export interface AdminUserListResponse { data: AdminUser[]; nextCursor: string | null; total: number; }
export interface AdminUserDetail extends AdminUser {
  sensors: { sensorId: string; name: string }[];
}

export function useAdminUsers(
  role?: "admin" | "manager" | "user" | "all",
  limit = 50,
  cursor?: string
): UseQueryResult<AdminUserListResponse, Error> {
  return useQuery({
    queryKey: ["admin", "users", role, limit, cursor],
    queryFn: () => apiClient.get<AdminUserListResponse>("/admin/users", {
      params: { role: role || "all", limit, ...(cursor && { cursor }) },
    }),
    enabled: !!apiClient.getAccessToken(),
    staleTime: 2 * 60 * 1000,
  });
}

export function useAdminUser(userId: string): UseQueryResult<AdminUserDetail, Error> {
  return useQuery({
    queryKey: ["admin", "user", userId],
    queryFn: () => apiClient.get<AdminUserDetail>(`/admin/users/${userId}`),
    enabled: !!userId && !!apiClient.getAccessToken(),
    // Đủ lâu để optimistic update sống qua vòng API call (~10s)
    // nhưng không quá lâu để data stale khi mở lại
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    // QUAN TRỌNG: không tự refetch trong background khi đang active
    refetchIntervalInBackground: false,
  });
}

export function useUpdateUserRole(): UseMutationResult<AdminUser, Error, { userId: string; role: "admin" | "manager" | "user" }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }) => apiClient.patch<AdminUser>(`/admin/users/${userId}/role`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "user"] });
    },
  });
}

// ==================== SENSOR ACCESS ====================
export interface SensorAccess {
  id: string; sensorId: string; userId: string;
  userEmail: string; grantedBy: string; createdAt: string;
}
export interface SensorAccessListResponse { data: SensorAccess[]; total: number; }

export function useSensorAccessList(sensorId: string): UseQueryResult<SensorAccessListResponse, Error> {
  return useQuery({
    queryKey: ["sensor", sensorId, "access"],
    queryFn: () => apiClient.get<SensorAccessListResponse>(`/sensors/${sensorId}/access`),
    enabled: !!sensorId && !!apiClient.getAccessToken(),
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * POST /sensors/:sensorId/access
 *
 * Hook này KHÔNG có onSuccess/onError cache logic.
 * Toàn bộ optimistic update + rollback do component quản lý
 * theo pattern: cancelQueries → snapshot → setQueryData → mutate → (ok: invalidate | err: setQueryData(snapshot))
 */
export function useGrantSensorAccess(): UseMutationResult<SensorAccess, Error, { sensorId: string; userId: string }> {
  return useMutation({
    mutationFn: ({ sensorId, userId }) =>
      apiClient.post<SensorAccess>(`/sensors/${sensorId}/access`, { userId }),
  });
}

/**
 * DELETE /sensors/:sensorId/access/:userId
 *
 * Hook này KHÔNG có onSuccess/onError cache logic.
 * Toàn bộ optimistic update + rollback do component quản lý.
 */
export function useRevokeSensorAccess(): UseMutationResult<void, Error, { sensorId: string; userId: string }> {
  return useMutation({
    mutationFn: ({ sensorId, userId }) =>
      apiClient.delete(`/sensors/${sensorId}/access/${userId}`),
  });
}
