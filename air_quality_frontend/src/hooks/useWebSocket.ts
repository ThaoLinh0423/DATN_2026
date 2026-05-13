import { useEffect, useState, useCallback, useRef } from "react";
import { apiClient } from "@/api/client";

// DataPoint từ WebSocket — field names khớp InfluxDB
export interface RealtimeDataPoint {
  dataPointId: string;
  sensorId: string;   // = tag sensor_node (vd: esp32_sensor_001)
  deviceId?: string;  // = field device_id từ JSON payload
  location?: string;  // = tag location
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

type WebSocketStatus = "connecting" | "connected" | "disconnected" | "error";

interface UseWebSocketOptions {
  sensorIds: string[];      // = danh sách sensor_node để subscribe
  onDataReceived?: (data: RealtimeDataPoint) => void;
  onStatusChange?: (status: WebSocketStatus) => void;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  enabled?: boolean;
  throttleMs?: number;
}

interface WebSocketMessage {
  type: "subscribe" | "unsubscribe" | "subscribed" | "unsubscribed" | "data" | "error" | "ping" | "pong";
  sensorIds?: string[];
  sensorId?: string;
  data?: RealtimeDataPoint;
  message?: string;
  timestamp?: string;
}

export function useWebSocket(options: UseWebSocketOptions) {
  const {
    sensorIds,
    onDataReceived,
    onStatusChange,
    reconnectAttempts = 3,
    reconnectDelay = 3000,
    enabled = true,
    throttleMs = 1000,
  } = options;

  const [status, setStatus] = useState<WebSocketStatus>("disconnected");
  const [data, setData] = useState<RealtimeDataPoint | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const subscriptionRef = useRef<string[]>([]);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMessageTimeRef = useRef(0);
  const messageQueueRef = useRef<RealtimeDataPoint | null>(null);
  const processQueueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getWebSocketUrl = useCallback(() => {
    const baseUrl = import.meta.env.VITE_API_URL;
    let wsUrl = baseUrl.startsWith("https://")
      ? baseUrl.replace("https://", "wss://")
      : baseUrl.replace("http://", "ws://");
    wsUrl = wsUrl.replace(/\/$/, "");
    const token = apiClient.getAccessToken();
    return `${wsUrl}/v1/ws/realtime?token=${encodeURIComponent(token || "")}`;
  }, []);

  const processMessageQueue = useCallback(() => {
    if (messageQueueRef.current) {
      const now = Date.now();
      const timeSinceLastMessage = now - lastMessageTimeRef.current;
      if (timeSinceLastMessage >= throttleMs) {
        const msg = messageQueueRef.current;
        messageQueueRef.current = null;
        lastMessageTimeRef.current = now;
        setData(msg);
        onDataReceived?.(msg);
        if (processQueueTimerRef.current) {
          clearTimeout(processQueueTimerRef.current);
          processQueueTimerRef.current = null;
        }
      } else {
        if (!processQueueTimerRef.current) {
          processQueueTimerRef.current = setTimeout(processMessageQueue, throttleMs - timeSinceLastMessage);
        }
      }
    }
  }, [throttleMs, onDataReceived]);

  const handleDataMessage = useCallback((dataPoint: RealtimeDataPoint) => {
    const now = Date.now();
    if (now - lastMessageTimeRef.current >= throttleMs) {
      lastMessageTimeRef.current = now;
      setData(dataPoint);
      onDataReceived?.(dataPoint);
    } else {
      messageQueueRef.current = dataPoint;
      if (!processQueueTimerRef.current) {
        processQueueTimerRef.current = setTimeout(processMessageQueue, throttleMs - (now - lastMessageTimeRef.current));
      }
    }
  }, [throttleMs, onDataReceived, processMessageQueue]);

  const connect = useCallback(() => {
    if (!enabled) {
      setStatus("disconnected");
      return;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return;

    try {
      setStatus("connecting");
      setError(null);
      const ws = new WebSocket(getWebSocketUrl());

      ws.onopen = () => {
        setStatus("connected");
        setError(null);
        reconnectCountRef.current = 0;

        if (sensorIds.length > 0) {
          ws.send(JSON.stringify({ type: "subscribe", sensorIds, timestamp: new Date().toISOString() }));
          subscriptionRef.current = sensorIds;
        }

        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
        }, 30000);

        onStatusChange?.("connected");
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          switch (message.type) {
            case "data":
              if (message.data) handleDataMessage(message.data);
              break;
            case "error":
              setError(message.message || "Unknown error");
              onStatusChange?.("error");
              break;
          }
        } catch {
          setError("Invalid message format");
        }
      };

      ws.onerror = () => {
        setStatus("error");
        setError("Connection error");
        onStatusChange?.("error");
      };

      ws.onclose = () => {
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
        if (processQueueTimerRef.current) clearTimeout(processQueueTimerRef.current);

        if (reconnectCountRef.current < reconnectAttempts) {
          reconnectCountRef.current++;
          const delay = reconnectDelay * Math.pow(2, reconnectCountRef.current - 1);
          setTimeout(() => {
            if (wsRef.current?.readyState === WebSocket.CLOSED) connect();
          }, delay);
        } else {
          setStatus("disconnected");
          setError("Max reconnection attempts reached");
          onStatusChange?.("disconnected");
        }
      };

      wsRef.current = ws;
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, [sensorIds, enabled, getWebSocketUrl, onStatusChange, reconnectAttempts, reconnectDelay, handleDataMessage]);

  const disconnect = useCallback(() => {
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    if (processQueueTimerRef.current) clearTimeout(processQueueTimerRef.current);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "unsubscribe", sensorIds: subscriptionRef.current }));
      wsRef.current.close();
    }
    wsRef.current = null;
    setStatus("disconnected");
    subscriptionRef.current = [];
    messageQueueRef.current = null;
  }, []);

  const subscribe = useCallback((newSensorIds: string[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "subscribe", sensorIds: newSensorIds }));
      subscriptionRef.current = [...subscriptionRef.current, ...newSensorIds];
    }
  }, []);

  const unsubscribe = useCallback((sensorIdsToRemove: string[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "unsubscribe", sensorIds: sensorIdsToRemove }));
      subscriptionRef.current = subscriptionRef.current.filter(id => !sensorIdsToRemove.includes(id));
    }
  }, []);

  useEffect(() => {
    if (!enabled) { disconnect(); return; }
    if (sensorIds.length === 0) return;

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const toAdd = sensorIds.filter(id => !subscriptionRef.current.includes(id));
      const toRemove = subscriptionRef.current.filter(id => !sensorIds.includes(id));
      if (toRemove.length > 0) unsubscribe(toRemove);
      if (toAdd.length > 0) subscribe(toAdd);
    } else {
      connect();
    }

    return () => { disconnect(); };
  }, [enabled, sensorIds.join(",")]);

  return { status, data, error, connect, disconnect, subscribe, unsubscribe,
    isConnected: status === "connected", isConnecting: status === "connecting" };
}
