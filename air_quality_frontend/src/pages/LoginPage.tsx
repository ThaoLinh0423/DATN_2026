import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLogin, useRegister } from "@/hooks/useApi";
import { AlertCircle, Loader2, Wind } from "lucide-react";

const LoginPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");

  // Login
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const loginMutation = useLogin();

  // Register
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerTimezone, setRegisterTimezone] = useState("Asia/Ho_Chi_Minh");
  const registerMutation = useRegister();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(
      { email: loginEmail, password: loginPassword },
      { onSuccess: () => navigate("/", { replace: true }) }
    );
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await registerMutation.mutateAsync({
        email: registerEmail,
        password: registerPassword,
        timezone: registerTimezone,
      });
      setActiveTab("login");
      setLoginEmail(registerEmail);
      setRegisterEmail("");
      setRegisterPassword("");
    } catch {}
  };

  const inputStyle: React.CSSProperties = {
    background: "#ffffff",
    border: "1px solid #c8d6e5",
    borderRadius: 6,
    color: "#1e2a3a",
    fontSize: 14,
    padding: "9px 12px",
    width: "100%",
    outline: "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
    boxSizing: "border-box" as const,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600,
    color: "#6b7a90",
    textTransform: "uppercase" as const,
    letterSpacing: "0.8px",
    display: "block", marginBottom: 6,
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #e4f0fb 0%, #f0f4f8 50%, #ddeaf7 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{
        width: "100%", maxWidth: 400,
        background: "#ffffff",
        border: "1px solid #c8d6e5",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 8px 32px rgba(0,80,160,0.14)",
      }}>
        {/* ── Header ─────────────────────────────────── */}
        <div style={{
          padding: "28px 28px 20px",
          borderBottom: "1px solid #e8f0f9",
          textAlign: "center",
          background: "linear-gradient(180deg, #f0f8ff 0%, #ffffff 100%)",
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 10,
            background: "#0078d4",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 14px",
            boxShadow: "0 4px 14px rgba(0,120,212,0.35)",
          }}>
            <Wind style={{ width: 24, height: 24, color: "#ffffff" }} />
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#1e2a3a", margin: "0 0 4px" }}>
            Hệ thống Giám sát Không khí
          </h1>
          <p style={{ fontSize: 13, color: "#6b7a90", margin: 0 }}>
            THAL AI SYSTEM
          </p>
        </div>

        {/* ── Tab Switcher ───────────────────────────── */}
        <div style={{
          display: "flex",
          borderBottom: "1px solid #e8f0f9",
          background: "#f8fafd",
        }}>
          {(["login", "register"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1, padding: "11px 0",
                fontSize: 12, fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "1px",
                cursor: "pointer",
                border: "none",
                borderBottom: activeTab === tab
                  ? "2px solid #0078d4"
                  : "2px solid transparent",
                color: activeTab === tab ? "#0078d4" : "#6b7a90",
                background: activeTab === tab
                  ? "rgba(0,120,212,0.05)"
                  : "transparent",
                transition: "all 0.15s",
              }}
            >
              {tab === "login" ? "Đăng nhập" : "Đăng ký"}
            </button>
          ))}
        </div>

        {/* ── Forms ──────────────────────────────────── */}
        <div style={{ padding: "24px 28px 28px" }}>

          {/* LOGIN */}
          {activeTab === "login" && (
            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {loginMutation.error && (
                <Alert variant="destructive" style={{ background: "rgba(196,49,75,0.07)", border: "1px solid rgba(196,49,75,0.3)", borderRadius: 6 }}>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription style={{ color: "#c4314b" }}>
                    {loginMutation.error instanceof Error ? loginMutation.error.message : "Đăng nhập thất bại"}
                  </AlertDescription>
                </Alert>
              )}

              <div>
                <label style={labelStyle}>Email</label>
                <input
                  type="email"
                  placeholder="user@example.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  disabled={loginMutation.isPending}
                  style={inputStyle}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = "#0078d4";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(0,120,212,0.12)";
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = "#c8d6e5";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>

              <div>
                <label style={labelStyle}>Mật khẩu</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  disabled={loginMutation.isPending}
                  style={inputStyle}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = "#0078d4";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(0,120,212,0.12)";
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = "#c8d6e5";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loginMutation.isPending || !loginEmail || !loginPassword}
                style={{
                  width: "100%", padding: "10px 16px",
                  borderRadius: 6, fontSize: 14, fontWeight: 700,
                  cursor: loginMutation.isPending ? "not-allowed" : "pointer",
                  background: "#0078d4",
                  color: "#ffffff",
                  border: "1px solid #0078d4",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  opacity: (loginMutation.isPending || !loginEmail || !loginPassword) ? 0.55 : 1,
                  transition: "all 0.15s",
                  marginTop: 4,
                  boxShadow: "0 2px 8px rgba(0,120,212,0.25)",
                }}
                onMouseEnter={e => {
                  if (!loginMutation.isPending)
                    (e.currentTarget as HTMLButtonElement).style.background = "#005a9e";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = "#0078d4";
                }}
              >
                {loginMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {loginMutation.isPending ? "Đang đăng nhập..." : "Đăng nhập"}
              </button>
            </form>
          )}

          {/* REGISTER */}
          {activeTab === "register" && (
            <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {registerMutation.error && (
                <Alert variant="destructive" style={{ background: "rgba(196,49,75,0.07)", border: "1px solid rgba(196,49,75,0.3)", borderRadius: 6 }}>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription style={{ color: "#c4314b" }}>
                    {registerMutation.error instanceof Error ? registerMutation.error.message : "Đăng ký thất bại"}
                  </AlertDescription>
                </Alert>
              )}

              <div>
                <label style={labelStyle}>Email</label>
                <input
                  type="email"
                  placeholder="user@example.com"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  required
                  disabled={registerMutation.isPending}
                  style={inputStyle}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = "#0078d4";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(0,120,212,0.12)";
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = "#c8d6e5";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>

              <div>
                <label style={labelStyle}>Mật khẩu</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  required
                  disabled={registerMutation.isPending}
                  style={inputStyle}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = "#0078d4";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(0,120,212,0.12)";
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = "#c8d6e5";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>

              <div>
                <label style={labelStyle}>Múi giờ</label>
                <select
                  value={registerTimezone}
                  onChange={(e) => setRegisterTimezone(e.target.value)}
                  disabled={registerMutation.isPending}
                  style={{ ...inputStyle, appearance: "none" as const }}
                >
                  <option value="Asia/Ho_Chi_Minh">Việt Nam (GMT+7)</option>
                  <option value="Asia/Bangkok">Thái Lan (GMT+7)</option>
                  <option value="Asia/Shanghai">Trung Quốc (GMT+8)</option>
                  <option value="Asia/Tokyo">Nhật Bản (GMT+9)</option>
                  <option value="Australia/Sydney">Úc (GMT+11)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={registerMutation.isPending || !registerEmail || !registerPassword}
                style={{
                  width: "100%", padding: "10px 16px",
                  borderRadius: 6, fontSize: 14, fontWeight: 700,
                  cursor: registerMutation.isPending ? "not-allowed" : "pointer",
                  background: "#00875a",
                  color: "#ffffff",
                  border: "1px solid #00875a",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  opacity: (registerMutation.isPending || !registerEmail || !registerPassword) ? 0.55 : 1,
                  transition: "all 0.15s",
                  marginTop: 4,
                  boxShadow: "0 2px 8px rgba(0,135,90,0.20)",
                }}
                onMouseEnter={e => {
                  if (!registerMutation.isPending)
                    (e.currentTarget as HTMLButtonElement).style.background = "#006644";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = "#00875a";
                }}
              >
                {registerMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {registerMutation.isPending ? "Đang đăng ký..." : "Đăng ký"}
              </button>

              <p style={{ fontSize: 11, textAlign: "center", color: "#93b8d8", margin: 0 }}>
                Mật khẩu phải có ít nhất 8 ký tự
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
