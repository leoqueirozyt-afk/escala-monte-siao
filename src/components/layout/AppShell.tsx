import { NavLink, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import {
  CalendarDays,
  ClipboardList,
  Home,
  LogOut,
  CalendarOff,
  User as UserIcon,
  Users,
  BarChart3,
  Handshake,
  ListMusic,
  Menu,
} from "lucide-react";
import { useState } from "react";
import { useAuth, isLeaderRole } from "../../lib/auth";
import { cn, roleLabel } from "../../lib/utils";
import { ThemeToggle } from "../ThemeToggle";
import { ChurchMark } from "../ChurchMark";

const volunteerNav = [
  { to: "/", label: "Início", icon: Home },
  { to: "/agenda", label: "Agenda", icon: ClipboardList },
  { to: "/calendario", label: "Calendário", icon: CalendarDays },
  { to: "/perfil", label: "Perfil", icon: UserIcon },
];

const leaderNav = [
  { to: "/escala", label: "Escala", icon: CalendarDays },
  { to: "/trocas", label: "Trocas", icon: Handshake },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
];

const adminNav = [{ to: "/ministerios", label: "Ministérios", icon: Users }];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout, ministries } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const leader = user ? isLeaderRole(user.role) : false;
  const admin = user?.role === "ADMIN";
  const showPlaylist = admin || ministries.some((m) => m.name === "Louvor");
  const playlistNav = showPlaylist ? [{ to: "/playlists", label: "Playlist", icon: ListMusic }] : [];
  const desktopNav = leader
    ? [
        { to: "/", label: "Início", icon: Home },
        { to: "/agenda", label: "Minha Agenda", icon: ClipboardList },
        { to: "/calendario", label: "Indisponibilidade", icon: CalendarOff },
        ...leaderNav,
        ...(admin ? adminNav : []),
        ...playlistNav,
        { to: "/perfil", label: "Perfil", icon: UserIcon },
      ]
    : [...volunteerNav.slice(0, 3), ...playlistNav, volunteerNav[3]];

  const bottomNav = leader
    ? [
        { to: "/", label: "Início", icon: Home },
        { to: "/agenda", label: "Agenda", icon: ClipboardList },
        { to: "/escala", label: "Escala", icon: CalendarDays },
        ...playlistNav,
        { to: "/perfil", label: "Perfil", icon: UserIcon },
      ]
    : [...volunteerNav.slice(0, 3), ...playlistNav, volunteerNav[3]];

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-card md:flex">
        <div className="relative overflow-hidden border-b px-5 py-5">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(155deg,var(--brand-church)_0%,#A00F26_48%,var(--brand-mountain)_100%)] opacity-95"
          />
          <span aria-hidden="true" className="absolute -left-8 -top-10 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
          <span aria-hidden="true" className="absolute -right-6 bottom-0 h-24 w-24 rounded-full bg-mountain/40 blur-xl" />
          <div className="relative flex items-center gap-3">
            <ChurchMark className="h-10 w-10" />
            <div>
              <p className="text-sm font-bold leading-tight tracking-[0.04em] text-white">MONTE SIÃO</p>
              <p className="text-xs text-white/85">Escala de Voluntários</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-3">
          {desktopNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/12 text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-3">
          <button
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut size={18} /> Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        <header className="sticky top-0 z-40 flex items-center justify-between border-b bg-card/90 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Menu"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-xl p-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2">
              <ChurchMark className="h-8 w-8" />
              <span className="text-sm font-bold tracking-[0.04em]">Escala Monte Sião</span>
            </div>
          </div>
          <p className="hidden text-sm font-semibold tracking-[0.04em] md:block">Igreja Monte Sião</p>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="hidden text-right md:block">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{roleLabel(user?.role)}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-sm font-bold text-primary">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={user.name} className="h-full w-full object-cover" />
              ) : (
                user?.name?.charAt(0).toUpperCase()
              )}
            </div>
          </div>
        </header>

        <div
          id="mobile-menu"
          hidden={!menuOpen}
          className={menuOpen ? "border-b bg-card px-4 py-3 md:hidden" : "hidden"}
        >
          <nav className="grid grid-cols-2 gap-2">
            {desktopNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium",
                    isActive
                      ? "bg-primary/12 text-primary shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )
                }
              >
                <item.icon size={16} />
                {item.label}
              </NavLink>
            ))}
            <button
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
              className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10"
            >
              <LogOut size={16} /> Sair
            </button>
          </nav>
        </div>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 md:px-6">{children}</main>

        {ministries.length > 0 && (
          <div className="mx-auto hidden w-full max-w-5xl px-6 pb-4 md:block">
            <p className="text-xs text-muted-foreground">
              Seus ministérios: {ministries.map((m) => m.name).join(", ")}
            </p>
          </div>
        )}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {bottomNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground",
                )
              }
            >
              <item.icon size={20} />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
