import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, type ProfileResponse } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAnalyzeOffer } from "../components/AnalyzeOfferPanel";

function splitList(value: string) {
  return value
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ProfilePage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const onboarding = params.get("onboarding") === "1";
  const { openAnalyze } = useAnalyzeOffer();
  const [name, setName] = useState("");
  const [cvText, setCvText] = useState("");
  const [skills, setSkills] = useState("");
  const [targetRoles, setTargetRoles] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [preferredLocations, setPreferredLocations] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<ProfileResponse>("/profile", { token })
      .then((data) => {
        setName(data.name);
        setCvText(data.profile?.cvText ?? "");
        setSkills((data.profile?.skills ?? []).join(", "));
        setTargetRoles((data.profile?.targetRoles ?? []).join(", "));
        setExperienceYears(
          data.profile?.experienceYears != null ? String(data.profile.experienceYears) : ""
        );
        setPreferredLocations((data.profile?.preferredLocations ?? []).join(", "));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (onboarding && !cvText.trim()) {
      setError("Ajoutez votre CV pour démarrer — c’est la base du scoring.");
      return;
    }
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await api("/auth/upload-cv", {
        method: "POST",
        token,
        body: JSON.stringify({ cvText }),
      });
      await api("/profile", {
        method: "PUT",
        token,
        body: JSON.stringify({
          name,
          skills: splitList(skills),
          targetRoles: splitList(targetRoles),
          experienceYears: experienceYears === "" ? null : Number(experienceYears),
          preferredLocations: splitList(preferredLocations),
        }),
      });
      if (onboarding) {
        navigate("/", { replace: true });
        return;
      }
      setMessage("Profil et CV enregistrés.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="label">Chargement du profil…</p>;

  return (
    <div className="fade-in max-w-3xl">
      <p className="label">{onboarding ? "Première connexion" : "Référentiel candidat"}</p>
      <h1 className="mt-1 text-3xl sm:text-4xl">
        {onboarding ? "Importez votre CV" : "Votre profil"}
      </h1>
      <p className="mt-2 text-[var(--ink-soft)]">
        {onboarding
          ? "Sans CV, le tableau de bord reste vide. Collez votre CV pour que JobRadar puisse scorer les offres."
          : "L'IA compare chaque offre à ce référentiel (CV, skills, cibles)."}
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5 border-t border-[var(--ink)] pt-6">
        <label className="block">
          <span className="label mb-1.5 block">Nom</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="label mb-1.5 block">CV (texte){onboarding ? " *" : ""}</span>
          <textarea
            className="field min-h-48"
            rows={10}
            value={cvText}
            onChange={(e) => setCvText(e.target.value)}
            placeholder="Collez votre CV ici…"
            required={onboarding}
          />
        </label>
        <label className="block">
          <span className="label mb-1.5 block">Skills</span>
          <input
            className="field"
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            placeholder="TypeScript, React, Node…"
          />
        </label>
        <label className="block">
          <span className="label mb-1.5 block">Rôles cibles</span>
          <input
            className="field"
            value={targetRoles}
            onChange={(e) => setTargetRoles(e.target.value)}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label mb-1.5 block">Années d'expérience</span>
            <input
              className="field mono"
              type="number"
              min={0}
              value={experienceYears}
              onChange={(e) => setExperienceYears(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="label mb-1.5 block">Lieux préférés</span>
            <input
              className="field"
              value={preferredLocations}
              onChange={(e) => setPreferredLocations(e.target.value)}
            />
          </label>
        </div>

        {message && (
          <p className="mono text-sm" style={{ color: "var(--match)" }}>
            {message}
          </p>
        )}
        {error && (
          <p className="text-sm" style={{ color: "var(--brick)" }}>
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving} className="btn btn-amber">
            {saving
              ? "Enregistrement…"
              : onboarding
                ? "Enregistrer et ouvrir le dashboard"
                : "Enregistrer"}
          </button>
          {onboarding && (
            <button
              type="button"
              className="text-sm text-[var(--ink-soft)] underline underline-offset-4"
              onClick={() => openAnalyze()}
            >
              Passer — analyser une offre
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
