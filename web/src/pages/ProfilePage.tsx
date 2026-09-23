import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { TagInput } from "../components/TagInput";
import { api, type ProfileData, type ProfileResponse } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  dedupeNormalize,
  formatSalaryDisplay,
  isWorkModeLocationTag,
  parseSalaryDigits,
  workModeFromTag,
} from "../lib/skills";
import { passwordStrength } from "../lib/validation";

type WorkMode = "remote" | "hybrid" | "onsite";

const WORK_MODES: { id: WorkMode; label: string }[] = [
  { id: "remote", label: "Remote" },
  { id: "hybrid", label: "Hybride" },
  { id: "onsite", label: "Sur site" },
];

const SENIORITIES = [
  { id: "junior", label: "Junior" },
  { id: "confirme", label: "Confirmé" },
  { id: "senior", label: "Senior" },
  { id: "lead", label: "Lead" },
] as const;

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(+d)) return null;
    return d.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

function SalaryField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (digits: string) => void;
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  const display = focused ? value : formatSalaryDisplay(value);

  return (
    <label className="block">
      <span className="label mb-1.5 block">{label}</span>
      <input
        className="field mono"
        inputMode="numeric"
        autoComplete="off"
        value={display}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(parseSalaryDigits(e.target.value))}
      />
    </label>
  );
}

