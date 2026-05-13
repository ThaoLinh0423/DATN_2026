import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  RefreshCw, Loader2, Shield, AlertCircle, Key,
  Check, X, Search, ChevronDown, ChevronUp,
  UserCog, User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  useSensors, useAdminUsers, useAdminUser,
  useGrantSensorAccess, useRevokeSensorAccess,
  AdminUser, AdminUserDetail,
} from "@/hooks/useApi";
import { useRole } from "@/hooks/useRole";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

const C = {
  border: "#dde1e9", muted: "#8a96a8", text: "#1b1f26", subtext: "#4a5568",
  bg: "#f7f9fc", white: "#ffffff",
  blue: "#0078d4", green: "#00875a", red: "#c4314b", orange: "#d15b00",
};

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    admin:   { label: "Admin",   color: C.red,    bg: "rgba(196,49,75,0.10)",   icon: <Shield  size={10} /> },
    manager: { label: "Manager", color: C.orange, bg: "rgba(209,91,0,0.10)",    icon: <UserCog size={10} /> },
    user:    { label: "User",    color: C.muted,  bg: "rgba(138,150,168,0.12)", icon: <UserIcon size={10} /> },
  };
  const r = map[role] ?? map.user;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:10, color:r.color, background:r.bg }}>
      {r.icon}{r.label}
    </span>
  );
}

