import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";
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
      <BrandLogo to="/" size="lg" />
      <p className="label mt-3">Récupération</p>
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
      <BrandLogo to="/" size="lg" />
      <p className="label mt-3">Récupération</p>
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
      <p className="text-xs text-[var(--ink-soft)]">Dernière mise à jour : 24 septembre 2026</p>

      <h2 className="text-base font-semibold text-[var(--ink)]">1. Objet</h2>
      <p>
        JobRadar est un service web d’aide à la veille et au tri d’offres d’emploi : import de CV,
        analyse de correspondance, génération de brouillons de lettres et suivi de candidatures.
        L’éditeur du service est joignable à{" "}
        <a className="underline decoration-[var(--amber)]" href="mailto:contact@jobradar.dev">
          contact@jobradar.dev
        </a>
        .
      </p>

      <h2 className="text-base font-semibold text-[var(--ink)]">2. Compte et accès</h2>
      <p>
        L’accès aux fonctionnalités principales nécessite la création d’un compte (email et mot de
        passe, ou fournisseur OAuth le cas échéant). Vous vous engagez à fournir des informations
        exactes, à préserver la confidentialité de vos identifiants et à ne pas usurper l’identité
        d’autrui. Un compte peut être suspendu en cas d’usage abusif (spam, contournement de
        sécurité, atteinte aux droits de tiers).
      </p>

      <h2 className="text-base font-semibold text-[var(--ink)]">3. Usage autorisé</h2>
      <p>
        Le service est destiné à un usage personnel de recherche d’emploi. Il est interdit
        d’automatiser massivement l’accès à l’API hors des outils fournis, de republier le contenu
        d’autres utilisateurs, ou d’utiliser JobRadar pour harceler des employeurs ou collecter des
        données à des fins illicites.
      </p>

      <h2 className="text-base font-semibold text-[var(--ink)]">4. Contenus et IA</h2>
      <p>
        Les scores, red flags, résumés et lettres générés sont des aides à la décision. Ils ne
        constituent ni un conseil juridique, ni une garantie d’embauche. Vous restez seul·e
        responsable des candidatures et documents transmis aux employeurs. Les fonctionnalités
        connectées à des API tierces (ex. Anthropic, sources d’offres) dépendent de leur
        disponibilité et de leurs conditions.
      </p>

      <h2 className="text-base font-semibold text-[var(--ink)]">5. Disponibilité</h2>
      <p>
        Nous nous efforçons d’assurer un service stable, sans engagement de résultat ni de
        disponibilité continue. Des maintenances ou interruptions peuvent survenir. Les
        fonctionnalités peuvent évoluer ; nous informerons les utilisateurs des changements
        majeurs lorsque c’est raisonnablement possible.
      </p>

      <h2 className="text-base font-semibold text-[var(--ink)]">6. Responsabilité</h2>
      <p>
        Dans les limites autorisées par la loi, JobRadar ne saurait être tenu responsable des
        dommages indirects (perte d’opportunité, préjudice moral, etc.) liés à l’usage du service
        ou à une interruption. La responsabilité totale, si elle était retenue, serait limitée aux
        montants éventuellement payés pour le service au cours des 12 derniers mois (gratuit à ce
        jour : responsabilité limitée aux dommages prévisibles directs).
      </p>

      <h2 className="text-base font-semibold text-[var(--ink)]">7. Résiliation</h2>
      <p>
        Vous pouvez supprimer votre compte à tout moment depuis Profil → Compte. Nous pouvons
        clôturer un compte en cas de manquement grave aux présentes CGU, après notification lorsque
        cela est possible.
      </p>

      <h2 className="text-base font-semibold text-[var(--ink)]">8. Droit applicable</h2>
      <p>
        Les présentes CGU sont régies par le droit français. En cas de litige, et à défaut d’accord
        amiable, les tribunaux français compétents seront saisis.
      </p>
    </LegalLayout>
  );
}

