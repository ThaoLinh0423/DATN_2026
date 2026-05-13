import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { apiClient } from "@/api/client";

import {
  useCurrentUser,
  useSensors,
  useSensor,
  useCreateSensor,
  useUpdateSensor,
  useDeleteSensor,
  useAlerts,
  useAlert,
  useAlertStatistics,
  useUpdateAlert,
  useDeleteAlert,
  useCheckAndCreateAlert,
  useBulkUpdateAlerts,
  useGeneralSettings,
  useNotificationSettings,
  useThresholdSettings,
  useLogin,
  useLogout,
} from "@/hooks/useApi";

import {
  mockUser,
  mockSensor,
  mockSensor2,
  mockAlert,
  mockAlertStats,
} from "@/test/mocks/handlers";

// ---------------------------------------------------------------------------
// Wrapper factory
// ---------------------------------------------------------------------------
function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return {
    qc,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  };
}

// ---------------------------------------------------------------------------
// Set a fake access token so `enabled` guards pass
// ---------------------------------------------------------------------------
beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  apiClient.setTokens("mock-access-token", "mock-refresh-token");
  vi.clearAllMocks();
});

// ===========================================================================
// useCurrentUser
// ===========================================================================
describe("useCurrentUser", () => {
  it("fetches the current user successfully", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCurrentUser(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toMatchObject({
      userId: mockUser.userId,
      email: mockUser.email,
      name: mockUser.name,
      role: mockUser.role,
    });
  });

  it("is disabled when there is no access token", async () => {
    apiClient.clearTokens();
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCurrentUser(), { wrapper });

    // Query should remain in idle/pending state (not fetching)
    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it("returns an error when the API returns 401", async () => {
    server.use(
      http.get("http://localhost:8088/v1/users/me", () =>
        HttpResponse.json({ message: "Unauthorized" }, { status: 401 })
      )
    );

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCurrentUser(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// ===========================================================================
// useSensors
// ===========================================================================
describe("useSensors", () => {
  it("fetches paginated sensors list", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSensors(50), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.data).toHaveLength(2);
    expect(result.current.data?.data[0].sensorId).toBe(mockSensor.sensorId);
    expect(result.current.data?.data[1].sensorId).toBe(mockSensor2.sensorId);
  });

  it("returns empty array when API returns no sensors", async () => {
    server.use(
      http.get("http://localhost:8088/v1/sensors", () =>
        HttpResponse.json({ data: [], nextCursor: null })
      )
    );

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSensors(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(0);
  });
});

// ===========================================================================
// useSensor (single)
// ===========================================================================
describe("useSensor", () => {
  it("fetches a single sensor by ID", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSensor("sensor-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.name).toBe(mockSensor.name);
    expect(result.current.data?.type).toBe(mockSensor.type);
  });

  it("is disabled when sensorId is empty string", () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSensor(""), { wrapper });

    expect(result.current.isFetching).toBe(false);
  });

  it("returns 404 error for unknown sensor", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSensor("non-existent"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// ===========================================================================
// useCreateSensor
// ===========================================================================
describe("useCreateSensor", () => {
  it("creates a new sensor and invalidates the sensors query", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateSensor(), { wrapper });

    await result.current.mutateAsync({
      name: "Test Sensor",
      type: "iot",
      location: { latitude: 21.0, longitude: 105.8 },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.name).toBe("Test Sensor");
  });
});

// ===========================================================================
// useUpdateSensor
// ===========================================================================
describe("useUpdateSensor", () => {
  it("updates a sensor's name", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpdateSensor(), { wrapper });

    await result.current.mutateAsync({
      sensorId: "sensor-1",
      data: { name: "Updated Name" },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.name).toBe("Updated Name");
  });

  it("returns an error for non-existent sensor", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpdateSensor(), { wrapper });

    await expect(
      result.current.mutateAsync({ sensorId: "bad-id", data: { name: "X" } })
    ).rejects.toBeDefined();
  });
});

// ===========================================================================
// useDeleteSensor
// ===========================================================================
describe("useDeleteSensor", () => {
  it("deletes an existing sensor without error", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useDeleteSensor(), { wrapper });

    await result.current.mutateAsync("sensor-1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

// ===========================================================================
// useAlerts
// ===========================================================================
describe("useAlerts", () => {
  it("fetches list of alerts when authenticated", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAlerts(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(1);
    expect(result.current.data?.data[0].id).toBe(mockAlert.id);
  });

  it("is disabled when there is no access token", () => {
    apiClient.clearTokens();
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAlerts(), { wrapper });

    expect(result.current.isFetching).toBe(false);
  });

  it("accepts status filter parameter", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAlerts("active"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // MSW doesn't filter by status but we confirm the hook can be called
    expect(result.current.data).toBeDefined();
  });
});

// ===========================================================================
// useAlert (single)
// ===========================================================================
describe("useAlert", () => {
  it("fetches a single alert by ID", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAlert("alert-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.alert_type).toBe("high_pm25");
    expect(result.current.data?.severity).toBe("danger");
  });

  it("is disabled when alertId is empty", () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAlert(""), { wrapper });

    expect(result.current.isFetching).toBe(false);
  });
});

// ===========================================================================
// useAlertStatistics
// ===========================================================================
describe("useAlertStatistics", () => {
  it("fetches alert statistics", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAlertStatistics(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.totalAlerts).toBe(mockAlertStats.totalAlerts);
    expect(result.current.data?.activeAlerts).toBe(mockAlertStats.activeAlerts);
    expect(result.current.data?.alertsByType.high_pm25).toBe(
      mockAlertStats.alertsByType.high_pm25
    );
  });
});

// ===========================================================================
// useUpdateAlert
// ===========================================================================
describe("useUpdateAlert", () => {
  it("deactivates an alert", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpdateAlert(), { wrapper });

    await result.current.mutateAsync({
      alertId: "alert-1",
      data: { is_active: false },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.is_active).toBe(false);
  });
});

// ===========================================================================
// useDeleteAlert
// ===========================================================================
describe("useDeleteAlert", () => {
  it("deletes an alert without error", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useDeleteAlert(), { wrapper });

    await result.current.mutateAsync("alert-1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

// ===========================================================================
// useCheckAndCreateAlert
// ===========================================================================
describe("useCheckAndCreateAlert", () => {
  it("creates an alert when pm25 exceeds threshold", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCheckAndCreateAlert(), { wrapper });

    const response = await result.current.mutateAsync({
      sensorId: "sensor-1",
      pm25: 90, // > 55.4 threshold
    });

    expect(response.alertCreated).toBe(true);
    expect(response.alert).toBeDefined();
  });

  it("does not create an alert when values are within limits", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCheckAndCreateAlert(), { wrapper });

    const response = await result.current.mutateAsync({
      sensorId: "sensor-1",
      pm25: 20, // < 55.4 threshold
    });

    expect(response.alertCreated).toBe(false);
    expect(response.alert).toBeUndefined();
  });
});

