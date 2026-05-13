import { useCurrentUser } from "./useApi";

/**
 * Helper hook để kiểm tra role của user hiện tại
 * Sử dụng trong các component để ẩn/hiện UI theo quyền
 */
export function useRole() {
  const { data: user, isLoading, error } = useCurrentUser();

  return {
    // Role info
    role: user?.role,
    userId: user?.userId,
    userName: user?.name,
    userEmail: user?.email,
    
    // Role checks
    isAdmin: user?.role === "admin",
    isManager: user?.role === "manager",
    isUser: user?.role === "user",
    isAdminOrManager: user?.role === "admin" || user?.role === "manager",
    
    // Loading state
    isLoading,
    isError: !!error,
    
    // Check if user is authenticated
    isAuthenticated: !!user,
  };
}
