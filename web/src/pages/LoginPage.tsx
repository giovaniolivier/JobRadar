import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";
import { ApiError, api } from "../lib/api";
import { useAuth, type AuthUser } from "../lib/auth";
import { resolvePostAuthPath } from "../lib/home";
import { isValidEmail, passwordStrength } from "../lib/validation";
import { useLocale } from "../lib/i18n";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export function LoginPage() {
  const { t } = useLocale();
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
      setError(t("auth.oauthError"));
    }
    if (params.get("reset") === "ok") {
      setInfo(t("auth.resetOk"));
    }
  }, [params, t]);

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
        setInfo(
          t("auth.otpSent", { email: data.emailHint ?? t("auth.yourEmail") })
        );
        return;
      }
      if (data.user) {
        setSession(data.user);
        navigate(await resolvePostAuthPath());
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 400)) {
        setError(t("auth.badCredentials"));
      } else {
        setError(t("auth.loginFailed"));
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
        setError(t("auth.verifyFailed"));
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
      setInfo(t("auth.otpResent"));
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError(t("auth.resendFailed"));
    } finally {
      setLoading(false);
    }
  }

  if (challengeId) {
    return (
      <AuthShell
        title={t("auth.verifyTitle")}
        subtitle={t("auth.verifySubtitle", { email: emailHint ?? t("auth.yourEmail") })}
      >
        <form onSubmit={onVerifyOtp} className="space-y-4" noValidate>
          <Field
            label={t("auth.otpLabel")}
            value={otpCode}
            onChange={(v) => setOtpCode(v.replace(/\D/g, "").slice(0, 6))}
            autoComplete="one-time-code"
            placeholder="000000"
          />
          {devCode && (
            <p className="text-xs text-[var(--ink-soft)]">
              {t("auth.devCode")}{" "}
              <span className="font-mono text-[var(--ink)]">{devCode}</span>
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
            {loading ? t("auth.verifying") : t("auth.verifySubmit")}
          </button>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <button
              type="button"
              className="text-[var(--ink)] underline decoration-[var(--amber)] underline-offset-4"
              disabled={loading}
              onClick={() => void onResendOtp()}
            >
              {t("auth.resendCode")}
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
              {t("auth.back")}
            </button>
          </div>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("auth.loginTitle")} subtitle={t("auth.valueProp")}>
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <Field
          label={t("auth.email")}
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          hint={email && !isValidEmail(email) ? t("auth.invalidEmail") : undefined}
        />
        <PasswordField
          label={t("auth.password")}
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
            {t("auth.remember")}
          </label>
          <Link
            to="/forgot-password"
            className="text-[var(--ink)] underline decoration-[var(--amber)] underline-offset-4"
          >
            {t("auth.forgot")}
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
          {loading ? t("auth.loggingIn") : t("auth.login")}
        </button>
      </form>

      <SocialButtons onInfo={setInfo} onError={setError} />

      <p className="mt-4 text-sm text-[var(--ink-soft)]">
        {t("auth.noAccount")}{" "}
        <Link
          to="/register"
          className="text-[var(--ink)] underline decoration-[var(--amber)] underline-offset-4"
        >
          {t("auth.createAccount")}
        </Link>
      </p>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { t } = useLocale();
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
        setError(t("auth.emailTaken"));
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t("auth.registerFailed"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title={t("auth.registerTitle")}
      subtitle={t("auth.registerSubtitle")}
      compact
    >
      <form onSubmit={onSubmit} className="space-y-2.5" noValidate>
        <Field
          label={t("auth.firstName")}
          value={name}
          onChange={setName}
          autoComplete="given-name"
          placeholder={t("auth.firstNamePlaceholder")}
          dense
        />
        <Field
          label={t("auth.email")}
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          hint={!emailOk ? t("auth.invalidEmail") : undefined}
          dense
        />
        <PasswordField
          label={t("auth.password")}
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
              {t("auth.passwordStrength", { label: strength.label })}
              {!passwordOk ? t("auth.passwordMin") : ""}
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
            {t("auth.acceptTerms")}{" "}
            <Link to="/legal/cgu" className="text-[var(--ink)] underline decoration-[var(--amber)] underline-offset-4">
              {t("legal.cgu")}
            </Link>{" "}
            {t("auth.andThe")}{" "}
            <Link
              to="/legal/privacy"
              className="text-[var(--ink)] underline decoration-[var(--amber)] underline-offset-4"
            >
              {t("legal.privacy")}
            </Link>
            {t("auth.termsPrivacySuffix")}
          </span>
        </label>

        {error && (
          <p className="text-sm" style={{ color: "var(--brick)" }} role="alert">
            {error}{" "}
            {(error === t("auth.emailTaken") || error.includes("existe déjà") || error.includes("already exists")) && (
              <Link to="/login" className="underline decoration-[var(--amber)] underline-offset-4">
                {t("auth.login")}
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
          {loading ? t("auth.creating") : t("auth.createSubmit")}
        </button>
      </form>

      <SocialButtons onInfo={setInfo} onError={setError} />

      <p className="mt-3 text-sm text-[var(--ink-soft)]">
        {t("auth.hasAccount")}{" "}
        <Link to="/login" className="text-[var(--ink)] underline decoration-[var(--amber)] underline-offset-4">
          {t("auth.login")}
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
  const { t } = useLocale();
  return (
    <div
      className={`mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 ${
        compact ? "py-3 sm:py-4" : "py-6 sm:py-8"
      }`}
    >
      <BrandLogo to="/" size="xl" />
      {!compact && <p className="label mt-2">{t("auth.shellLabel")}</p>}
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
  const { t } = useLocale();
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
          {show ? t("common.hide") : t("common.show")}
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
  const { t } = useLocale();
  async function start(provider: "google" | "linkedin") {
    onInfo("");
    onError("");
    try {
      const res = await fetch(`${API_URL}/auth/providers`, { credentials: "include" });
      const data = (await res.json()) as { google?: boolean; linkedin?: boolean };
      if (provider === "google" && !data.google) {
        onError(t("auth.googleNotConfigured"));
        return;
      }
      if (provider === "linkedin" && !data.linkedin) {
        onError(t("auth.linkedinNotConfigured"));
        return;
      }
      window.location.href = `${API_URL}/auth/${provider}`;
    } catch {
      onError(t("auth.socialStartFailed"));
    }
  }

  return (
    <div className="mt-2.5 space-y-1.5">
      <p className="label text-center">{t("auth.orContinue")}</p>
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
