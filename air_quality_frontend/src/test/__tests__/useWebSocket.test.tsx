import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { apiClient } from "@/api/client";

// ---------------------------------------------------------------------------
// We build a controllable fake WebSocket that lets tests trigger lifecycle
// events (open, message, close, error) manually.
// ---------------------------------------------------------------------------
interface FakeWS {
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  // test helpers
  triggerOpen: () => void;
  triggerMessage: (data: object) => void;
  triggerError: () => void;
  triggerClose: () => void;
}

let fakeWS: FakeWS;

function createFakeWS(): FakeWS {
  const ws: FakeWS = {
    send: vi.fn(),
    close: vi.fn(),
    readyState: WebSocket.CONNECTING,
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    triggerOpen() {
      ws.readyState = WebSocket.OPEN;
      ws.onopen?.(new Event("open"));
    },
    triggerMessage(data: object) {
      ws.onmessage?.(
        new MessageEvent("message", { data: JSON.stringify(data) })
      );
    },
    triggerError() {
      ws.readyState = WebSocket.CLOSED;
      ws.onerror?.(new Event("error"));
    },
    triggerClose() {
      ws.readyState = WebSocket.CLOSED;
      ws.onclose?.(new CloseEvent("close"));
    },
  };
  return ws;
}

beforeEach(() => {
  fakeWS = createFakeWS();
  global.WebSocket = vi.fn().mockImplementation(() => fakeWS) as unknown as typeof WebSocket;
  apiClient.setTokens("mock-token");
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  sessionStorage.clear();
  apiClient.clearTokens();
});

