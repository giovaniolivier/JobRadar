import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, ensureCsrf } from "./api";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  loading: boolean;
  setSession: (user: AuthUser) => void;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    await ensureCsrf();
    try {
      const data = await api<{ user: AuthUser }>("/auth/me");
      setUser(data.user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await refreshSession();
      setLoading(false);
    })();
  }, [refreshSession]);

  const setSession = useCallback((nextUser: AuthUser) => {
    setUser(nextUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST", body: "{}" });
    } catch {
      // ignore
    }
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      token: user ? "cookie" : null,
      user,
      loading,
      setSession,
      logout,
      refreshSession,
    }),
    [user, loading, setSession, logout, refreshSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
