import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth, type AuthUser } from "../lib/auth";

export function LoginPage() {
  const { token, setSession } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("demo@jobradar.dev");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (token) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ token: string; user: AuthUser }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setSession(data.token, data.user);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Connexion" subtitle="Reprenez le contrôle du flux d'offres.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email" type="email" value={email} onChange={setEmail} />
        <Field label="Mot de passe" type="password" value={password} onChange={setPassword} />
        {error && (
          <p className="text-sm" style={{ color: "var(--brick)" }}>
            {error}
          </p>
        )}
        <button type="submit" disabled={loading} className="btn btn-amber w-full">
          {loading ? "Connexion…" : "Entrer"}
        </button>
      </form>
      <p className="mt-6 text-sm text-[var(--ink-soft)]">
        Pas de compte ?{" "}
        <Link to="/register" className="text-[var(--ink)] underline decoration-[var(--amber)] underline-offset-4">
          Créer un accès
        </Link>
      </p>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { token, setSession } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (token) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ token: string; user: AuthUser }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      setSession(data.token, data.user);
      navigate("/profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur d'inscription");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Nouvel accès" subtitle="Configurez votre tour de contrôle.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Nom" value={name} onChange={setName} />
        <Field label="Email" type="email" value={email} onChange={setEmail} />
        <Field label="Mot de passe" type="password" value={password} onChange={setPassword} />
        {error && (
          <p className="text-sm" style={{ color: "var(--brick)" }}>
            {error}
          </p>
        )}
        <button type="submit" disabled={loading} className="btn btn-amber w-full">
          {loading ? "Création…" : "Créer l'accès"}
        </button>
      </form>
      <p className="mt-6 text-sm text-[var(--ink-soft)]">
        Déjà inscrit ?{" "}
        <Link to="/login" className="text-[var(--ink)] underline decoration-[var(--amber)] underline-offset-4">
          Connexion
        </Link>
      </p>
    </AuthShell>
  );
}

function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="fade-in mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <p className="brand text-3xl tracking-tight">JobRadar</p>
      <p className="label mt-2">Tour de contrôle</p>
      <h1 className="mt-6 text-2xl">{title}</h1>
      <p className="mt-1 mb-8 text-[var(--ink-soft)]">{subtitle}</p>
      <div className="border-y border-[var(--ink)] py-6">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="label mb-1.5 block">{label}</span>
      <input
        type={type}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field"
      />
    </label>
  );
}
