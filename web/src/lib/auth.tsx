import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, ensureCsrf, isNetworkError } from "./api";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

/** Cause d'un échec de chargement de session côté réseau (pas « non connecté »). */
export type SessionError = "network" | "timeout" | null;

type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  loading: boolean;
  sessionError: SessionError;
  setSession: (user: AuthUser) => void;
  logout: () => Promise<void>;
  refreshSession: () => Promise<SessionError>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Délais avant nouvelle tentative au démarrage (service Render en veille). */
const BOOT_RETRY_DELAYS_MS = [0, 2_000, 5_000];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<SessionError>(null);

  /**
   * Ne lève jamais : un échec réseau ne doit pas interrompre le boot
   * (sinon `setLoading(false)` n'était jamais atteint => spinner infini).
   * Renvoie la nature de l'erreur pour permettre des tentatives.
   */
  const refreshSession = useCallback(async (): Promise<SessionError> => {
    try {
      await ensureCsrf();
      const data = await api<{ user: AuthUser }>("/auth/me");
      setUser(data.user);
      setSessionError(null);
      return null;
    } catch (err) {
      setUser(null);
      const next: SessionError = isNetworkError(err)
        ? err.code === "timeout"
          ? "timeout"
          : "network"
        : null;
      setSessionError(next);
      return next;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        for (const delay of BOOT_RETRY_DELAYS_MS) {
          if (delay > 0) await sleep(delay);
          if (cancelled) return;
          const error = await refreshSession();
          if (cancelled) return;
          if (!error) break;
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSession]);

  const setSession = useCallback((nextUser: AuthUser) => {
    setUser(nextUser);
    setSessionError(null);
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
      sessionError,
      setSession,
      logout,
      refreshSession,
    }),
    [user, loading, sessionError, setSession, logout, refreshSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
