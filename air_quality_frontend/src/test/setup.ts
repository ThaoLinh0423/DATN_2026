import "@testing-library/jest-dom";
import { vi, beforeAll, afterAll, afterEach } from "vitest";
import { server } from "./mocks/server";

// ---------------------------------------------------------------------------
// Mock import.meta.env
// ---------------------------------------------------------------------------
Object.defineProperty(import.meta, "env", {
  value: {
    VITE_API_URL: "http://localhost:8088",
    MODE: "test",
    DEV: false,
    PROD: false,
    SSR: false,
  },
  writable: true,
});

// ---------------------------------------------------------------------------
// MSW – start / reset / stop
// ---------------------------------------------------------------------------
beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Browser APIs not provided by jsdom
// ---------------------------------------------------------------------------

// matchMedia (used by useIsMobile)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ResizeObserver (used by some Radix primitives)
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// WebSocket (used by useWebSocket)
global.WebSocket = vi.fn().mockImplementation(() => ({
  send: vi.fn(),
  close: vi.fn(),
  readyState: 1, // OPEN
  onopen: null,
  onmessage: null,
  onerror: null,
  onclose: null,
})) as unknown as typeof WebSocket;

// IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Suppress React/RTL console noise
// ---------------------------------------------------------------------------
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const msg = typeof args[0] === "string" ? args[0] : "";
    if (
      msg.includes("Warning:") ||
      msg.includes("ReactDOM.render") ||
      msg.includes("act(")
    ) {
      return;
    }
    originalError(...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
