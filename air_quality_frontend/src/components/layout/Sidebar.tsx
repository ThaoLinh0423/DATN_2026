import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Settings, Monitor, FileText, Bell,
  MapPin, ChevronDown, ChevronRight, Menu, Wind,
  Users, Shield, Key,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useRole } from "@/hooks/useRole";

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path?: string;
  children?: MenuItem[];
}

const getMenuItems = (isAdmin: boolean): MenuItem[] => {
  const baseItems: MenuItem[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: <LayoutDashboard className="h-4 w-4" />,
      path: "/",
    },
    {
      id: "reports",
      label: "Báo cáo - Thống kê",
      icon: <FileText className="h-4 w-4" />,
      path: "/reports",
    },
    {
      id: "sensors",
      label: "Quản lý trạm đo",
      icon: <Monitor className="h-4 w-4" />,
      children: [
        {
          id: "locations",
          label: "Quản lý vị trí",
          icon: <MapPin className="h-3.5 w-3.5" />,
          path: "/locations",
        },
        {
          id: "dust",
          label: "Dữ liệu nồng độ bụi",
          icon: <Wind className="h-3.5 w-3.5" />,
          path: "/dust-readings",
        },
        {
          id: "alerts",
          label: "Cảnh báo",
          icon: <Bell className="h-3.5 w-3.5" />,
          path: "/alerts",
        },
      ],
    },
    {
      id: "settings",
      label: "Cài đặt",
      icon: <Settings className="h-4 w-4" />,
      path: "/settings",
    },
  ];

  if (isAdmin) {
    baseItems.push({
      id: "admin",
      label: "Quản trị",
      icon: <Shield className="h-4 w-4" />,
      children: [
        {
          id: "admin-users",
          label: "Người dùng",
          icon: <Users className="h-3.5 w-3.5" />,
          path: "/admin/users",
        },
        {
          id: "admin-permissions",
          label: "Phân quyền cảm biến",
          icon: <Key className="h-3.5 w-3.5" />,
          path: "/admin/permissions",
        },
      ],
    });
  }

  return baseItems;
};

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  onMobileClose?: () => void;
}

// Light blue sidebar — navy background (#0d3558) với text trắng/xanh nhạt
const SIDEBAR_BG = "#0d3558";   // navy
const SIDEBAR_BORDER = "#1e4d73";   // navy viền
const ACTIVE_BG = "rgba(56,189,248,0.15)"; // sky blue tint
const ACTIVE_COLOR = "#38bdf8";   // sky blue
const ACTIVE_BORDER = "rgba(56,189,248,0.40)";
const MUTED_COLOR = "#a8c8e8";   // xanh nhạt muted
const HOVER_BG = "rgba(255,255,255,0.08)";
const HOVER_COLOR = "#ffffff";