export function ProfilePage() {
  const { token, setSession, logout, refreshSession } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const onboarding = params.get("onboarding") === "1";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [prefsSaved, setPrefsSaved] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [hasPassword, setHasPassword] = useState(true);
  const [profile, setProfile] = useState<ProfileData | null>(null);

  const [skills, setSkills] = useState<string[]>([]);
  const [softSkills, setSoftSkills] = useState<string[]>([]);
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [experienceYears, setExperienceYears] = useState("");
  const [preferredLocations, setPreferredLocations] = useState<string[]>([]);
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [workModes, setWorkModes] = useState<WorkMode[]>([]);
  const [targetSeniority, setTargetSeniority] = useState<string>("");
  const [preferredSectors, setPreferredSectors] = useState<string[]>([]);
  const [avoidedSectors, setAvoidedSectors] = useState<string[]>([]);

  const [cvPreview, setCvPreview] = useState(false);
  const [replacingCv, setReplacingCv] = useState(false);
  const [cvPaste, setCvPaste] = useState("");
  const [cvBusy, setCvBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [accountBusy, setAccountBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [dangerConfirm, setDangerConfirm] = useState("");
  const [dangerPassword, setDangerPassword] = useState("");
  const [dangerBusy, setDangerBusy] = useState(false);

  const prefsTimer = useRef<number | null>(null);
  const prefsReady = useRef(false);
  const accountTimer = useRef<number | null>(null);
  const accountReady = useRef(false);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4000);
  }

  function applyProfile(data: ProfileResponse) {
    setName(data.name);
    setEmail(data.email);
    setHasPassword(data.hasPassword);
    setProfile(data.profile);
    const p = data.profile;
    setSkills(dedupeNormalize(p?.skills ?? []));
    setSoftSkills(dedupeNormalize(p?.softSkills ?? []));
    setTargetRoles(dedupeNormalize(p?.targetRoles ?? []));
    setExperienceYears(p?.experienceYears != null ? String(p.experienceYears) : "");
    const geoLocs = (p?.preferredLocations ?? []).filter((l) => !isWorkModeLocationTag(l));
    const modeFromLocs = (p?.preferredLocations ?? [])
      .map(workModeFromTag)
      .filter((m): m is WorkMode => m != null);
    setPreferredLocations(dedupeNormalize(geoLocs));
    setSalaryMin(p?.salaryMin != null ? String(p.salaryMin) : "");
    setSalaryMax(p?.salaryMax != null ? String(p.salaryMax) : "");
    const modes = new Set<WorkMode>([
      ...(p?.workModes ?? []).filter((m): m is WorkMode =>
        ["remote", "hybrid", "onsite"].includes(m)
      ),
      ...modeFromLocs,
    ]);
    setWorkModes([...modes]);
    setTargetSeniority(p?.targetSeniority ?? "");
    setPreferredSectors(dedupeNormalize(p?.preferredSectors ?? []));
    setAvoidedSectors(dedupeNormalize(p?.avoidedSectors ?? []));
  }

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await api<ProfileResponse>("/profile");
        if (cancelled) return;
        applyProfile(data);
        prefsReady.current = false;
        accountReady.current = false;
        window.setTimeout(() => {
          prefsReady.current = true;
          accountReady.current = true;
        }, 0);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erreur");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function savePrefs() {
    if (!prefsReady.current) return;
    setError(null);
    try {
      const data = await api<ProfileResponse>("/profile", {
        method: "PUT",
        body: JSON.stringify({
          skills,
          softSkills,
          targetRoles,
          experienceYears: experienceYears === "" ? null : Number(experienceYears),
          preferredLocations,
          salaryMin: salaryMin === "" ? null : Number(salaryMin),
          salaryMax: salaryMax === "" ? null : Number(salaryMax),
          workModes,
          targetSeniority: targetSeniority || null,
          preferredSectors,
          avoidedSectors,
        }),
      });
      setProfile(data.profile);
      setPrefsSaved("Préférences enregistrées");
      window.setTimeout(() => setPrefsSaved(null), 2500);
      if (onboarding && data.profile?.hasCv) {
        // stay until user finishes
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible");
    }
  }

  useEffect(() => {
    if (!prefsReady.current) return;
    if (prefsTimer.current) window.clearTimeout(prefsTimer.current);
    prefsTimer.current = window.setTimeout(() => {
      void savePrefs();
    }, 900);
    return () => {
      if (prefsTimer.current) window.clearTimeout(prefsTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    skills,
    softSkills,
    targetRoles,
    experienceYears,
    preferredLocations,
    salaryMin,
    salaryMax,
    workModes,
    targetSeniority,
    preferredSectors,
    avoidedSectors,
  ]);

  async function saveAccountIdentity() {
    if (!accountReady.current) return;
    setError(null);
    setAccountBusy(true);
    try {
      const data = await api<ProfileResponse>("/profile", {
        method: "PUT",
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      setSession({ id: data.id, email: data.email, name: data.name });
      showToast("Compte mis à jour");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mise à jour impossible");
    } finally {
      setAccountBusy(false);
    }
  }

  useEffect(() => {
    if (!accountReady.current) return;
    if (accountTimer.current) window.clearTimeout(accountTimer.current);
    accountTimer.current = window.setTimeout(() => {
      void saveAccountIdentity();
    }, 1000);
    return () => {
      if (accountTimer.current) window.clearTimeout(accountTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, email]);

  async function uploadCvText(text: string, fileName: string) {
    setCvBusy(true);
    setError(null);
    try {
      const res = await api<{ ok: boolean; message: string; profile: ProfileData }>(
        "/auth/upload-cv",
        {
          method: "POST",
          body: JSON.stringify({ cvText: text, cvFileName: fileName }),
        }
      );
      setProfile((prev) => ({ ...(prev ?? ({} as ProfileData)), ...res.profile, hasCv: true }));
      setSkills(res.profile.skills);
      setSoftSkills(res.profile.softSkills);
      setReplacingCv(false);
      setCvPaste("");
      showToast(res.message || "CV mis à jour — les nouvelles analyses utiliseront cette version");
      if (onboarding) {
        // keep on page so user can review skills
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import impossible");
    } finally {
      setCvBusy(false);
    }
  }

  async function onFileSelected(file: File | null) {
    if (!file) return;
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      setError("PDF non supporté pour l'instant — utilisez un .txt ou collez le texte");
      return;
    }
    const text = (await file.text()).trim();
    if (text.length < 40) {
      setError("Le fichier semble trop court pour être un CV");
      return;
    }
    await uploadCvText(text, file.name);
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError("Le nouveau mot de passe doit faire au moins 8 caractères");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("La confirmation ne correspond pas");
      return;
    }
    setAccountBusy(true);
    setError(null);
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showToast("Mot de passe mis à jour");
      await refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Changement impossible");
    } finally {
      setAccountBusy(false);
    }
  }

  async function onDeleteAccount(e: FormEvent) {
    e.preventDefault();
    if (dangerConfirm !== "SUPPRIMER") {
      setError('Tapez SUPPRIMER pour confirmer');
      return;
    }
    setDangerBusy(true);
    setError(null);
    try {
      await api("/profile", {
        method: "DELETE",
        body: JSON.stringify({
          confirm: "SUPPRIMER",
          ...(hasPassword ? { password: dangerPassword } : {}),
        }),
      });
      await logout();
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suppression impossible");
      setDangerBusy(false);
    }
  }

  function toggleWorkMode(mode: WorkMode) {
    setWorkModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]
    );
  }

  const hasCv = Boolean(profile?.cvText?.trim() || profile?.hasCv);
  const importDate =
    formatDate(profile?.cvImportedAt) ?? (hasCv ? formatDate(profile?.updatedAt) : null);
  const canPreviewCv = Boolean(profile?.cvText?.trim());
  const strength = passwordStrength(newPassword);

  if (loading) return <p className="label">Chargement du profil…</p>;

  return (
    <div className="fade-in max-w-3xl space-y-10 pb-16">
      <header className="border-b border-[var(--hairline)] pb-6">
        <p className="label">{onboarding ? "Première connexion" : "Profil"}</p>
        <h1 className="mt-1 text-3xl sm:text-4xl">
          {onboarding ? "Importez votre CV" : "Mon profil"}
        </h1>
        <p className="mt-2 max-w-xl text-[var(--ink-soft)]">
          {onboarding
            ? "Sans CV, JobRadar ne peut pas scorer les offres. Importez-le pour activer l’analyse."
            : "Ce que JobRadar utilise pour évaluer chaque offre"}
        </p>
        {toast && (
          <p className="mono mt-3 text-sm" style={{ color: "var(--match)" }} role="status">
            {toast}
          </p>
        )}
        {error && (
          <p className="mt-3 text-sm" style={{ color: "var(--brick)" }} role="alert">
            {error}
          </p>
        )}
      </header>

      {/* ——— CV ——— */}
      <section className="space-y-4 border-b border-[var(--hairline)] pb-10">
        <div>
          <h2 className="text-xl">CV</h2>
        </div>

        {!hasCv && !replacingCv ? (
          <div className="border border-dashed border-[var(--ink)] px-5 py-8">
            <p className="text-lg text-[var(--ink)]">
              Importez votre CV pour activer l’analyse des offres
            </p>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              C’est bloquant pour le scoring : sans CV, aucune offre ne peut être évaluée sérieusement.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                className="btn btn-amber"
                onClick={() => fileRef.current?.click()}
              >
                Importer un fichier .txt
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setReplacingCv(true)}
              >
                Coller le texte
              </button>
            </div>
          </div>
        ) : (
          <>
            {hasCv && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {profile?.cvFileName || "CV importé"}
                  </p>
                  <p className="mono mt-1 text-xs text-[var(--ink-soft)]">
                    {importDate ? `Importé le ${importDate}` : "Date d’import inconnue"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost !py-1.5 !text-sm"
                    disabled={!canPreviewCv}
                    onClick={() => setCvPreview((v) => !v)}
                  >
                    {cvPreview ? "Masquer" : "Voir le CV"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-amber !py-1.5 !text-sm"
                    onClick={() => {
                      setReplacingCv(true);
                      setCvPreview(false);
                    }}
                  >
                    Remplacer le CV
                  </button>
                </div>
              </div>
            )}

            {cvPreview && profile?.cvText && (
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap border border-[var(--hairline)] bg-[var(--field-bg)] p-3 font-[var(--font-body)] text-sm leading-relaxed">
                {profile.cvText}
              </pre>
            )}

            {replacingCv && (
              <div className="space-y-3 border border-[var(--ink)] p-4">
                <p className="text-sm text-[var(--ink-soft)]">
                  Remplace la version actuelle — une seule version est utilisée pour l’analyse.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-amber"
                    disabled={cvBusy}
                    onClick={() => fileRef.current?.click()}
                  >
                    Choisir un fichier .txt
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={cvBusy}
                    onClick={() => {
                      setReplacingCv(false);
                      setCvPaste("");
                    }}
                  >
                    Annuler
                  </button>
                </div>
                <label className="block">
                  <span className="label mb-1.5 block">Ou coller le texte</span>
                  <textarea
                    className="field min-h-36"
                    rows={7}
                    value={cvPaste}
                    onChange={(e) => setCvPaste(e.target.value)}
                    placeholder="Collez votre CV ici…"
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-amber"
                  disabled={cvBusy || cvPaste.trim().length < 40}
                  onClick={() => void uploadCvText(cvPaste.trim(), "cv-colle.txt")}
                >
                  {cvBusy ? "Import…" : "Remplacer avec ce texte"}
                </button>
              </div>
            )}
          </>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".txt,text/plain"
          className="hidden"
          onChange={(e) => {
            void onFileSelected(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
      </section>

      {/* ——— Compétences ——— */}
      <section
        className={`space-y-5 border-b border-[var(--hairline)] pb-10 ${!hasCv ? "opacity-50" : ""}`}
      >
        <div>
          <h2 className="text-xl">Compétences extraites</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            Corrigez ou complétez ce que l’import a détecté — le score s’appuie dessus.
          </p>
        </div>
        <TagInput
          label="Techniques"
          tags={skills}
          onChange={setSkills}
          placeholder="ex. TypeScript"
          hint="Entrée pour ajouter"
        />
        <TagInput
          label="Soft skills"
          tags={softSkills}
          onChange={setSoftSkills}
          placeholder="ex. Communication"
        />
        <TagInput
          label="Rôles cibles"
          tags={targetRoles}
          onChange={setTargetRoles}
          placeholder="ex. Full-stack"
        />
      </section>

      {/* ——— Préférences ——— */}
      <section className="space-y-5 border-b border-[var(--hairline)] pb-10">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl">Préférences de recherche</h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              Affine le scoring au-delà du matching CV / offre.
            </p>
          </div>
          {prefsSaved && (
            <p className="mono text-xs" style={{ color: "var(--match)" }}>
              {prefsSaved}
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SalaryField
            label="Salaire min (€ brut / an)"
            value={salaryMin}
            onChange={setSalaryMin}
            placeholder="50 000"
          />
          <SalaryField
            label="Salaire max (€ brut / an)"
            value={salaryMax}
            onChange={setSalaryMax}
            placeholder="70 000"
          />
        </div>

        <div>
          <span className="label mb-1.5 block">Type de poste</span>
          <p className="mb-2 text-xs text-[var(--ink-soft)]">
            Modalités de travail — indépendant des villes ci-dessous.
          </p>
          <div className="flex flex-wrap gap-2">
            {WORK_MODES.map((m) => {
              const on = workModes.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  className={
                    on
                      ? "inline-flex items-center border border-[var(--amber)] bg-[var(--amber)] px-3 py-1.5 text-sm font-medium text-[var(--amber-fg)]"
                      : "inline-flex items-center border border-[var(--hairline)] bg-transparent px-3 py-1.5 text-sm text-[var(--ink-soft)] hover:border-[var(--ink)] hover:text-[var(--ink)]"
                  }
                  aria-pressed={on}
                  onClick={() => toggleWorkMode(m.id)}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <TagInput
          label="Localisations acceptées"
          tags={preferredLocations}
          onChange={setPreferredLocations}
          placeholder="ex. Paris, Lyon"
          hint="Villes / régions uniquement"
          onIntercept={(value) => {
            if (!isWorkModeLocationTag(value)) return false;
            const mode = workModeFromTag(value);
            if (mode) {
              setWorkModes((prev) => (prev.includes(mode) ? prev : [...prev, mode]));
              showToast(
                mode === "remote"
                  ? "Remote ajouté dans Type de poste (pas dans les localisations)"
                  : "Ajouté dans Type de poste"
              );
            }
            return true;
          }}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label mb-1.5 block">Séniorité visée</span>
            <select
              className="field"
              value={targetSeniority}
              onChange={(e) => setTargetSeniority(e.target.value)}
            >
              <option value="">— Non précisé —</option>
              {SENIORITIES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label mb-1.5 block">Années d’expérience</span>
            <input
              className="field mono"
              type="number"
              min={0}
              max={60}
              value={experienceYears}
              onChange={(e) => setExperienceYears(e.target.value)}
            />
          </label>
        </div>

        <TagInput
          label="Secteurs à privilégier"
          tags={preferredSectors}
          onChange={setPreferredSectors}
          placeholder="ex. SaaS"
        />
        <TagInput
          label="Secteurs à éviter"
          tags={avoidedSectors}
          onChange={setAvoidedSectors}
          placeholder="ex. Crypto"
        />
      </section>

      {/* ——— Compte ——— */}
      <section className="space-y-5 border-b border-[var(--hairline)] pb-10">
        <div>
          <h2 className="text-xl">Informations du compte</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            Nom et email se sauvegardent automatiquement.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label mb-1.5 block">Nom</span>
            <input
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </label>
          <label className="block">
            <span className="label mb-1.5 block">Email</span>
            <input
              className="field"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
        </div>

        {hasPassword ? (
          <form onSubmit={onChangePassword} className="space-y-3 border-t border-[var(--hairline)] pt-5">
            <p className="label">Changer le mot de passe</p>
            <label className="block">
              <span className="label mb-1.5 block">Mot de passe actuel</span>
              <input
                className="field"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="label mb-1.5 block">Nouveau mot de passe</span>
                <input
                  className="field"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
                {newPassword.length > 0 && (
                  <p className="mono mt-1 text-xs text-[var(--ink-soft)]">
                    Force : {strength.label}
                  </p>
                )}
              </label>
              <label className="block">
                <span className="label mb-1.5 block">Confirmation</span>
                <input
                  className="field"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>
            </div>
            <button type="submit" className="btn btn-ghost" disabled={accountBusy}>
              {accountBusy ? "…" : "Mettre à jour le mot de passe"}
            </button>
          </form>
        ) : (
          <p className="text-sm text-[var(--ink-soft)]">
            Compte connecté via un fournisseur social — pas de mot de passe local.
          </p>
        )}
      </section>

      {/* ——— Danger ——— */}
      <section className="space-y-4 border border-[var(--brick)] p-5">
        <div>
          <p className="label" style={{ color: "var(--brick)" }}>
            Zone danger
          </p>
          <h2 className="mt-1 text-xl" style={{ color: "var(--brick)" }}>
            Supprimer le compte
          </h2>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            Irréversible : profil, analyses, candidatures et lettres seront effacés.
          </p>
        </div>
        <form onSubmit={onDeleteAccount} className="space-y-3">
          <label className="block">
            <span className="label mb-1.5 block">Tapez SUPPRIMER pour confirmer</span>
            <input
              className="field"
              value={dangerConfirm}
              onChange={(e) => setDangerConfirm(e.target.value)}
              autoComplete="off"
            />
          </label>
          {hasPassword && (
            <label className="block">
              <span className="label mb-1.5 block">Mot de passe</span>
              <input
                className="field"
                type="password"
                value={dangerPassword}
                onChange={(e) => setDangerPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
          )}
          <button
            type="submit"
            className="btn"
            style={{ background: "var(--brick)", borderColor: "var(--brick)", color: "#fff" }}
            disabled={dangerBusy || dangerConfirm !== "SUPPRIMER"}
          >
            {dangerBusy ? "Suppression…" : "Supprimer définitivement mon compte"}
          </button>
        </form>
      </section>

      {onboarding && hasCv && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="btn btn-amber"
            onClick={() => navigate("/", { replace: true })}
          >
            Continuer vers le dashboard
          </button>
        </div>
      )}
    </div>
  );
}
