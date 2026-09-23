import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, api } from "../lib/api";
import { isValidEmail, passwordStrength } from "../lib/validation";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setError("Format d'email invalide");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    setDevLink(null);
    try {
      const data = await api<{ message: string; devResetUrl?: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMessage(data.message);
      setSent(true);
      if (data.devResetUrl) setDevLink(data.devResetUrl);
    } catch (err) {
      setSent(false);
      if (err instanceof ApiError) {
        if (err.status === 404) {
          setError("Aucun compte n'est associé à cet email.");
        } else if (err.status === 400) {
          setError(err.message);
        } else {
          setError(err.message || "Impossible d'envoyer l'email pour le moment.");
        }
      } else {
        setError("Impossible d'envoyer l'email pour le moment.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fade-in mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <Link to="/login" className="brand text-3xl tracking-tight">
        JobRadar
      </Link>
      <p className="label mt-2">Récupération</p>
      <h1 className="mt-6 text-2xl">Mot de passe oublié</h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">
        Indiquez l’email de votre compte. Nous vous enverrons un lien pour choisir un nouveau mot de
        passe (valide 1 heure).
      </p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4 border-y border-[var(--ink)] py-6">
        <label className="block">
          <span className="label mb-1.5 block">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            className="field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={sent && !devLink}
          />
        </label>
        {error && (
          <p className="text-sm" style={{ color: "var(--brick)" }} role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="text-sm" style={{ color: "var(--match)" }}>
            {message}
          </p>
        )}
        {devLink && (
          <div className="rounded border border-[var(--ink)]/20 bg-[var(--ink)]/5 p-3 text-xs text-[var(--ink-soft)]">
            <p className="mb-2">
              L’email n’a pas pu être envoyé (SMTP non configuré). Utilisez ce lien de secours :
            </p>
            <a href={devLink} className="break-all underline decoration-[var(--amber)]">
              {devLink}
            </a>
          </div>
        )}
        {!sent || error || devLink ? (
          <button type="submit" disabled={loading || !email} className="btn btn-amber w-full">
            {loading ? "Envoi…" : sent ? "Renvoyer l’email" : "Envoyer le lien par email"}
          </button>
        ) : (
          <p className="text-sm text-[var(--ink-soft)]">
            Pensez à vérifier vos courriers indésirables.{" "}
            <button
              type="button"
              className="underline decoration-[var(--amber)]"
              onClick={() => {
                setSent(false);
                setMessage(null);
              }}
            >
              Renvoyer
            </button>
          </p>
        )}
      </form>
      <Link to="/login" className="mt-6 text-sm underline decoration-[var(--amber)] underline-offset-4">
        Retour à la connexion
      </Link>
    </div>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const strength = passwordStrength(password);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      navigate("/login?reset=ok");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Lien invalide ou expiré");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="fade-in mx-auto max-w-md px-4 py-12">
        <p style={{ color: "var(--brick)" }}>Lien invalide : token manquant.</p>
        <Link to="/forgot-password" className="mt-4 inline-block underline decoration-[var(--amber)]">
          Demander un nouveau lien
        </Link>
      </div>
    );
  }

  return (
    <div className="fade-in mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <Link to="/login" className="brand text-3xl tracking-tight">
        JobRadar
      </Link>
      <p className="label mt-2">Récupération</p>
      <h1 className="mt-6 text-2xl">Nouveau mot de passe</h1>
      <p className="mt-3 text-sm text-[var(--ink-soft)]">
        Choisissez un mot de passe d’au moins 8 caractères.
      </p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4 border-y border-[var(--ink)] py-6">
        <label className="block">
          <span className="label mb-1.5 block">Mot de passe</span>
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              className="field pr-20"
              value={password}
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
            <button
              type="button"
              className="absolute top-1/2 right-2 -translate-y-1/2 text-xs text-[var(--ink-soft)]"
              onClick={() => setShow((v) => !v)}
            >
              {show ? "Masquer" : "Afficher"}
            </button>
          </div>
        </label>
        <label className="block">
          <span className="label mb-1.5 block">Confirmer</span>
          <input
            type={show ? "text" : "password"}
            className="field"
            value={confirm}
            autoComplete="new-password"
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
          />
        </label>
        {password.length > 0 && (
          <p className="mono text-[0.7rem] text-[var(--ink-soft)]">Force : {strength.label}</p>
        )}
        {error && (
          <p className="text-sm" style={{ color: "var(--brick)" }} role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading || password.length < 8 || password !== confirm}
          className="btn btn-amber w-full"
        >
          {loading ? "Enregistrement…" : "Mettre à jour le mot de passe"}
        </button>
      </form>
      <Link to="/login" className="mt-6 text-sm underline decoration-[var(--amber)] underline-offset-4">
        Retour à la connexion
      </Link>
    </div>
  );
}

export function LegalCguPage() {
  return (
    <LegalLayout title="Conditions générales d’utilisation">
      <p>
        JobRadar est un outil personnel de veille et de tri d’offres d’emploi. En créant un compte,
        vous vous engagez à fournir des informations exactes et à utiliser le service de manière
        loyale.
      </p>
      <p>
        Les analyses IA sont fournies à titre d’aide à la décision et ne constituent pas un conseil
        professionnel. Vous restez responsable de vos candidatures et des documents que vous
        envoyez aux employeurs.
      </p>
      <p>
        Nous pouvons faire évoluer le service. Les fonctionnalités connectées à des API tierces
        (ex. Anthropic, sources d’offres) dépendent de leur disponibilité.
      </p>
    </LegalLayout>
  );
}

export function LegalPrivacyPage() {
  return (
    <LegalLayout title="Politique de confidentialité">
      <p>
        Nous collectons les données nécessaires au fonctionnement de JobRadar : email, profil,
        texte de CV, offres importées, analyses et lettres générées.
      </p>
      <p>
        Votre CV et le contenu des offres analysées ne sont pas vendus ni partagés avec des
        recruteurs tiers. Ils servent uniquement à personnaliser les scores, red flags et brouillons
        de lettres dans votre compte.
      </p>
      <p>
        Lorsque l’analyse IA est activée, des extraits de CV et d’offres peuvent être transmis au
        fournisseur d’IA configuré (ex. Anthropic) uniquement pour produire le résultat demandé.
      </p>
      <p>
        Vous pouvez demander la suppression de votre compte et des données associées en nous
        contactant.
      </p>
    </LegalLayout>
  );
}

function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="fade-in mx-auto min-h-screen max-w-2xl px-4 py-12">
      <Link to="/login" className="brand text-2xl tracking-tight">
        JobRadar
      </Link>
      <p className="label mt-2">Informations légales</p>
      <h1 className="mt-6 text-3xl">{title}</h1>
      <div className="mt-8 space-y-4 border-t border-[var(--ink)] pt-6 text-sm leading-relaxed text-[var(--ink)]/90">
        {children}
      </div>
      <Link
        to="/register"
        className="mt-10 inline-block text-sm underline decoration-[var(--amber)] underline-offset-4"
      >
        ← Retour à l’inscription
      </Link>
    </div>
  );
}
