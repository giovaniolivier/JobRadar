import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DashboardPage } from "./pages/DashboardPage";
import { JobDetailPage } from "./pages/JobDetailPage";
import { ProfilePage } from "./pages/ProfilePage";
import { PipelinePage } from "./pages/PipelinePage";
import { ImportPage } from "./pages/ImportPage";

function PrivateRoute() {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<PrivateRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/offers/:id" element={<JobDetailPage />} />
            <Route path="/jobs/:id" element={<JobDetailPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/pipeline" element={<PipelinePage />} />
            <Route path="/import" element={<ImportPage />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
