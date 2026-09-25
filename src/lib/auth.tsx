import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import type { Ministry, User } from "../../shared/types";

interface AuthState {
  user: User | null;
  ministries: Ministry[];
  leaderMinistryIds: number[];
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    account_type?: "member" | "leader";
    ministry_id?: number;
    role_id?: number;
  }) => Promise<boolean>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [leaderMinistryIds, setLeaderMinistryIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<{ user: User; ministries: Ministry[]; leader_ministry_ids: number[] }>("/auth/me");
      setUser(data.user);
      setMinistries(data.ministries);
      setLeaderMinistryIds(data.leader_ministry_ids ?? []);
    } catch {
      setUser(null);
      setMinistries([]);
      setLeaderMinistryIds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      await api.post("/auth/login", { email, password });
      await refresh();
    },
    [refresh],
  );

  const register = useCallback(
    async (data: {
      name: string;
      email: string;
      password: string;
      phone?: string;
      account_type?: "member" | "leader";
      ministry_id?: number;
      role_id?: number;
    }) => {
      const res = await api.post<{ pending_approval?: boolean }>("/auth/register", data);
      if (!res.pending_approval) await refresh();
      return Boolean(res.pending_approval);
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    await api.post("/auth/logout");
    setUser(null);
    setMinistries([]);
    setLeaderMinistryIds([]);
  }, []);

  const value = useMemo(
    () => ({ user, ministries, leaderMinistryIds, loading, login, register, logout, refresh }),
    [user, ministries, leaderMinistryIds, loading, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fora do AuthProvider");
  return ctx;
}

export function isLeaderRole(role: string): boolean {
  return role === "ADMIN" || role === "LEADER";
}
