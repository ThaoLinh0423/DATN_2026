import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  RefreshCw, Loader2, Users, MoreVertical, Shield,
  UserCog, User as UserIcon, AlertCircle, Key,
} from "lucide-react";
import { toast } from "sonner";
import {
  useAdminUsers, useUpdateUserRole, useCurrentUser,
} from "@/hooks/useApi";
import { useRole } from "@/hooks/useRole";
import { useNavigate } from "react-router-dom";

const AdminUsersPage = () => {
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "manager" | "user">("all");
  const [cursor, setCursor]         = useState<string | undefined>(undefined);

  const { isAdmin } = useRole();
  const { data: currentUser } = useCurrentUser();
  const navigate = useNavigate();

  const { data, isLoading, refetch, error } = useAdminUsers(roleFilter, 50, cursor);
  const users      = data?.data      || [];
  const total      = data?.total     || 0;
  const nextCursor = data?.nextCursor;

  const updateRole = useUpdateUserRole();

  if (!isAdmin) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <Shield className="h-16 w-16 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Truy cập bị từ chối</h2>
          <p className="text-muted-foreground">Bạn cần quyền admin để truy cập trang này</p>
          <Button onClick={() => navigate("/")}>Quay về trang chủ</Button>
        </div>
      </MainLayout>
    );
  }

  const handleRoleChange = async (
    userId: string,
    newRole: "admin" | "manager" | "user",
    userName: string,
  ) => {
    if (userId === currentUser?.userId) {
      toast.error("Bạn không thể thay đổi role của chính mình");
      return;
    }
    try {
      await updateRole.mutateAsync({ userId, role: newRole });
      toast.success(`Đã đổi role của "${userName}" thành ${newRole}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi khi đổi role");
    }
  };

  const getRoleBadge = (role: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "outline"; icon: React.ReactNode }> = {
      admin:   { label: "Admin",   variant: "default",   icon: <Shield  className="h-3 w-3 mr-1" /> },
      manager: { label: "Manager", variant: "secondary", icon: <UserCog className="h-3 w-3 mr-1" /> },
      user:    { label: "User",    variant: "outline",   icon: <UserIcon className="h-3 w-3 mr-1" /> },
    };
    const r = map[role] || { label: role, variant: "outline" as const, icon: null };
    return (
      <Badge variant={r.variant} className="flex items-center">
        {r.icon}{r.label}
      </Badge>
    );
  };

  return (
    <MainLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Quản lý Người dùng</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Xem và quản lý người dùng trong hệ thống
            </p>
          </div>
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
            <p className="text-sm text-destructive">{error.message}</p>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-4">
          <Select
            value={roleFilter}
            onValueChange={(v) => { setRoleFilter(v as any); setCursor(undefined); }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Lọc theo role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả role</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="user">User</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">{total} người dùng</p>
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /><span>Đang tải...</span>
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <Users className="h-8 w-8" /><p>Không có người dùng nào</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    {["Email", "Họ tên", "SĐT", "Role", "Timezone", "Ngày tạo", ""].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((user) => (
                    <tr key={user.userId} className="hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium">{user.email}</div>
                        {user.userId === currentUser?.userId && (
                          <span className="text-xs text-muted-foreground">(bạn)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">{user.name  || "—"}</td>
                      <td className="px-4 py-3 text-sm">{user.phone || "—"}</td>
                      <td className="px-4 py-3">{getRoleBadge(user.role)}</td>
                      <td className="px-4 py-3 text-sm">{user.timezone || "—"}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(user.createdAt).toLocaleDateString("vi-VN")}
                      </td>
                      <td className="px-4 py-3">
                        {user.userId === currentUser?.userId ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {/* Chuyển sang trang phân quyền, scroll/focus đúng user */}
                              <DropdownMenuItem
                                onClick={() =>
                                  navigate(`/admin/permissions?userId=${user.userId}`)
                                }
                              >
                                <Key className="h-4 w-4 mr-2" /> Phân quyền cảm biến
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleRoleChange(user.userId, "admin", user.name || user.email)}
                                disabled={updateRole.isPending}
                              >
                                <Shield className="h-4 w-4 mr-2" /> Đặt làm Admin
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleRoleChange(user.userId, "manager", user.name || user.email)}
                                disabled={updateRole.isPending}
                              >
                                <UserCog className="h-4 w-4 mr-2" /> Đặt làm Manager
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleRoleChange(user.userId, "user", user.name || user.email)}
                                disabled={updateRole.isPending}
                              >
                                <UserIcon className="h-4 w-4 mr-2" /> Đặt làm User
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {nextCursor && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => setCursor(nextCursor)}>
              Tải thêm
            </Button>
          </div>
        )}

      </div>
    </MainLayout>
  );
};

export default AdminUsersPage;
