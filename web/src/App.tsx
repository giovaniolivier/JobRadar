import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { LocaleProvider } from "./lib/i18n";
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
  LegalPrivacyPage,
  ResetPasswordPage,
} from "./pages/LegalPages";

function PrivateRoute() {
  const { token, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="label">Chargement de la session…</p>
      </div>
    );
  }
  if (!token) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** `/` : landing publique, ou tableau de bord si déjà connecté. */
function HomeRoute() {
  const { token, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="label">Chargement de la session…</p>
      </div>
    );
  }
  if (!token) return <LandingPage />;
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <LocaleProvider>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/legal/cgu" element={<LegalCguPage />} />
          <Route path="/legal/privacy" element={<LegalPrivacyPage />} />
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
