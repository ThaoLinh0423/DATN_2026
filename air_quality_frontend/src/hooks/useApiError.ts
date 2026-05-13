import { useNavigate } from "react-router-dom";
import { useCallback } from "react";
import { apiClient } from "@/api/client";

export interface ApiError {
  status: number;
  message: string;
}

/**
 * Parse error từ API call
 */
export function parseApiError(error: unknown): ApiError {
  if (error instanceof Error) {
    const status = (error as any).status || 500;
    return {
      status,
      message: error.message || "Đã xảy ra lỗi",
    };
  }
  return {
    status: 500,
    message: "Đã xảy ra lỗi không xác định",
  };
}

/**
 * Hook xử lý lỗi API tập trung
 * - 401: Redirect đến login
 * - 403: Redirect đến /forbidden
 * - 404: Redirect đến /not-found
 * - Khác: Hiển thị thông báo lỗi
 */
export function useApiError() {
  const navigate = useNavigate();

  const handleError = useCallback(
    (error: unknown) => {
      const apiError = parseApiError(error);

      switch (apiError.status) {
        case 401:
          // Token hết hạn hoặc không hợp lệ
          apiClient.clearTokens();
          navigate("/login", { replace: true });
          break;
        case 403:
          // Không có quyền truy cập
          navigate("/forbidden", { replace: true });
          break;
        case 404:
          // Không tìm thấy
          navigate("/not-found", { replace: true });
          break;
        default:
          // Lỗi khác - trả về để component xử lý
          break;
      }

      return apiError;
    },
    [navigate]
  );

  return { handleError, parseApiError };
}
