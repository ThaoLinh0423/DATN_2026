import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useCurrentUser } from "@/hooks/useApi";
import { Loader2 } from "lucide-react";

import Index from "./pages/Index";
import LocationsPage from "./pages/LocationsPage";
import DustReadingsPage from "./pages/DustReadingsPage";
import AlertsPage from "./pages/AlertsPage";
import ReportsPage from "./pages/ReportsPage";
import LoginPage from "./pages/LoginPage";
import SettingsPage from "./pages/SettingsPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import AdminPermissionsPage from "./pages/AdminPermissionsPage";
import NotFound from "./pages/NotFound";
import Forbidden from "./pages/Forbidden";

/* =========================
   React Query config
========================= */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

/* =========================
   Protected Layout
========================= */
const ProtectedLayout = () => {
  const hasToken = !!apiClient.getAccessToken();

  if (!hasToken) {
    return <Navigate to="/login" replace />;
  }

  const { data: user, isLoading, isError } = useCurrentUser();

  if (isLoading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex",
        alignItems: "center", justifyContent: "center",
        background: "#000000",
      }}>
        <Loader2 style={{ width: 28, height: 28, color: "#faff69" }} className="animate-spin" />
      </div>
    );
  }

  if (isError || !user) {
    apiClient.clearTokens();
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

/* =========================
   Routes
========================= */
const AppRoutes = () => {
  return (
    <Routes>
      {/* PUBLIC */}
      <Route path="/login"     element={<LoginPage />} />
      <Route path="/forbidden" element={<Forbidden />} />
      <Route path="/not-found" element={<NotFound />} />

      {/* PROTECTED */}
      <Route element={<ProtectedLayout />}>
        <Route path="/"                    element={<Index />} />
        <Route path="/locations"           element={<LocationsPage />} />
        <Route path="/dust-readings"       element={<DustReadingsPage />} />
        <Route path="/alerts"              element={<AlertsPage />} />
        <Route path="/reports"             element={<ReportsPage />} />
        <Route path="/settings"            element={<SettingsPage />} />
        <Route path="/admin/users"         element={<AdminUsersPage />} />
        <Route path="/admin/permissions"   element={<AdminPermissionsPage />} />
      </Route>

      {/* FALLBACK */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

/* =========================
   App Root
========================= */
const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner position="top-right" theme="dark" />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
