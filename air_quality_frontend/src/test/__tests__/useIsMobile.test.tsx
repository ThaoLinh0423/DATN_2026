import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "@/hooks/use-mobile";

// ---------------------------------------------------------------------------
// Helpers to control window.innerWidth + fire matchMedia change events
// ---------------------------------------------------------------------------
function setWindowWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: width,
  });
}

function buildMatchMedia(matches: boolean) {
  return vi.fn().mockImplementation((query: string) => {
    const listeners: Array<() => void> = [];
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn((_event: string, cb: () => void) => {
        listeners.push(cb);
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      // expose listeners for tests to trigger them
      _listeners: listeners,
    };
  });
}

describe("useIsMobile", () => {
  const MOBILE_BREAKPOINT = 768;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Reset innerWidth to a common desktop value
    setWindowWidth(1280);
  });

  it("returns false for desktop width (>= 768px)", () => {
    setWindowWidth(1280);
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: buildMatchMedia(false),
    });

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns true for mobile width (< 768px)", () => {
    setWindowWidth(375);
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: buildMatchMedia(true),
    });

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("returns false exactly at the breakpoint (768px)", () => {
    // 768 >= MOBILE_BREAKPOINT → NOT mobile
    setWindowWidth(MOBILE_BREAKPOINT);
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: buildMatchMedia(false),
    });

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns true for width 767px (one below breakpoint)", () => {
    setWindowWidth(MOBILE_BREAKPOINT - 1);
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: buildMatchMedia(true),
    });

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("updates when window resizes from desktop to mobile", () => {
    setWindowWidth(1280);
    let mqlCallback: (() => void) | null = null;

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn((_event: string, cb: () => void) => {
          mqlCallback = cb;
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    // Simulate resize to mobile
    act(() => {
      setWindowWidth(375);
      mqlCallback?.();
    });

    expect(result.current).toBe(true);
  });

  it("cleans up matchMedia listener on unmount", () => {
    const removeEventListener = vi.fn();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        media: "",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener,
        dispatchEvent: vi.fn(),
      }),
    });

    const { unmount } = renderHook(() => useIsMobile());
    unmount();

    expect(removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("always returns a boolean (never undefined)", () => {
    setWindowWidth(600);
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: buildMatchMedia(true),
    });

    const { result } = renderHook(() => useIsMobile());
    expect(typeof result.current).toBe("boolean");
  });
});
