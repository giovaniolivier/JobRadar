import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";
import { ApiError, api } from "../lib/api";
import { useAuth, type AuthUser } from "../lib/auth";
import { resolvePostAuthPath } from "../lib/home";
import { isValidEmail, passwordStrength } from "../lib/validation";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

const VALUE_PROP =
  "Centralisez vos offres, scorez-les par rapport à votre CV, et gardez le contrôle.";

export function LoginPage() {
  const { token, setSession, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [emailHint, setEmailHint] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);

  useEffect(() => {
    if (params.get("oauth") === "error") {
      setError("Connexion sociale impossible. Réessayez ou utilisez email / mot de passe.");
    }
    if (params.get("reset") === "ok") {
      setInfo("Mot de passe mis à jour. Vous pouvez vous connecter.");
    }
  }, [params]);

  if (authLoading) return null;
  if (token) return <Navigate to="/dashboard" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const data = await api<{
        requires2fa?: boolean;
        challengeId?: string;
        emailHint?: string;
        devCode?: string;
        user?: AuthUser;
      }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, remember }),
      });
      if (data.requires2fa && data.challengeId) {
        setChallengeId(data.challengeId);
        setEmailHint(data.emailHint ?? null);
        setDevCode(data.devCode ?? null);
        setOtpCode("");
        setInfo(`Un code a été envoyé à ${data.emailHint ?? "votre email"}.`);
        return;
      }
      if (data.user) {
        setSession(data.user);
        navigate(await resolvePostAuthPath());
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 400)) {
        setError("Identifiants incorrects. Vérifiez votre email et votre mot de passe.");
      } else {
        setError("Impossible de se connecter pour le moment. Réessayez.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function onVerifyOtp(e: FormEvent) {
    e.preventDefault();
    if (!challengeId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ user: AuthUser }>("/auth/verify-2fa", {
        method: "POST",
        body: JSON.stringify({ challengeId, code: otpCode.trim() }),
      });
      setSession(data.user);
      navigate(await resolvePostAuthPath());
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Vérification impossible. Réessayez.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function onResendOtp() {
    if (!challengeId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api<{
        challengeId: string;
        emailHint?: string;
        devCode?: string;
      }>("/auth/resend-2fa", {
        method: "POST",
        body: JSON.stringify({ challengeId }),
      });
      setChallengeId(data.challengeId);
      setEmailHint(data.emailHint ?? null);
      setDevCode(data.devCode ?? null);
      setOtpCode("");
      setInfo("Un nouveau code a été envoyé.");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Impossible de renvoyer le code.");
    } finally {
      setLoading(false);
    }
  }

  if (challengeId) {
    return (
      <AuthShell
        title="Vérification"
        subtitle={`Saisissez le code à 6 chiffres envoyé à ${emailHint ?? "votre email"}.`}
      >
        <form onSubmit={onVerifyOtp} className="space-y-4" noValidate>
          <Field
            label="Code de vérification"
            value={otpCode}
            onChange={(v) => setOtpCode(v.replace(/\D/g, "").slice(0, 6))}
            autoComplete="one-time-code"
            placeholder="000000"
          />
          {devCode && (
            <p className="text-xs text-[var(--ink-soft)]">
              Code dev : <span className="font-mono text-[var(--ink)]">{devCode}</span>
            </p>
          )}
          {error && (
            <p className="text-sm" style={{ color: "var(--brick)" }} role="alert">
              {error}
            </p>
          )}
          {info && (
            <p className="text-sm" style={{ color: "var(--match)" }}>
              {info}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || otpCode.length !== 6}
            className="btn btn-amber w-full"
          >
            {loading ? "Vérification…" : "Valider le code"}
          </button>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <button
              type="button"
              className="text-[var(--ink)] underline decoration-[var(--amber)] underline-offset-4"
              disabled={loading}
              onClick={() => void onResendOtp()}
            >
              Renvoyer le code
            </button>
            <button
              type="button"
              className="text-[var(--ink-soft)] underline underline-offset-4"
              disabled={loading}
              onClick={() => {
                setChallengeId(null);
                setOtpCode("");
                setDevCode(null);
                setInfo(null);
                setError(null);
              }}
            >
              Retour
            </button>
          </div>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Connexion" subtitle={VALUE_PROP}>
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          hint={email && !isValidEmail(email) ? "Format d'email invalide" : undefined}
        />
        <PasswordField
          label="Mot de passe"
          value={password}
          onChange={setPassword}
          show={showPassword}
          onToggle={() => setShowPassword((v) => !v)}
          autoComplete="current-password"
        />

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <label className="flex cursor-pointer items-center gap-2 text-[var(--ink-soft)]">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="accent-[var(--amber)]"
            />
            Se souvenir de moi
          </label>
          <Link
            to="/forgot-password"
            className="text-[var(--ink)] underline decoration-[var(--amber)] underline-offset-4"
          >
            Mot de passe oublié ?
          </Link>
        </div>

        {error && (
          <p className="text-sm" style={{ color: "var(--brick)" }} role="alert">
            {error}
          </p>
        )}
        {info && (
          <p className="text-sm" style={{ color: "var(--match)" }}>
            {info}
          </p>
        )}

        <button type="submit" disabled={loading || !email || !password} className="btn btn-amber w-full">
          {loading ? "Vérification…" : "Se connecter"}
        </button>
      </form>

      <SocialButtons onInfo={setInfo} onError={setError} />

      <p className="mt-4 text-sm text-[var(--ink-soft)]">
        Pas encore de compte ?{" "}
        <Link
          to="/register"
          className="text-[var(--ink)] underline decoration-[var(--amber)] underline-offset-4"
        >
          Créer un compte
        </Link>
      </p>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { token, setSession, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const strength = passwordStrength(password);
  const emailOk = !email || isValidEmail(email);
  const passwordOk = password.length >= 8;
  const canSubmit = Boolean(name.trim() && isValidEmail(email) && passwordOk && acceptTerms && !loading);

  if (authLoading) return null;
  if (token) return <Navigate to="/dashboard" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const data = await api<{ user: AuthUser }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), email, password, remember: true }),
      });
      setSession(data.user);
      navigate(await resolvePostAuthPath());
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("Un compte existe déjà avec cet email.");
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Impossible de créer le compte.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Créer mon compte"
      subtitle="Email, mot de passe — puis votre CV. Gratuit."
      compact
    >
      <form onSubmit={onSubmit} className="space-y-2.5" noValidate>
        <Field
          label="Prénom"
          value={name}
          onChange={setName}
          autoComplete="given-name"
          placeholder="Alex"
          dense
        />
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          hint={!emailOk ? "Format d'email invalide" : undefined}
          dense
        />
        <PasswordField
          label="Mot de passe"
          value={password}
          onChange={setPassword}
          show={showPassword}
          onToggle={() => setShowPassword((v) => !v)}
          autoComplete="new-password"
          dense
        />
        {password.length > 0 && (
          <div>
            <div className="flex gap-1">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="h-1 flex-1"
                  style={{
                    background:
                      i < strength.score
                        ? strength.score <= 1
                          ? "var(--brick)"
                          : strength.score === 2
                            ? "var(--amber)"
                            : "var(--match)"
                        : "var(--hairline)",
                  }}
                />
              ))}
            </div>
            <p className="mono mt-1 text-[0.65rem] text-[var(--ink-soft)]">
              Force : {strength.label}
              {!passwordOk ? " — min. 8 car." : ""}
            </p>
          </div>
        )}

        <label className="flex cursor-pointer items-start gap-2 text-sm text-[var(--ink-soft)]">
          <input
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            className="mt-0.5 accent-[var(--amber)]"
            required
          />
          <span>
            J’accepte les{" "}
            <Link to="/legal/cgu" className="text-[var(--ink)] underline decoration-[var(--amber)] underline-offset-4">
              CGU
            </Link>{" "}
            et la{" "}
            <Link
              to="/legal/privacy"
              className="text-[var(--ink)] underline decoration-[var(--amber)] underline-offset-4"
            >
              confidentialité
            </Link>
            . CV et offres restent privés.
          </span>
        </label>

        {error && (
          <p className="text-sm" style={{ color: "var(--brick)" }} role="alert">
            {error}{" "}
            {error.includes("existe déjà") && (
              <Link to="/login" className="underline decoration-[var(--amber)] underline-offset-4">
                Se connecter
              </Link>
            )}
          </p>
        )}
        {info && (
          <p className="text-sm" style={{ color: "var(--match)" }}>
            {info}
          </p>
        )}

        <button type="submit" disabled={!canSubmit} className="btn btn-amber w-full !py-2">
          {loading ? "Création…" : "Créer mon compte"}
        </button>
      </form>

      <SocialButtons onInfo={setInfo} onError={setError} />

      <p className="mt-3 text-sm text-[var(--ink-soft)]">
        Déjà un compte ?{" "}
        <Link to="/login" className="text-[var(--ink)] underline decoration-[var(--amber)] underline-offset-4">
          Se connecter
        </Link>
      </p>
    </AuthShell>
  );
}