export function Sidebar({ isCollapsed, onToggle, onMobileClose }: SidebarProps) {
  const [expandedItems, setExpandedItems] = useState<string[]>(["sensors", "admin"]);
  const location = useLocation();
  const { isAdmin } = useRole();
  const menuItems = getMenuItems(isAdmin);

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const isActive = (path?: string) => path ? location.pathname === path : false;
  const handleLinkClick = () => { if (onMobileClose) onMobileClose(); };

  const renderMenuItem = (item: MenuItem, depth = 0) => {
    const hasChildren = !!item.children?.length;
    const isExpanded = expandedItems.includes(item.id);
    const active = isActive(item.path);

    const baseStyle: React.CSSProperties = {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: depth > 0 ? "6px 12px 6px 36px" : "7px 12px",
      margin: "1px 8px",
      borderRadius: 6,
      fontSize: 13,
      fontWeight: active ? 600 : 500,
      cursor: "pointer",
      transition: "all 0.15s",
      border: active ? `1px solid ${ACTIVE_BORDER}` : "1px solid transparent",
      background: active ? ACTIVE_BG : "transparent",
      color: active ? ACTIVE_COLOR : MUTED_COLOR,
      textDecoration: "none",
      width: isCollapsed ? "auto" : "calc(100% - 16px)",
    };

    const hoverProps = {
      onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.color = HOVER_COLOR;
          (e.currentTarget as HTMLElement).style.background = HOVER_BG;
        }
      },
      onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.color = MUTED_COLOR;
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }
      },
    };

    return (
      <div key={item.id}>
        {item.path && !hasChildren ? (
          <Link
            to={item.path}
            onClick={handleLinkClick}
            style={baseStyle}
            {...hoverProps}
          >
            <span style={{ flexShrink: 0, opacity: active ? 1 : 0.75 }}>{item.icon}</span>
            {!isCollapsed && <span>{item.label}</span>}
          </Link>
        ) : (
          <button
            onClick={() => hasChildren && toggleExpand(item.id)}
            style={{ ...baseStyle, width: "calc(100% - 16px)", textAlign: "left" }}
            {...hoverProps}
          >
            <span style={{ flexShrink: 0, opacity: 0.75 }}>{item.icon}</span>
            {!isCollapsed && (
              <>
                <span style={{ flex: 1 }}>{item.label}</span>
                {hasChildren && (
                  <ChevronDown
                    className={cn("h-3.5 w-3.5 transition-transform duration-200", isExpanded && "rotate-180")}
                    style={{ opacity: 0.5 }}
                  />
                )}
              </>
            )}
          </button>
        )}

        {hasChildren && isExpanded && !isCollapsed && (
          <div style={{ marginTop: 1 }}>
            {item.children?.map((child) => renderMenuItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      style={{
        display: "flex",
        flexDirection: "column",
        background: SIDEBAR_BG,
        borderRight: `1px solid ${SIDEBAR_BORDER}`,
        height: "100vh",
        width: isCollapsed ? 56 : 232,
        transition: "width 0.25s ease",
        flexShrink: 0,
      }}
    >
      {/* ── Logo / Header ─────────────────────────────── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "14px 12px",
        borderBottom: `1px solid ${SIDEBAR_BORDER}`,
        minHeight: 56,
      }}>
        <button
          onClick={onToggle}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 32, height: 32, borderRadius: 6, flexShrink: 0,
            background: "transparent", border: "1px solid transparent",
            cursor: "pointer", color: MUTED_COLOR, transition: "all 0.15s",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.color = ACTIVE_COLOR;
            (e.currentTarget as HTMLButtonElement).style.borderColor = ACTIVE_BORDER;
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.color = MUTED_COLOR;
            (e.currentTarget as HTMLButtonElement).style.borderColor = "transparent";
          }}
        >
          <Menu className="h-4 w-4" />
        </button>

        {!isCollapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, flexShrink: 0,
              background: "#0078d4",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 8px rgba(0,120,212,0.4)",
            }}>
              <Wind className="h-3.5 w-3.5" style={{ color: "#ffffff" }} />
            </div>
            <span style={{
              fontSize: 13, fontWeight: 700, color: "#ffffff",
              letterSpacing: "0.3px", whiteSpace: "nowrap",
            }}>
              THAL AI SYSTEM
            </span>
          </div>
        )}
      </div>

      {/* ── Navigation ────────────────────────────────── */}
      <nav style={{ flex: 1, padding: "8px 0", overflowY: "auto", overflowX: "hidden" }}>
        {!isCollapsed && (
          <div style={{
            fontSize: 10, fontWeight: 600, color: "#3d6d94",
            textTransform: "uppercase", letterSpacing: "1.4px",
            padding: "8px 20px 4px",
          }}>
            Navigation
          </div>
        )}
        {menuItems.map((item) => renderMenuItem(item))}
      </nav>

      {/* ── Footer ────────────────────────────────────── */}
      {!isCollapsed && (
        <div style={{
          padding: "10px 20px",
          borderTop: `1px solid ${SIDEBAR_BORDER}`,
          fontSize: 10, fontWeight: 600,
          color: "#3d6d94",
          textTransform: "uppercase",
          letterSpacing: "1.4px",
        }}>
          Air Quality Watch
        </div>
      )}
    </aside>
  );
}
