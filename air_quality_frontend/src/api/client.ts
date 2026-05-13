const API_BASE_URL = import.meta.env.VITE_API_URL;
const API_VERSION = "/v1";

export interface ApiResponse<T> {
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor?: string | null;
}

interface RequestConfig {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
  retry?: number;
}

class ApiClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private isRefreshing = false;
  private refreshQueue: Array<(token: string) => void> = [];

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.endsWith('/v1') ? baseUrl : baseUrl + API_VERSION;
    this.loadTokens();
  }

  private loadTokens() {
    this.accessToken = sessionStorage.getItem("accessToken") || localStorage.getItem("accessToken");
    this.refreshToken = sessionStorage.getItem("refreshToken") || localStorage.getItem("refreshToken");
  }

  private getHeaders(config?: RequestConfig): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(config?.headers || {}),
    };

    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    return headers;
  }

  setTokens(accessToken: string, refreshToken?: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken || this.refreshToken;
    
    sessionStorage.setItem("accessToken", accessToken);
    if (refreshToken) {
      sessionStorage.setItem("refreshToken", refreshToken);
    }
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    sessionStorage.removeItem("accessToken");
    sessionStorage.removeItem("refreshToken");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
  }

  private buildUrl(endpoint: string, params?: Record<string, string | number | boolean>): string {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  private async handleTokenRefresh(): Promise<string | null> {
    if (this.isRefreshing) {
      return new Promise((resolve) => {
        this.refreshQueue.push((token) => resolve(token));
      });
    }

    this.isRefreshing = true;

    try {
      if (!this.refreshToken) {
        throw new Error("No refresh token available");
      }

      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        this.clearTokens();
        throw new Error("Token refresh failed");
      }

      this.setTokens(data.accessToken, data.refreshToken);

      this.refreshQueue.forEach((callback) => callback(data.accessToken));
      this.refreshQueue = [];

      return data.accessToken;
    } catch (error) {
      console.error("Token refresh error:", error);
      this.clearTokens();
      this.refreshQueue = [];
      return null;
    } finally {
      this.isRefreshing = false;
    }
  }

  private async executeWithRetry<T>(
    method: string,
    url: string,
    config?: RequestConfig,
    body?: unknown
  ): Promise<T> {
    const retryAttempts = config?.retry ?? 1;

    for (let attempt = 0; attempt < retryAttempts; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: this.getHeaders(config),
          ...(body && { body: JSON.stringify(body) }),
        });

        if (response.status === 401) {
          if (attempt < retryAttempts - 1 && this.refreshToken) {
            const newToken = await this.handleTokenRefresh();
            
            if (newToken) {
              this.accessToken = newToken;
              continue;
            }
          }
          
          this.clearTokens();
        }

        return this.handleResponse<T>(response);
      } catch (error) {
        if (attempt < retryAttempts - 1) {
          await new Promise((resolve) => 
            setTimeout(resolve, Math.pow(2, attempt) * 100)
          );
          continue;
        }
        throw error;
      }
    }

    throw new Error("Max retry attempts reached");
  }

  async get<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    const url = this.buildUrl(endpoint, config?.params);
    return this.executeWithRetry<T>("GET", url, config);
  }

  async post<T, B = unknown>(endpoint: string, body?: B, config?: RequestConfig): Promise<T> {
    const url = this.buildUrl(endpoint, config?.params);
    const hasBody = body !== undefined && body !== null;
    return this.executeWithRetry<T>("POST", url, config, hasBody ? body : {});
  }

  async put<T, B = unknown>(endpoint: string, body?: B, config?: RequestConfig): Promise<T> {
    const url = this.buildUrl(endpoint, config?.params);
    const hasBody = body !== undefined && body !== null;
    return this.executeWithRetry<T>("PUT", url, config, hasBody ? body : {});
  }

  async patch<T, B = unknown>(endpoint: string, body?: B, config?: RequestConfig): Promise<T> {
    const url = this.buildUrl(endpoint, config?.params);
    const hasBody = body !== undefined && body !== null;
    return this.executeWithRetry<T>("PATCH", url, config, hasBody ? body : {});
  }

  async delete<T = void>(endpoint: string, config?: RequestConfig): Promise<T> {
    const url = this.buildUrl(endpoint, config?.params);
    return this.executeWithRetry<T>("DELETE", url, config);
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    const text = await response.text();
    let data;
    
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error("Không thể đọc dữ liệu từ Server (JSON Parse Error)");
    }

    if (!response.ok) {
      const message = data?.error?.message || data?.message || `Lỗi ${response.status}`;
      const error = new Error(message);
      (error as any).status = response.status;
      throw error;
    }

    return data as T;
  }
}

export const apiClient = new ApiClient(API_BASE_URL);