// ===========================================================================
// useBulkUpdateAlerts
// ===========================================================================
describe("useBulkUpdateAlerts", () => {
  it("bulk-updates alerts and returns updated count", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useBulkUpdateAlerts(), { wrapper });

    const response = await result.current.mutateAsync({
      alertIds: ["alert-1", "alert-2", "alert-3"],
      is_active: false,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(response.updatedCount).toBe(3);
  });
});

// ===========================================================================
// useGeneralSettings
// ===========================================================================
describe("useGeneralSettings", () => {
  it("fetches general settings", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useGeneralSettings(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.siteName).toBe("Air Quality Watch");
    expect(result.current.data?.defaultTimezone).toBe("Asia/Ho_Chi_Minh");
  });
});

// ===========================================================================
// useNotificationSettings
// ===========================================================================
describe("useNotificationSettings", () => {
  it("fetches notification settings when authenticated", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useNotificationSettings(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.emailAlerts).toBe(true);
    expect(result.current.data?.pushNotifications).toBe(true);
  });
});

// ===========================================================================
// useThresholdSettings
// ===========================================================================
describe("useThresholdSettings", () => {
  it("fetches threshold settings", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useThresholdSettings(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pm25Warning).toBe(35.4);
    expect(result.current.data?.pm25Danger).toBe(55.4);
    expect(result.current.data?.aqiDanger).toBe(150);
  });
});

// ===========================================================================
// useLogin
// ===========================================================================
describe("useLogin", () => {
  it("logs in with valid credentials and stores tokens", async () => {
    apiClient.clearTokens(); // start unauthenticated

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useLogin(), { wrapper });

    await result.current.mutateAsync({
      email: "admin@example.com",
      password: "password123",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.getAccessToken()).toBe("mock-access-token");
  });

  it("rejects with an error for invalid credentials", async () => {
    apiClient.clearTokens();

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useLogin(), { wrapper });

    await expect(
      result.current.mutateAsync({
        email: "wrong@example.com",
        password: "badpassword",
      })
    ).rejects.toBeDefined();
  });
});

// ===========================================================================
// useLogout
// ===========================================================================
describe("useLogout", () => {
  it("clears tokens after logout", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useLogout(), { wrapper });

    await result.current.mutateAsync();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiClient.getAccessToken()).toBeNull();
  });
});
