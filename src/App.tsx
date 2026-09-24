import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth, isLeaderRole } from "./lib/auth";
import { AppShell } from "./components/layout/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { AgendaPage } from "./pages/AgendaPage";
import { CalendarPage } from "./pages/CalendarPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ScheduleMatrixPage } from "./pages/ScheduleMatrixPage";
import { MinistriesPage } from "./pages/MinistriesPage";
import { SwapsPage } from "./pages/SwapsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { PlaylistsPage } from "./pages/PlaylistsPage";

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carregando...</div>
  );
}

function LeaderOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isLeaderRole(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "ADMIN") return <Navigate to="/" replace />;
  return <>{children}</>;
}

function LouvorOnly({ children }: { children: React.ReactNode }) {
  const { user, loading, ministries } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  const allowed = user.role === "ADMIN" || ministries.some((m) => m.name === "Louvor");
  if (!allowed) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <Loading />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        path="/*"
        element={
          user ? (
            <AppShell>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/agenda" element={<AgendaPage />} />
                <Route path="/calendario" element={<CalendarPage />} />
                <Route path="/perfil" element={<ProfilePage />} />
                <Route
                  path="/escala"
                  element={
                    <LeaderOnly>
                      <ScheduleMatrixPage />
                    </LeaderOnly>
                  }
                />
                <Route
                  path="/ministerios"
                  element={
                    <AdminOnly>
                      <MinistriesPage />
                    </AdminOnly>
                  }
                />
                <Route
                  path="/trocas"
                  element={
                    <LeaderOnly>
                      <SwapsPage />
                    </LeaderOnly>
                  }
                />
                <Route
                  path="/relatorios"
                  element={
                    <LeaderOnly>
                      <ReportsPage />
                    </LeaderOnly>
                  }
                />
                <Route
                  path="/playlists"
                  element={
                    <LouvorOnly>
                      <PlaylistsPage />
                    </LouvorOnly>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppShell>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
}