function AuthShell({
  title,
  subtitle,
  children,
  compact = false,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 ${
        compact ? "py-3 sm:py-4" : "py-6 sm:py-8"
      }`}
    >
      <BrandLogo to="/" size="xl" />
      {!compact && <p className="label mt-2">Tour de contrôle · candidatures</p>}
      <h1 className={`text-xl sm:text-2xl ${compact ? "mt-2" : "mt-3"}`}>{title}</h1>
      <p
        className={`text-sm leading-snug text-[var(--ink-soft)] ${
          compact ? "mt-1 mb-3" : "mt-1.5 mb-4"
        }`}
      >
        {subtitle}
      </p>
      <div className={`border-y border-[var(--ink)] ${compact ? "py-3" : "py-4"}`}>{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  placeholder,
  hint,
  dense = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  hint?: string;
  dense?: boolean;
}) {
  return (
    <label className="block">
      <span className={`label block ${dense ? "mb-1" : "mb-1.5"}`}>{label}</span>
      <input
        type={type}
        required
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className={`field ${dense ? "!py-2" : ""}`}
        aria-invalid={hint ? true : undefined}
      />
      {hint && (
        <span className="mt-1 block text-xs" style={{ color: "var(--brick)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
  dense = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete?: string;
  dense?: boolean;
}) {
  return (
    <label className="block">
      <span className={`label block ${dense ? "mb-1" : "mb-1.5"}`}>{label}</span>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          required
          value={value}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          className={`field pr-20 ${dense ? "!py-2" : ""}`}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute top-1/2 right-2 -translate-y-1/2 px-2 py-1 text-xs text-[var(--ink-soft)] hover:text-[var(--ink)]"
        >
          {show ? "Masquer" : "Afficher"}
        </button>
      </div>
    </label>
  );
}

function SocialButtons({
  onInfo,
  onError,
}: {
  onInfo: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  async function start(provider: "google" | "linkedin") {
    onInfo("");
    onError("");
    try {
      const res = await fetch(`${API_URL}/auth/providers`, { credentials: "include" });
      const data = (await res.json()) as { google?: boolean; linkedin?: boolean };
      if (provider === "google" && !data.google) {
        onError("Google OAuth non configuré (GOOGLE_CLIENT_ID / SECRET).");
        return;
      }
      if (provider === "linkedin" && !data.linkedin) {
        onError("LinkedIn OAuth non configuré (LINKEDIN_CLIENT_ID / SECRET).");
        return;
      }
      window.location.href = `${API_URL}/auth/${provider}`;
    } catch {
      onError("Impossible de démarrer la connexion sociale.");
    }
  }

  return (
    <div className="mt-2.5 space-y-1.5">
      <p className="label text-center">Ou continuer avec</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="btn btn-ghost w-full !py-1.5 !text-xs gap-2"
          onClick={() => void start("google")}
        >
          <GoogleIcon />
          Google
        </button>
        <button
          type="button"
          className="btn btn-ghost w-full !py-1.5 !text-xs gap-2"
          onClick={() => void start("linkedin")}
        >
          <LinkedInIcon />
          LinkedIn
        </button>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#0A66C2"
        d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z"
      />
    </svg>
  );
}
