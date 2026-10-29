import { useState } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { API_URL } from "./lib/api";
import { LocaleProvider, useLocale } from "./lib/i18n";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { LandingPage } from "./pages/LandingPage";
import { DashboardPage } from "./pages/DashboardPage";
import { OnboardingCvPage } from "./pages/OnboardingCvPage";
import { OffersPage } from "./pages/OffersPage";
import { JobDetailPage } from "./pages/JobDetailPage";
import { ProfilePage } from "./pages/ProfilePage";
import { PipelinePage } from "./pages/PipelinePage";
import { ImportPage } from "./pages/ImportPage";
import { ContinuePage } from "./pages/ContinuePage";
import { SettingsPage } from "./pages/SettingsPage";
import {
  ForgotPasswordPage,
  LegalCguPage,
  LegalMentionsPage,
  LegalPrivacyPage,
  ResetPasswordPage,
} from "./pages/LegalPages";

function SessionLoading() {
  const { t } = useLocale();
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="label">{t("common.loadingSession")}</p>
    </div>
  );
}

/** Bandeau affiché quand l'API est injoignable (mauvaise URL, CORS, service en veille). */
function ApiStatusBanner() {
  const { t } = useLocale();
  const { sessionError, refreshSession } = useAuth();
  const [retrying, setRetrying] = useState(false);

  if (!sessionError) return null;

  const retry = async () => {
    setRetrying(true);
    try {
      await refreshSession();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-sm"
      style={{ background: "var(--brick)", color: "var(--paper-lift)" }}
    >
      <span>
        {t(sessionError === "timeout" ? "common.apiTimeout" : "common.apiUnreachable")}{" "}
        <span className="font-mono text-xs opacity-80">{API_URL}</span>
      </span>
      <button
        type="button"
        className="underline underline-offset-4 disabled:opacity-60"
        onClick={() => void retry()}
        disabled={retrying}
      >
        {retrying ? t("common.loadingSession") : t("common.retry")}
      </button>
    </div>
  );
}

function PrivateRoute() {
  const { token, loading } = useAuth();
  if (loading) return <SessionLoading />;
  if (!token) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** `/` : landing publique, ou tableau de bord si déjà connecté. */
function HomeRoute() {
  const { token, loading } = useAuth();
  if (loading) return <SessionLoading />;
  if (!token) return <LandingPage />;
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <LocaleProvider>
      <AuthProvider>
        <ApiStatusBanner />
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/legal/cgu" element={<LegalCguPage />} />
          <Route path="/legal/privacy" element={<LegalPrivacyPage />} />
          <Route path="/legal/mentions" element={<LegalMentionsPage />} />
          <Route path="/continue" element={<ContinuePage />} />
          <Route element={<PrivateRoute />}>
            <Route path="/onboarding" element={<OnboardingCvPage />} />
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/offers" element={<OffersPage />} />
              <Route path="/offers/:id" element={<JobDetailPage />} />
              <Route path="/jobs/:id" element={<JobDetailPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/pipeline" element={<PipelinePage />} />
              <Route path="/import" element={<ImportPage />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </LocaleProvider>
  );
}
