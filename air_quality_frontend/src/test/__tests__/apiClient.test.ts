import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// We need to reset sessionStorage between tests and mock fetch globally.
// The ApiClient reads import.meta.env.VITE_API_URL in the module-level scope,
// so we import it AFTER setup.ts has already patched import.meta.env.
// ---------------------------------------------------------------------------

// Re-import fresh module for each suite using dynamic import would be ideal,
// but since Vitest caches modules we just import once and test the singleton.
import { apiClient } from "@/api/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mockFetchOk(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  });
}

function mockFetchError(status: number, body: unknown = { message: "Error" }) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  });
}

// ---------------------------------------------------------------------------
describe("ApiClient – token management", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    apiClient.clearTokens();
  });

  it("starts with no access token", () => {
    expect(apiClient.getAccessToken()).toBeNull();
  });

  it("setTokens stores access token in memory and sessionStorage", () => {
    apiClient.setTokens("access123", "refresh456");
    expect(apiClient.getAccessToken()).toBe("access123");
    expect(apiClient.getRefreshToken()).toBe("refresh456");
    expect(sessionStorage.getItem("accessToken")).toBe("access123");
    expect(sessionStorage.getItem("refreshToken")).toBe("refresh456");
  });

  it("clearTokens removes tokens from memory and storage", () => {
    apiClient.setTokens("access123", "refresh456");
    apiClient.clearTokens();
    expect(apiClient.getAccessToken()).toBeNull();
    expect(apiClient.getRefreshToken()).toBeNull();
    expect(sessionStorage.getItem("accessToken")).toBeNull();
  });

  it("setTokens without refreshToken keeps existing refreshToken", () => {
    apiClient.setTokens("access1", "refresh1");
    apiClient.setTokens("access2"); // no refresh
    expect(apiClient.getRefreshToken()).toBe("refresh1");
  });
});

// ---------------------------------------------------------------------------
describe("ApiClient – HTTP methods", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    apiClient.clearTokens();
    apiClient.setTokens("test-token");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GET request calls correct URL and sets Authorization header", async () => {
    const fetchMock = mockFetchOk({ hello: "world" });
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiClient.get<{ hello: string }>("/test");

    expect(result).toEqual({ hello: "world" });
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/test");
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer test-token"
    );
  });

  it("GET request appends query params to URL", async () => {
    const fetchMock = mockFetchOk({});
    vi.stubGlobal("fetch", fetchMock);

    await apiClient.get("/sensors", { params: { limit: 10, cursor: "abc" } });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("limit=10");
    expect(url).toContain("cursor=abc");
  });

  it("POST request sends body as JSON", async () => {
    const fetchMock = mockFetchOk({ id: "123" });
    vi.stubGlobal("fetch", fetchMock);

    await apiClient.post("/sensors", { name: "New Sensor" });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual({ name: "New Sensor" });
  });

  it("PUT request sends body as JSON", async () => {
    const fetchMock = mockFetchOk({ updated: true });
    vi.stubGlobal("fetch", fetchMock);

    await apiClient.put("/sensors/1", { name: "Updated" });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body as string)).toEqual({ name: "Updated" });
  });

  it("DELETE request uses DELETE method", async () => {
    const fetchMock = mockFetchOk({});
    vi.stubGlobal("fetch", fetchMock);

    await apiClient.delete("/sensors/1");

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe("DELETE");
  });

  it("throws on non-ok response with server message", async () => {
    const fetchMock = mockFetchError(400, { message: "Bad Request" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiClient.get("/bad")).rejects.toThrow("Bad Request");
  });

  it("throws on non-ok response with fallback message", async () => {
    const fetchMock = mockFetchError(500, {});
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiClient.get("/error")).rejects.toThrow("Lỗi 500");
  });

  it("handles empty response body (204 No Content)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiClient.delete("/sensors/1");
    expect(result).toEqual({});
  });

  it("throws JSON parse error on malformed response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "not-json{{{",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiClient.get("/bad-json")).rejects.toThrow(
      "Không thể đọc dữ liệu từ Server"
    );
  });
});

// ---------------------------------------------------------------------------
describe("ApiClient – 401 token refresh", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    apiClient.clearTokens();
  });

  it("clears tokens and throws when 401 and no refresh token", async () => {
    apiClient.setTokens("expired-token");

    const fetchMock = mockFetchError(401, { message: "Unauthorized" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiClient.get("/protected", { retry: 1 })
    ).rejects.toBeDefined();

    expect(apiClient.getAccessToken()).toBeNull();
  });
});
