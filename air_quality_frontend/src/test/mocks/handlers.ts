import { http, HttpResponse } from "msw";
import type {
  Sensor,
  User,
  AuthResponse,
  Alert,
  AlertStatistics,
} from "@/hooks/useApi";

const BASE = "http://localhost:8088/v1";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
export const mockUser: User = {
  userId: "user-1",
  email: "admin@example.com",
  name: "Admin User",
  phone: "0901234567",
  role: "admin",
  timezone: "Asia/Ho_Chi_Minh",
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

export const mockSensor: Sensor = {
  sensorId: "sensor-1",
  name: "Hà Nội - Tây Hồ",
  location: { latitude: 21.0285, longitude: 105.8581 },
  ownerId: "user-1",
  type: "iot",
  status: "active",
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

export const mockSensor2: Sensor = {
  sensorId: "sensor-2",
  name: "TP.HCM - Quận 1",
  location: { latitude: 10.7769, longitude: 106.7009 },
  ownerId: "user-1",
  type: "external_station",
  status: "maintenance",
  createdAt: "2025-01-02T00:00:00Z",
  updatedAt: "2025-01-02T00:00:00Z",
};

export const mockAlert: Alert = {
  id: "alert-1",
  sensorId: "sensor-1",
  alert_type: "high_pm25",
  message: "PM2.5 vượt ngưỡng nguy hiểm",
  is_active: true,
  severity: "danger",
  value: 85.5,
  threshold: 55.4,
  created_at: "2025-01-15T10:30:00Z",
  updated_at: "2025-01-15T10:30:00Z",
};

export const mockAlertStats: AlertStatistics = {
  totalAlerts: 10,
  activeAlerts: 3,
  inactiveAlerts: 7,
  alertsByType: {
    high_pm25: 4,
    high_pm10: 3,
    high_aqi: 3,
  },
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------
export const handlers = [
  // ── Auth ──────────────────────────────────────────────────────────────────
  http.post(`${BASE}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    if (body.email === "admin@example.com" && body.password === "password123") {
      return HttpResponse.json<AuthResponse>({
        accessToken: "mock-access-token",
        refreshToken: "mock-refresh-token",
        tokenType: "Bearer",
        expiresIn: 3600,
      });
    }
    return HttpResponse.json({ message: "Invalid credentials" }, { status: 401 });
  }),

  http.post(`${BASE}/auth/refresh`, () => {
    return HttpResponse.json<AuthResponse>({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      tokenType: "Bearer",
      expiresIn: 3600,
    });
  }),

  http.post(`${BASE}/users/me/logout`, () => {
    return HttpResponse.json({ message: "Logged out" });
  }),

  // ── Users ─────────────────────────────────────────────────────────────────
  http.get(`${BASE}/users/me`, () => {
    return HttpResponse.json<User>(mockUser);
  }),

  http.put(`${BASE}/users/me`, async ({ request }) => {
    const body = (await request.json()) as Partial<User>;
    return HttpResponse.json<User>({ ...mockUser, ...body });
  }),

  http.post(`${BASE}/users/me/change-password`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${BASE}/users/me/sessions`, () => {
    return HttpResponse.json({ data: [] });
  }),

  // ── Sensors ───────────────────────────────────────────────────────────────
  http.get(`${BASE}/sensors`, () => {
    return HttpResponse.json({
      data: [mockSensor, mockSensor2],
      nextCursor: null,
    });
  }),

  http.get(`${BASE}/sensors/:sensorId`, ({ params }) => {
    if (params.sensorId === "sensor-1") {
      return HttpResponse.json<Sensor>(mockSensor);
    }
    if (params.sensorId === "sensor-2") {
      return HttpResponse.json<Sensor>(mockSensor2);
    }
    return HttpResponse.json({ message: "Not found" }, { status: 404 });
  }),

  http.post(`${BASE}/sensors`, async ({ request }) => {
    const body = (await request.json()) as Partial<Sensor>;
    const created: Sensor = {
      sensorId: "sensor-new",
      name: body.name ?? "New Sensor",
      location: body.location ?? { latitude: 0, longitude: 0 },
      ownerId: "user-1",
      type: body.type ?? "iot",
      status: "inactive",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return HttpResponse.json<Sensor>(created, { status: 201 });
  }),

  http.patch(`${BASE}/sensors/:sensorId`, async ({ params, request }) => {
    const body = (await request.json()) as Partial<Sensor>;
    if (params.sensorId === "sensor-1") {
      return HttpResponse.json<Sensor>({ ...mockSensor, ...body });
    }
    return HttpResponse.json({ message: "Not found" }, { status: 404 });
  }),

  http.delete(`${BASE}/sensors/:sensorId`, ({ params }) => {
    if (params.sensorId === "sensor-1" || params.sensorId === "sensor-2") {
      return new HttpResponse(null, { status: 204 });
    }
    return HttpResponse.json({ message: "Not found" }, { status: 404 });
  }),

  // ── Alerts ────────────────────────────────────────────────────────────────
  http.get(`${BASE}/alerts`, () => {
    return HttpResponse.json({
      data: [mockAlert],
      nextCursor: null,
    });
  }),

  http.get(`${BASE}/alerts/statistics`, () => {
    return HttpResponse.json<AlertStatistics>(mockAlertStats);
  }),

  http.get(`${BASE}/alerts/:alertId`, ({ params }) => {
    if (params.alertId === "alert-1") {
      return HttpResponse.json<Alert>(mockAlert);
    }
    return HttpResponse.json({ message: "Not found" }, { status: 404 });
  }),

  http.put(`${BASE}/alerts/:alertId`, async ({ params, request }) => {
    const body = (await request.json()) as { is_active: boolean };
    if (params.alertId === "alert-1") {
      return HttpResponse.json<Alert>({ ...mockAlert, ...body });
    }
    return HttpResponse.json({ message: "Not found" }, { status: 404 });
  }),

  http.delete(`${BASE}/alerts/:alertId`, ({ params }) => {
    if (params.alertId === "alert-1") {
      return new HttpResponse(null, { status: 204 });
    }
    return HttpResponse.json({ message: "Not found" }, { status: 404 });
  }),

  http.post(`${BASE}/alerts/check`, async ({ request }) => {
    const body = (await request.json()) as { pm25?: number };
    const alertCreated = (body.pm25 ?? 0) > 55.4;
    return HttpResponse.json({
      alertCreated,
      alert: alertCreated ? mockAlert : undefined,
      message: alertCreated ? "Alert created" : "Within safe limits",
    });
  }),

  http.post(`${BASE}/alerts/bulk/update-status`, async ({ request }) => {
    const body = (await request.json()) as { alertIds: string[] };
    return HttpResponse.json({ updatedCount: body.alertIds.length });
  }),

  // ── Settings ──────────────────────────────────────────────────────────────
  http.get(`${BASE}/settings/general`, () => {
    return HttpResponse.json({
      settingId: "gen-1",
      siteName: "Air Quality Watch",
      defaultTimezone: "Asia/Ho_Chi_Minh",
      defaultLanguage: "vi",
      dateFormat: "DD/MM/YYYY",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    });
  }),

  http.get(`${BASE}/settings/notifications`, () => {
    return HttpResponse.json({
      settingId: "notif-1",
      userId: "user-1",
      emailAlerts: true,
      smsAlerts: false,
      pushNotifications: true,
      alertThreshold: 100,
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    });
  }),

  http.get(`${BASE}/settings/thresholds`, () => {
    return HttpResponse.json({
      settingId: "thresh-1",
      pm25Warning: 35.4,
      pm25Danger: 55.4,
      pm10Warning: 54,
      pm10Danger: 154,
      aqiWarning: 100,
      aqiDanger: 150,
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    });
  }),

  http.get(`${BASE}/settings/email`, () => {
    return HttpResponse.json({
      settingId: "email-1",
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
      smtpUser: "noreply@example.com",
      smtpPassword: "secret",
      fromEmail: "noreply@example.com",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    });
  }),

  http.post(`${BASE}/settings/email/test`, () => {
    return HttpResponse.json({ message: "Test email sent" });
  }),
];