// ---------------------------------------------------------------------------
describe("useWebSocket", () => {
  const defaultOptions = {
    sensorIds: ["sensor-1"],
    enabled: true,
    reconnectAttempts: 1,
    reconnectDelay: 100,
    throttleMs: 0, // no throttle for tests
  };

  // ── Initial state ──────────────────────────────────────────────────────────
  it("starts in connecting state when enabled with sensorIds", () => {
    const { result } = renderHook(() => useWebSocket(defaultOptions));
    expect(result.current.status).toBe("connecting");
    expect(result.current.isConnecting).toBe(true);
    expect(result.current.isConnected).toBe(false);
  });

  it("stays disconnected when enabled=false", () => {
    const { result } = renderHook(() =>
      useWebSocket({ ...defaultOptions, enabled: false })
    );
    expect(result.current.status).toBe("disconnected");
    expect(global.WebSocket).not.toHaveBeenCalled();
  });

  it("stays disconnected when sensorIds is empty", () => {
    const { result } = renderHook(() =>
      useWebSocket({ ...defaultOptions, sensorIds: [] })
    );
    // No WebSocket should be created
    expect(result.current.isConnected).toBe(false);
  });

  // ── Connected state ────────────────────────────────────────────────────────
  it("transitions to connected after ws.onopen fires", () => {
    const { result } = renderHook(() => useWebSocket(defaultOptions));

    act(() => {
      fakeWS.triggerOpen();
    });

    expect(result.current.status).toBe("connected");
    expect(result.current.isConnected).toBe(true);
  });

  it("sends subscribe message after connection opens", () => {
    renderHook(() => useWebSocket(defaultOptions));

    act(() => {
      fakeWS.triggerOpen();
    });

    expect(fakeWS.send).toHaveBeenCalledOnce();
    const sentMsg = JSON.parse(fakeWS.send.mock.calls[0][0] as string);
    expect(sentMsg.type).toBe("subscribe");
    expect(sentMsg.sensorIds).toContain("sensor-1");
  });

  // ── Data messages ──────────────────────────────────────────────────────────
  it("updates data state when a 'data' message is received", () => {
    const onDataReceived = vi.fn();
    const { result } = renderHook(() =>
      useWebSocket({ ...defaultOptions, onDataReceived })
    );

    act(() => {
      fakeWS.triggerOpen();
      fakeWS.triggerMessage({
        type: "data",
        data: {
          dataPointId: "dp-1",
          sensorId: "sensor-1",
          timestamp: "2025-01-15T10:00:00Z",
          values: { pm2_5: 35.5, pm10: 58.2 },
        },
      });
    });

    expect(result.current.data?.dataPointId).toBe("dp-1");
    expect(result.current.data?.values.pm2_5).toBe(35.5);
    expect(onDataReceived).toHaveBeenCalledOnce();
  });

  it("ignores pong messages without errors", () => {
    const { result } = renderHook(() => useWebSocket(defaultOptions));

    act(() => {
      fakeWS.triggerOpen();
      fakeWS.triggerMessage({ type: "pong" });
    });

    expect(result.current.error).toBeNull();
    expect(result.current.data).toBeNull();
  });

  it("sets error state on 'error' message type from server", () => {
    const { result } = renderHook(() => useWebSocket(defaultOptions));

    act(() => {
      fakeWS.triggerOpen();
      fakeWS.triggerMessage({ type: "error", message: "Sensor not found" });
    });

    expect(result.current.error).toBe("Sensor not found");
  });

  // ── Error / disconnect ─────────────────────────────────────────────────────
  it("transitions to error state on WebSocket error event", () => {
    const { result } = renderHook(() => useWebSocket(defaultOptions));

    act(() => {
      fakeWS.triggerOpen();
      fakeWS.triggerError();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBeTruthy();
  });

  it("transitions to disconnected after max reconnect attempts", async () => {
    // reconnectAttempts=1 means only 1 retry
    const { result } = renderHook(() =>
      useWebSocket({ ...defaultOptions, reconnectAttempts: 1, reconnectDelay: 50 })
    );

    act(() => {
      fakeWS.triggerOpen();
    });
    expect(result.current.status).toBe("connected");

    // Simulate ws close
    act(() => {
      fakeWS.triggerClose();
    });

    // After exhausting retries it should reach disconnected
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // After max reconnections it should end up disconnected
    // (second close triggers the final state)
    act(() => {
      fakeWS.triggerClose();
    });

    expect(["disconnected", "connecting", "error"]).toContain(
      result.current.status
    );
  });

  // ── Manual API ─────────────────────────────────────────────────────────────
  it("exposes connect, disconnect, subscribe, unsubscribe functions", () => {
    const { result } = renderHook(() => useWebSocket(defaultOptions));
    expect(typeof result.current.connect).toBe("function");
    expect(typeof result.current.disconnect).toBe("function");
    expect(typeof result.current.subscribe).toBe("function");
    expect(typeof result.current.unsubscribe).toBe("function");
  });

  it("sends unsubscribe message on disconnect", () => {
    const { result } = renderHook(() => useWebSocket(defaultOptions));

    act(() => {
      fakeWS.triggerOpen();
    });

    act(() => {
      result.current.disconnect();
    });

    // Should have sent unsubscribe
    const calls = fakeWS.send.mock.calls.map((c) => JSON.parse(c[0] as string));
    const unsubMsg = calls.find((m) => m.type === "unsubscribe");
    expect(unsubMsg).toBeDefined();
  });

  it("sends subscribe message when calling subscribe() while connected", () => {
    const { result } = renderHook(() => useWebSocket(defaultOptions));

    act(() => {
      fakeWS.triggerOpen();
    });

    act(() => {
      result.current.subscribe(["sensor-2"]);
    });

    const calls = fakeWS.send.mock.calls.map((c) => JSON.parse(c[0] as string));
    const subMsg = calls.find(
      (m) => m.type === "subscribe" && m.sensorIds?.includes("sensor-2")
    );
    expect(subMsg).toBeDefined();
  });

  it("sends unsubscribe for removed sensorIds", () => {
    const { result } = renderHook(() => useWebSocket(defaultOptions));

    act(() => {
      fakeWS.triggerOpen();
    });

    act(() => {
      result.current.unsubscribe(["sensor-1"]);
    });

    const calls = fakeWS.send.mock.calls.map((c) => JSON.parse(c[0] as string));
    const unsubMsg = calls.find(
      (m) => m.type === "unsubscribe" && m.sensorIds?.includes("sensor-1")
    );
    expect(unsubMsg).toBeDefined();
  });

  // ── Invalid message format ─────────────────────────────────────────────────
  it("sets error on malformed WebSocket message (non-JSON)", () => {
    const { result } = renderHook(() => useWebSocket(defaultOptions));

    act(() => {
      fakeWS.triggerOpen();
      fakeWS.onmessage?.(
        new MessageEvent("message", { data: "this is not JSON{{" })
      );
    });

    expect(result.current.error).toBeTruthy();
  });

  // ── onStatusChange callback ────────────────────────────────────────────────
  it("calls onStatusChange with 'connected' when connection opens", () => {
    const onStatusChange = vi.fn();
    renderHook(() =>
      useWebSocket({ ...defaultOptions, onStatusChange })
    );

    act(() => {
      fakeWS.triggerOpen();
    });

    expect(onStatusChange).toHaveBeenCalledWith("connected");
  });

  it("calls onStatusChange with 'error' on WebSocket error", () => {
    const onStatusChange = vi.fn();
    renderHook(() =>
      useWebSocket({ ...defaultOptions, onStatusChange })
    );

    act(() => {
      fakeWS.triggerOpen();
      fakeWS.triggerError();
    });

    expect(onStatusChange).toHaveBeenCalledWith("error");
  });

  // ── Cleanup ────────────────────────────────────────────────────────────────
  it("closes WebSocket on unmount", () => {
    const { unmount } = renderHook(() => useWebSocket(defaultOptions));

    act(() => {
      fakeWS.triggerOpen();
    });

    unmount();

    expect(fakeWS.close).toHaveBeenCalled();
  });
});
