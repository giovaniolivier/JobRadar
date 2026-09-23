import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { resolvePostAuthPath } from "../lib/home";
import { useAuth } from "../lib/auth";

/** Landing after OAuth (or any auth) to choose onboarding vs dashboard. */
export function ContinuePage() {
  const { token, loading: authLoading } = useAuth();
  const [path, setPath] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !token) return;
    let cancelled = false;
    void resolvePostAuthPath().then((next) => {
      if (!cancelled) setPath(next);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, token]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="label">Préparation de votre espace…</p>
      </div>
    );
  }
  if (!token) return <Navigate to="/login" replace />;
  if (!path) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="label">Préparation de votre espace…</p>
      </div>
    );
  }
  return <Navigate to={path} replace />;
}