export function LegalPrivacyPage() {
  return (
    <LegalLayout title="Politique de confidentialité">
      <p className="text-xs text-[var(--ink-soft)]">Dernière mise à jour : 24 septembre 2026</p>

      <h2 className="text-base font-semibold text-[var(--ink)]">1. Responsable du traitement</h2>
      <p>
        Le responsable du traitement des données est l’éditeur de JobRadar, contact :{" "}
        <a className="underline decoration-[var(--amber)]" href="mailto:contact@jobradar.dev">
          contact@jobradar.dev
        </a>
        . Hébergement : infrastructure cloud du déploiement (voir mentions légales / fiche
        d’hébergeur communiquée sur demande).
      </p>

      <h2 className="text-base font-semibold text-[var(--ink)]">2. Données collectées</h2>
      <p>
        Compte : email, nom, hash du mot de passe (ou identifiants OAuth). Profil : texte de CV,
        compétences, préférences (lieux, salaire, secteurs). Offres : annonces importées ou
        synchronisées qui vous appartiennent. Analyses, candidatures, lettres, préférences de
        notification et journaux techniques nécessaires à la sécurité (jetons, OTP, etc.).
      </p>

      <h2 className="text-base font-semibold text-[var(--ink)]">3. Finalités et bases légales</h2>
      <p>
        Exécution du contrat / intérêt légitime : fournir le service (analyse, pipeline, emails
        transactionnels d’auth). Consentement / intérêt légitime : emails d’alerte selon vos
        préférences (désactivables dans Paramètres). Obligation légale : conservation minimale
        pour la sécurité et les litiges éventuels.
      </p>

      <h2 className="text-base font-semibold text-[var(--ink)]">4. Destinataires</h2>
      <p>
        Vos données ne sont pas vendues ni partagées avec des recruteurs. Elles restent dans votre
        compte. Des sous-traitants techniques (hébergeur, SMTP, fournisseur d’IA) traitent des
        extraits strictement nécessaires : par exemple, des passages de CV et d’annonce envoyés à
        Anthropic uniquement pour produire une analyse ou une lettre demandée.
      </p>

      <h2 className="text-base font-semibold text-[var(--ink)]">5. Durées de conservation</h2>
      <p>
        Les données de compte et de profil sont conservées tant que le compte est actif. Après
        suppression du compte, les données associées sont effacées ou anonymisées sous 30 jours,
        hors obligations légales ou sauvegardes techniques à durée limitée. Les jetons de
        réinitialisation / OTP expirent automatiquement (ordre de l’heure).
      </p>

      <h2 className="text-base font-semibold text-[var(--ink)]">6. Vos droits (RGPD)</h2>
      <p>
        Vous disposez d’un droit d’accès, de rectification, d’effacement, de limitation, de
        portabilité et d’opposition. Dans l’application : export des données (Paramètres → Données)
        et suppression du compte (Profil → Compte). Vous pouvez aussi écrire à{" "}
        <a className="underline decoration-[var(--amber)]" href="mailto:contact@jobradar.dev">
          contact@jobradar.dev
        </a>
        . Réclamation possible auprès de la CNIL (
        <a
          className="underline decoration-[var(--amber)]"
          href="https://www.cnil.fr"
          target="_blank"
          rel="noreferrer"
        >
          cnil.fr
        </a>
        ).
      </p>

      <h2 className="text-base font-semibold text-[var(--ink)]">7. Cookies et sécurité</h2>
      <p>
        Des cookies / jetons HTTP-only sont utilisés pour la session et la protection CSRF. Les
        mots de passe sont stockés hachés. Les communications doivent passer en HTTPS en
        production. Aucun tracking publicitaire tiers n’est intégré dans le produit de base.
      </p>
    </LegalLayout>
  );
}

export function LegalMentionsPage() {
  return (
    <LegalLayout title="Mentions légales">
      <p className="text-xs text-[var(--ink-soft)]">Dernière mise à jour : 24 septembre 2026</p>

      <h2 className="text-base font-semibold text-[var(--ink)]">Éditeur</h2>
      <p>
        JobRadar — service d’aide à la recherche d’emploi.
        <br />
        Contact :{" "}
        <a className="underline decoration-[var(--amber)]" href="mailto:contact@jobradar.dev">
          contact@jobradar.dev
        </a>
      </p>
      <p className="text-sm text-[var(--ink-soft)]">
        Si le service est édité par une société / auto-entrepreneur, renseignez ici la raison
        sociale, le siège social, le SIREN et le nom du directeur de la publication avant une mise
        en production publique.
      </p>

      <h2 className="text-base font-semibold text-[var(--ink)]">Hébergement</h2>
      <p>
        L’application et la base de données sont hébergées auprès du prestataire choisi pour le
        déploiement (ex. Render, Fly.io, Railway, VPS). Les coordonnées complètes de l’hébergeur
        seront affichées ici dès le choix définitif d’infrastructure.
      </p>

      <h2 className="text-base font-semibold text-[var(--ink)]">Propriété intellectuelle</h2>
      <p>
        L’interface, la marque JobRadar et le code du service sont protégés. Les CV et offres que
        vous importez restent votre propriété / celle de leurs ayants droit ; vous nous
        concédez uniquement une licence d’usage technique pour fournir le service.
      </p>
    </LegalLayout>
  );
}

function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="fade-in mx-auto min-h-screen max-w-2xl px-4 py-12">
      <BrandLogo to="/" size="md" />
      <p className="label mt-3">Informations légales</p>
      <h1 className="mt-6 text-3xl">{title}</h1>
      <div className="mt-8 space-y-4 border-t border-[var(--ink)] pt-6 text-sm leading-relaxed text-[var(--ink)]/90">
        {children}
      </div>
      <nav className="mt-10 flex flex-wrap gap-4 text-sm">
        <Link to="/legal/cgu" className="underline decoration-[var(--amber)] underline-offset-4">
          CGU
        </Link>
        <Link to="/legal/privacy" className="underline decoration-[var(--amber)] underline-offset-4">
          Confidentialité
        </Link>
        <Link
          to="/legal/mentions"
          className="underline decoration-[var(--amber)] underline-offset-4"
        >
          Mentions légales
        </Link>
        <Link to="/" className="underline decoration-[var(--amber)] underline-offset-4">
          ← Accueil
        </Link>
      </nav>
    </div>
  );
}