// ─── UserPermRow ──────────────────────────────────────────────────────────────
function UserPermRow({
  user,
  allSensors,
  searchSensor,
  isCurrentUser,
  defaultOpen = false,
  rowRef,
}: {
  user: AdminUser;
  allSensors: { sensorId: string; name: string; deviceId: string; status: string }[];
  searchSensor: string;
  isCurrentUser: boolean;
  defaultOpen?: boolean;
  rowRef?: React.RefObject<HTMLDivElement>;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const queryClient = useQueryClient();

  const { data: detail, isLoading } = useAdminUser(open ? user.userId : "");

  const grantAccess  = useGrantSensorAccess();
  const revokeAccess = useRevokeSensorAccess();

  const isPrivileged = user.role === "admin" || user.role === "manager";

  const grantedIds = useMemo(
    () => new Set((detail?.sensors ?? []).map((s) => s.sensorId)),
    [detail?.sensors],
  );

  const filteredSensors = useMemo(
    () => allSensors.filter(
      (s) =>
        s.name.toLowerCase().includes(searchSensor.toLowerCase()) ||
        s.deviceId.toLowerCase().includes(searchSensor.toLowerCase()),
    ),
    [allSensors, searchSensor],
  );

  const qk = useMemo(() => ["admin", "user", user.userId], [user.userId]);

  const toggleSensor = useCallback(async (sensorId: string, sensorName: string) => {
    if (isPrivileged || !detail) return;
    const has = grantedIds.has(sensorId);

    await queryClient.cancelQueries({ queryKey: qk });
    const snapshot = queryClient.getQueryData<AdminUserDetail>(qk);

    queryClient.setQueryData<AdminUserDetail>(qk, (old) => {
      if (!old) return old;
      if (has) return { ...old, sensors: old.sensors.filter((s) => s.sensorId !== sensorId) };
      const sensor = allSensors.find((s) => s.sensorId === sensorId);
      return { ...old, sensors: [...old.sensors, { sensorId, name: sensor?.name ?? sensorName }] };
    });

    try {
      if (has) {
        await revokeAccess.mutateAsync({ sensorId, userId: user.userId });
        toast.success(`Đã thu hồi "${sensorName}"`);
      } else {
        await grantAccess.mutateAsync({ sensorId, userId: user.userId });
        toast.success(`Đã cấp "${sensorName}"`);
      }
      queryClient.invalidateQueries({ queryKey: qk, refetchType: "none" });
    } catch (err) {
      queryClient.setQueryData(qk, snapshot);
      toast.error(err instanceof Error ? err.message : "Lỗi khi cập nhật quyền");
    }
  }, [isPrivileged, detail, grantedIds, qk, queryClient, allSensors, grantAccess, revokeAccess, user.userId]);

  const grantAll = useCallback(async () => {
    if (isPrivileged || !detail) return;
    const missing = allSensors.filter((s) => !grantedIds.has(s.sensorId));
    if (!missing.length) { toast.info("Đã cấp quyền tất cả cảm biến rồi"); return; }

    await queryClient.cancelQueries({ queryKey: qk });
    const snapshot = queryClient.getQueryData<AdminUserDetail>(qk);
    queryClient.setQueryData<AdminUserDetail>(qk, (old) => {
      if (!old) return old;
      return { ...old, sensors: allSensors.map((s) => ({ sensorId: s.sensorId, name: s.name })) };
    });
    try {
      for (const s of missing) {
        await grantAccess.mutateAsync({ sensorId: s.sensorId, userId: user.userId });
      }
      toast.success(`Đã cấp ${missing.length} cảm biến cho ${user.name || user.email}`);
      queryClient.invalidateQueries({ queryKey: qk, refetchType: "none" });
    } catch (err) {
      queryClient.setQueryData(qk, snapshot);
      toast.error("Có lỗi khi cấp quyền hàng loạt");
    }
  }, [isPrivileged, detail, allSensors, grantedIds, qk, queryClient, grantAccess, user]);

  const revokeAll = useCallback(async () => {
    if (isPrivileged || !detail) return;
    const granted = allSensors.filter((s) => grantedIds.has(s.sensorId));
    if (!granted.length) { toast.info("Chưa cấp quyền cảm biến nào"); return; }

    await queryClient.cancelQueries({ queryKey: qk });
    const snapshot = queryClient.getQueryData<AdminUserDetail>(qk);
    queryClient.setQueryData<AdminUserDetail>(qk, (old) => {
      if (!old) return old;
      return { ...old, sensors: [] };
    });
    try {
      for (const s of granted) {
        await revokeAccess.mutateAsync({ sensorId: s.sensorId, userId: user.userId });
      }
      toast.success(`Đã thu hồi toàn bộ quyền của ${user.name || user.email}`);
      queryClient.invalidateQueries({ queryKey: qk, refetchType: "none" });
    } catch (err) {
      queryClient.setQueryData(qk, snapshot);
      toast.error("Có lỗi khi thu hồi quyền hàng loạt");
    }
  }, [isPrivileged, detail, allSensors, grantedIds, qk, queryClient, revokeAccess, user]);

  const anyPending = grantAccess.isPending || revokeAccess.isPending;

  // Highlight nếu được focus từ URL param
  const isHighlighted = defaultOpen;

  return (
    <div
      ref={rowRef}
      style={{
        border: `1.5px solid ${isHighlighted && open ? C.blue : C.border}`,
        borderRadius: 8,
        background: C.white,
        overflow: "hidden",
        boxShadow: open ? "0 2px 8px rgba(0,0,0,0.07)" : "0 1px 2px rgba(0,0,0,0.04)",
        transition: "box-shadow 0.15s, border-color 0.15s",
      }}
    >
      {/* Header */}
      <button
        onClick={() => !isCurrentUser && setOpen((v) => !v)}
        style={{ width:"100%", display:"flex", alignItems:"center", padding:"12px 16px", gap:12, background: open ? C.bg : "none", border:"none", cursor: isCurrentUser ? "default" : "pointer", textAlign:"left", transition:"background 0.15s" }}
      >
        <div style={{ width:36, height:36, borderRadius:"50%", flexShrink:0, background: isPrivileged ? "rgba(196,49,75,0.12)" : "rgba(0,120,212,0.10)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color: isPrivileged ? C.red : C.blue }}>
          {(user.name || user.email).charAt(0).toUpperCase()}
        </div>

        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            <span style={{ fontWeight:600, fontSize:13, color:C.text }}>{user.name || "—"}</span>
            <RoleBadge role={user.role} />
            {isCurrentUser && <span style={{ fontSize:10, color:C.muted, fontStyle:"italic" }}>(bạn)</span>}
            {isHighlighted && (
              <span style={{ fontSize:10, fontWeight:600, padding:"1px 7px", borderRadius:8, background:"rgba(0,120,212,0.10)", color:C.blue }}>
                được chọn
              </span>
            )}
          </div>
          <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{user.email}</div>
        </div>

        <div style={{ flexShrink:0 }}>
          {isPrivileged ? (
            <span style={{ fontSize:11, color:C.muted, fontStyle:"italic" }}>Tất cả (do role)</span>
          ) : (
            <span style={{ fontSize:12, fontWeight:700, padding:"3px 10px", borderRadius:12, background: open && grantedIds.size > 0 ? "rgba(0,120,212,0.10)" : C.bg, color: open && grantedIds.size > 0 ? C.blue : C.muted, border:`1px solid ${open && grantedIds.size > 0 ? "rgba(0,120,212,0.25)" : C.border}`, minWidth:80, display:"inline-block", textAlign:"center" }}>
              {open && !isLoading ? `${grantedIds.size} / ${allSensors.length}` : "—"} cảm biến
            </span>
          )}
        </div>

        {!isCurrentUser && (
          <div style={{ color:C.muted, flexShrink:0 }}>
            {open ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
          </div>
        )}
      </button>

      {/* Expanded panel */}
      {open && !isCurrentUser && (
        <div style={{ borderTop:`1px solid ${C.border}` }}>
          {isLoading ? (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"32px", color:C.muted, fontSize:13 }}>
              <Loader2 size={16} className="animate-spin"/> Đang tải quyền...
            </div>
          ) : isPrivileged ? (
            <div style={{ padding:"14px 20px", display:"flex", alignItems:"center", gap:8, color:C.orange, fontSize:13, background:"rgba(209,91,0,0.04)" }}>
              <Shield size={14}/>
              Role <strong style={{ margin:"0 3px" }}>{user.role}</strong> tự động có quyền tất cả cảm biến.
            </div>
          ) : (
            <>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 16px", background:C.bg, borderBottom:`1px solid ${C.border}` }}>
                <span style={{ fontSize:11, color:C.muted }}>
                  <strong style={{ color:C.text }}>{grantedIds.size}</strong> / {allSensors.length} cảm biến được cấp quyền
                </span>
                <div style={{ display:"flex", gap:6 }}>
                  <button onClick={grantAll} disabled={anyPending} style={{ fontSize:11, fontWeight:600, padding:"4px 12px", borderRadius:5, cursor: anyPending ? "not-allowed" : "pointer", opacity: anyPending ? 0.6 : 1, border:"1px solid rgba(0,135,90,0.4)", color:C.green, background:"rgba(0,135,90,0.06)" }}>
                    ✓ Cấp tất cả
                  </button>
                  <button onClick={revokeAll} disabled={anyPending} style={{ fontSize:11, fontWeight:600, padding:"4px 12px", borderRadius:5, cursor: anyPending ? "not-allowed" : "pointer", opacity: anyPending ? 0.6 : 1, border:"1px solid rgba(196,49,75,0.4)", color:C.red, background:"rgba(196,49,75,0.06)" }}>
                    ✕ Thu hồi tất cả
                  </button>
                </div>
              </div>

              <div style={{ padding:"12px 16px", display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(210px, 1fr))", gap:8 }}>
                {filteredSensors.length === 0 ? (
                  <div style={{ gridColumn:"1/-1", textAlign:"center", color:C.muted, fontSize:13, padding:"20px 0" }}>
                    Không tìm thấy cảm biến
                  </div>
                ) : filteredSensors.map((sensor) => {
                  const has = grantedIds.has(sensor.sensorId);
                  const thisProcessing =
                    (grantAccess.isPending  && grantAccess.variables?.sensorId  === sensor.sensorId) ||
                    (revokeAccess.isPending && revokeAccess.variables?.sensorId === sensor.sensorId);

                  return (
                    <div
                      key={sensor.sensorId}
                      onClick={() => !anyPending && toggleSensor(sensor.sensorId, sensor.name)}
                      style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:7, cursor: anyPending ? "not-allowed" : "pointer", border:`1.5px solid ${has ? "rgba(0,120,212,0.4)" : C.border}`, background: has ? "rgba(0,120,212,0.06)" : C.white, transition:"border-color 0.15s, background 0.15s", userSelect:"none", opacity: anyPending && !thisProcessing ? 0.55 : 1 }}
                    >
                      <div style={{ width:22, height:22, borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", background: has ? C.blue : C.border, transition:"background 0.15s", boxShadow: has ? "0 0 0 3px rgba(0,120,212,0.15)" : "none" }}>
                        {thisProcessing
                          ? <Loader2 size={12} color="#fff" className="animate-spin"/>
                          : has
                          ? <Check size={12} color="#fff" strokeWidth={3}/>
                          : <X     size={12} color="#fff" strokeWidth={2.5}/>
                        }
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight: has ? 600 : 400, color: has ? C.text : C.subtext, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {sensor.name}
                        </div>
                        <div style={{ fontSize:10, color:C.muted, display:"flex", alignItems:"center", gap:5, marginTop:1 }}>
                          <code style={{ background:C.bg, padding:"0 3px", borderRadius:3, fontSize:9 }}>{sensor.deviceId}</code>
                          <span style={{ width:5, height:5, borderRadius:"50%", flexShrink:0, background: sensor.status === "active" ? C.green : C.muted }}/>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const AdminPermissionsPage = () => {
  const { isAdmin, isLoading: roleLoading } = useRole();
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();
  const [searchParams] = useSearchParams();

  // userId từ query string — dùng để auto-expand và scroll đến user được chọn
  const focusUserId = searchParams.get("userId") ?? "";

  const [searchUser,   setSearchUser]   = useState("");
  const [searchSensor, setSearchSensor] = useState("");
  const [roleFilter,   setRoleFilter]   = useState<"all"|"user"|"manager"|"admin">("all");

  const { data: usersData,   isLoading: loadingUsers,   refetch: refetchUsers   } = useAdminUsers("all", 100);
  const { data: sensorsData, isLoading: loadingSensors, refetch: refetchSensors } = useSensors(100);

  const me = queryClient.getQueryData<{ userId: string }>(["user", "me"]);

  const allUsers   = usersData?.data   ?? [];
  const allSensors = sensorsData?.data ?? [];

  const filteredUsers = useMemo(() =>
    allUsers.filter((u) => {
      const matchRole   = roleFilter === "all" || u.role === roleFilter;
      const matchSearch =
        u.email.toLowerCase().includes(searchUser.toLowerCase()) ||
        (u.name ?? "").toLowerCase().includes(searchUser.toLowerCase());
      return matchRole && matchSearch;
    }),
  [allUsers, searchUser, roleFilter]);

  // Ref map: userId → DOM element để scroll đến
  const rowRefs = useRef<Record<string, React.RefObject<HTMLDivElement>>>({});

  // Tạo ref cho từng user một lần
  allUsers.forEach((u) => {
    if (!rowRefs.current[u.userId]) {
      rowRefs.current[u.userId] = { current: null } as React.RefObject<HTMLDivElement>;
    }
  });

  // Khi data load xong và có focusUserId → scroll đến row đó
  useEffect(() => {
    if (!focusUserId || loadingUsers) return;
    const ref = rowRefs.current[focusUserId];
    if (ref?.current) {
      // Delay nhỏ để DOM render xong
      setTimeout(() => {
        ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    }
  }, [focusUserId, loadingUsers]);

  const isLoading = loadingUsers || loadingSensors;

  if (roleLoading) {
    return (
      <MainLayout>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"60vh", gap:10, color:C.muted }}>
          <Loader2 size={20} className="animate-spin"/>
          <span>Đang kiểm tra quyền...</span>
        </div>
      </MainLayout>
    );
  }

  if (!isAdmin) {
    return (
      <MainLayout>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"60vh", gap:16 }}>
          <Shield size={56} color={C.muted}/>
          <h2 style={{ fontSize:18, fontWeight:600, color:C.text }}>Truy cập bị từ chối</h2>
          <p style={{ color:C.muted }}>Bạn cần quyền admin để truy cập trang này</p>
          <Button onClick={() => navigate("/")}>Quay về trang chủ</Button>
        </div>
      </MainLayout>
    );
  }

  const ROLES = [
    { v:"all",     label:"Tất cả" },
    { v:"user",    label:"User" },
    { v:"manager", label:"Manager" },
    { v:"admin",   label:"Admin" },
  ] as const;

  return (
    <MainLayout>
      <div style={{ display:"flex", flexDirection:"column", gap:16, paddingBottom:32 }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:C.white, border:`1px solid ${C.border}`, borderRadius:8, padding:"14px 20px", boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
          <div>
            <h1 style={{ fontSize:17, fontWeight:700, color:C.text, margin:0, display:"flex", alignItems:"center", gap:8 }}>
              <Key size={18} color={C.blue}/> Phân quyền cảm biến
            </h1>
            <p style={{ fontSize:11, color:C.muted, margin:"4px 0 0" }}>
              {allUsers.length} người dùng · {allSensors.length} cảm biến
              {focusUserId && (
                <span style={{ marginLeft:8, color:C.blue, fontWeight:600 }}>
                  · đang xem user được chọn
                </span>
              )}
            </p>
          </div>
          <Button variant="outline" size="icon" onClick={() => { refetchUsers(); refetchSensors(); }} disabled={isLoading}>
            <RefreshCw size={15} className={isLoading ? "animate-spin" : ""}/>
          </Button>
        </div>

        {/* Filters */}
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
          <div style={{ position:"relative", flex:"1 1 200px", minWidth:180 }}>
            <Search size={13} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:C.muted, pointerEvents:"none" }}/>
            <Input placeholder="Tìm user theo tên / email..." value={searchUser} onChange={(e) => setSearchUser(e.target.value)} style={{ paddingLeft:30, fontSize:12 }}/>
          </div>
          <div style={{ position:"relative", flex:"1 1 180px", minWidth:160 }}>
            <Search size={13} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:C.muted, pointerEvents:"none" }}/>
            <Input placeholder="Lọc cảm biến..." value={searchSensor} onChange={(e) => setSearchSensor(e.target.value)} style={{ paddingLeft:30, fontSize:12 }}/>
          </div>
          <div style={{ display:"flex", gap:4 }}>
            {ROLES.map((r) => (
              <button key={r.v} onClick={() => setRoleFilter(r.v)} style={{ fontSize:11, fontWeight:600, padding:"5px 12px", borderRadius:5, cursor:"pointer", border:`1px solid ${roleFilter === r.v ? C.blue : C.border}`, color: roleFilter === r.v ? C.blue : C.muted, background: roleFilter === r.v ? "rgba(0,120,212,0.08)" : C.white, transition:"all 0.15s" }}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, padding:"60px 0", color:C.muted }}>
            <Loader2 size={20} className="animate-spin"/>
            <span style={{ fontSize:14 }}>Đang tải...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div style={{ textAlign:"center", padding:"60px 0", color:C.muted }}>
            <AlertCircle size={36} style={{ marginBottom:12, opacity:0.4 }}/>
            <p>Không tìm thấy người dùng nào</p>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {filteredUsers.map((user) => (
              <UserPermRow
                key={user.userId}
                user={user}
                allSensors={allSensors}
                searchSensor={searchSensor}
                isCurrentUser={user.userId === me?.userId}
                defaultOpen={user.userId === focusUserId}
                rowRef={rowRefs.current[user.userId]}
              />
            ))}
          </div>
        )}

        {/* Legend */}
        <div style={{ display:"flex", gap:16, flexWrap:"wrap", padding:"10px 16px", background:C.white, border:`1px solid ${C.border}`, borderRadius:8, fontSize:11, color:C.subtext }}>
          <span style={{ fontWeight:700, color:C.muted }}>Chú thích:</span>
          <span style={{ display:"flex", alignItems:"center", gap:5 }}>
            <span style={{ width:16, height:16, borderRadius:"50%", background:C.blue, display:"inline-flex", alignItems:"center", justifyContent:"center" }}>
              <Check size={9} color="#fff" strokeWidth={3}/>
            </span>
            Có quyền — click để thu hồi
          </span>
          <span style={{ display:"flex", alignItems:"center", gap:5 }}>
            <span style={{ width:16, height:16, borderRadius:"50%", background:C.border, display:"inline-flex", alignItems:"center", justifyContent:"center" }}>
              <X size={9} color="#fff" strokeWidth={2.5}/>
            </span>
            Chưa có quyền — click để cấp
          </span>
        </div>

      </div>
    </MainLayout>
  );
};

export default AdminPermissionsPage;
