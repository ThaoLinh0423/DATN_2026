import { Home, ChevronRight, Menu } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useApi";

const breadcrumbMap: Record<string, string> = {
  "/":                  "Dashboard",
  "/sensors":           "Danh sách trạm đo",
  "/locations":         "Quản lý vị trí",
  "/dust-readings":     "Dữ liệu nồng độ bụi",
  "/alerts":            "Cảnh báo",
  "/reports":           "Báo cáo",
  "/settings":          "Cài đặt",
  "/admin/users":       "Người dùng",
  "/admin/permissions": "Phân quyền",
};

const roleLabelMap: Record<string, string> = {
  admin:   "Quản trị viên",
  manager: "Quản lý",
  user:    "Người dùng",
};

interface HeaderProps {
  onMobileMenuToggle?: () => void;
}

export function Header({ onMobileMenuToggle }: HeaderProps) {
  const location = useLocation();
  const currentPage = breadcrumbMap[location.pathname] || "Trang";
  const { data: user } = useCurrentUser();
  const isAdmin = user?.role === "admin";

  return (
    <header style={{
      background: "#ffffff",
      borderBottom: "1px solid #c8d6e5",
      padding: "0 20px",
      height: 48,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexShrink: 0,
      boxShadow: "0 1px 4px rgba(0,80,160,0.08)",
    }}>
      {/* ── Breadcrumb ──────────────────────────────── */}
      <nav style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {/* Mobile toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMobileMenuToggle}
          style={{
            color: "#6b7a90", background: "transparent",
            border: "none", marginRight: 4,
            width: 32, height: 32,
          }}
        >
          <Menu className="h-4 w-4" />
        </Button>

        <Link
          to="/"
          style={{
            display: "flex", alignItems: "center",
            color: "#6b7a90", transition: "color 0.15s",
            textDecoration: "none",
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "#0078d4")}
          onMouseLeave={e => (e.currentTarget.style.color = "#6b7a90")}
        >
          <Home style={{ width: 13, height: 13 }} />
        </Link>

        <ChevronRight style={{ width: 12, height: 12, color: "#c8d6e5" }} />

        <span style={{ fontSize: 13, fontWeight: 600, color: "#1e2a3a" }}>
          {currentPage}
        </span>
      </nav>

      {/* ── User role badge ──────────────────────────── */}
      {user && (
        <div style={{
          fontSize: 11, fontWeight: 600,
          padding: "3px 12px",
          borderRadius: 6,
          border: isAdmin
            ? "1px solid rgba(0,120,212,0.35)"
            : "1px solid #c8d6e5",
          color:      isAdmin ? "#0078d4" : "#6b7a90",
          background: isAdmin ? "rgba(0,120,212,0.07)" : "#f0f4f8",
          textTransform: "uppercase",
          letterSpacing: "0.8px",
        }}>
          {roleLabelMap[user.role ?? "user"] ?? user.role}
        </div>
      )}
    </header>
  );
}
