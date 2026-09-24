import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";
import { TagInput } from "../components/TagInput";
import { ApiError, api, type ProfileData } from "../lib/api";
import { useAuth } from "../lib/auth";

type Step = "upload" | "loading" | "preview" | "manual";

const MAX_BYTES = 5 * 1024 * 1024;
const LOADING_MESSAGES = [
  "Lecture du fichier…",
  "Extraction de vos compétences…",
  "Préparation de votre profil…",
];

const SKIP_KEY = "jobradar_onboarding_skipped";

function guessExperienceYears(text: string): number | null {
  const patterns = [
    /(\d+)\s*\+?\s*(?:ans|années)\s+(?:d['’]?expérience|en\s+)/i,
    /(\d+)\s*\+?\s*years?\s+(?:of\s+)?experience/i,
    /expérience\s*[:=]?\s*(\d+)\s*(?:ans|années)?/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const n = Number(m[1]);
      if (n >= 0 && n <= 45) return n;
    }
  }
  return null;
}

/** Nombre entier 0–45, ou vide. Rejette « trois ans », décimales, etc. */
function parseExperienceYears(raw: string): { ok: true; value: number | null } | { ok: false; message: string } {
  const t = raw.trim();
  if (!t) return { ok: true, value: null };
  if (!/^\d{1,2}$/.test(t)) {
    return {
      ok: false,
      message: "Indiquez un nombre entier (ex. 3), pas du texte.",
    };
  }
  const n = Number(t);
  if (n > 45) {
    return { ok: false, message: "Indiquez un nombre entre 0 et 45." };
  }
  return { ok: true, value: n };
}

function isAllowedExt(name: string) {
  const n = name.toLowerCase();
  return n.endsWith(".txt") || n.endsWith(".md") || n.endsWith(".text");
}

function isPdfOrDocx(name: string, type: string) {
  const n = name.toLowerCase();
  return (
    n.endsWith(".pdf") ||
    n.endsWith(".docx") ||
    n.endsWith(".doc") ||
    type === "application/pdf" ||
    type.includes("wordprocessingml") ||
    type === "application/msword"
  );
}

export function OnboardingCvPage() {
  const { token, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("upload");
  const [dragging, setDragging] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]!);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [softSkills, setSoftSkills] = useState<string[]>([]);
  const [experienceYears, setExperienceYears] = useState<string>("");
  const [manualCvText, setManualCvText] = useState("");
  const [yearsHint, setYearsHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [alreadyHasCv, setAlreadyHasCv] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (authLoading || !token) return;
    let cancelled = false;
    void api<{ profile: ProfileData | null }>("/profile")
      .then((data) => {
        if (cancelled) return;
        const ok = Boolean(data.profile?.hasCv || data.profile?.cvText?.trim());
        setAlreadyHasCv(ok);
      })
      .catch(() => {
        /* ignore */
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, token]);

  useEffect(() => {
    if (step !== "loading") return;
    let i = 0;
    setLoadingMsg(LOADING_MESSAGES[0]!);
    const id = window.setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      setLoadingMsg(LOADING_MESSAGES[i]!);
    }, 1400);
    return () => window.clearInterval(id);
  }, [step]);

  if (authLoading || checking) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="label">Préparation…</p>
      </div>
    );
  }
  if (!token) return <Navigate to="/login" replace />;
  if (alreadyHasCv) return <Navigate to="/dashboard" replace />;

  async function processText(text: string, name: string) {
    const trimmed = text.trim();
    if (trimmed.length < 40) {
      setError("Le contenu semble trop court pour un CV. Collez le texte complet, ou saisissez manuellement.");
      setStep("manual");
      return;
    }
    setStep("loading");
    setError(null);
    setFileName(name);
    try {
      const res = await api<{ ok: boolean; profile: ProfileData }>("/auth/upload-cv", {
        method: "POST",
        body: JSON.stringify({ cvText: trimmed, cvFileName: name }),
      });
      setSkills(res.profile.skills ?? []);
      setSoftSkills(res.profile.softSkills ?? []);
      const years = res.profile.experienceYears ?? guessExperienceYears(trimmed);
      setExperienceYears(years != null ? String(years) : "");
      setStep("preview");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Impossible de lire ce fichier. Vous pouvez coller le texte ou continuer manuellement."
      );
      setStep("manual");
    }
  }

  async function onFile(file: File | null) {
    if (!file) return;
    setError(null);

    if (file.size > MAX_BYTES) {
      setError("Fichier trop volumineux. Maximum 5 Mo.");
      return;
    }

    if (isPdfOrDocx(file.name, file.type)) {
      setError(
        "PDF et DOCX ne sont pas encore lus automatiquement. Exportez en .txt, ou collez le texte ci-dessous."
      );
      setStep("manual");
      setFileName(file.name);
      return;
    }

    if (!isAllowedExt(file.name) && !file.type.startsWith("text/")) {
      setError("Ce format n’est pas pris en charge. Utilisez un PDF, un DOCX (bientôt), ou un .txt.");
      return;
    }

    try {
      const text = await file.text();
      await processText(text, file.name);
    } catch {
      setError("Lecture du fichier impossible. Collez le texte ou continuez manuellement.");
      setStep("manual");
    }
  }

  const manualReady = manualCvText.trim().length >= 40 || skills.length > 0;

  async function saveAndContinue() {
    const yearsParsed = parseExperienceYears(experienceYears);
    if (!yearsParsed.ok) {
      setYearsHint(yearsParsed.message);
      setError(yearsParsed.message);
      return;
    }
    setYearsHint(null);
    setBusy(true);
    setError(null);
    try {
      await api("/profile", {
        method: "PATCH",
        body: JSON.stringify({
          skills,
          softSkills,
          experienceYears: yearsParsed.value,
        }),
      });
      try {
        sessionStorage.removeItem(SKIP_KEY);
        localStorage.removeItem("jobradar_cv_reminder_dismissed");
      } catch {
        /* ignore */
      }
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  }

  async function onManualSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setYearsHint(null);

    const text = manualCvText.trim();
    const yearsParsed = parseExperienceYears(experienceYears);
    if (!yearsParsed.ok) {
      setYearsHint(yearsParsed.message);
      setError(yearsParsed.message);
      return;
    }

    if (!manualReady) {
      setError("Collez le texte de votre CV (40 caractères min.), ou ajoutez au moins une compétence.");
      return;
    }

    if (text.length >= 40) {
      await processText(text, fileName ?? "cv-colle.txt");
      return;
    }

    setBusy(true);
    try {
      await api("/profile", {
        method: "PATCH",
        body: JSON.stringify({
          cvText: `Profil saisi manuellement.\nCompétences: ${skills.join(", ")}`,
          cvFileName: "saisie-manuelle.txt",
          skills,
          experienceYears: yearsParsed.value,
        }),
      });
      try {
        sessionStorage.removeItem(SKIP_KEY);
        localStorage.removeItem("jobradar_cv_reminder_dismissed");
      } catch {
        /* ignore */
      }
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  }

  function skip() {
    try {
      sessionStorage.setItem(SKIP_KEY, "1");
      localStorage.setItem("jobradar_cv_reminder_dismissed", "1");
    } catch {
      /* ignore */
    }
    navigate("/dashboard", { replace: true });
  }

  const firstName = user?.name?.trim().split(/\s+/)[0];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 flex w-full items-center justify-center border-b border-[var(--ink)] bg-[var(--paper)]/95 px-4 py-2.5 backdrop-blur-[2px] sm:px-6 lg:py-3">
        <BrandLogo to="" size="lg" lockup="wordmark" />
      </header>

      <main className="mx-auto max-w-xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-sm text-[var(--ink-soft)]">
          {firstName ? `Bonjour ${firstName}` : "Bienvenue"}
        </p>
        <h1 className="mt-2 text-3xl leading-tight sm:text-4xl">Commençons par votre CV</h1>
        <p className="mt-3 text-[var(--ink-soft)] leading-relaxed">
          C’est ce qui permet à JobRadar de comparer chaque offre à votre profil et de calculer un
          score fiable.
        </p>

        {step === "upload" && (
          <div className="mt-8 space-y-4">
            <label
              className={`flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 border border-dashed px-5 py-10 text-center transition-colors ${
                dragging
                  ? "border-[var(--amber)] bg-[var(--row-hover)]"
                  : "border-[var(--ink)] hover:border-[var(--amber)]"
              }`}
              onDragEnter={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void onFile(e.dataTransfer.files?.[0] ?? null);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.pdf,.docx,text/plain,application/pdf"
                className="sr-only"
                onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
              />
              <UploadIcon />
              <span className="text-base font-medium">Glissez votre CV ici, ou cliquez pour parcourir</span>
              <span className="text-xs text-[var(--ink-soft)]">PDF, DOCX, TXT — 5 Mo max</span>
            </label>
            <button
              type="button"
              className="text-sm text-[var(--ink-soft)] underline underline-offset-4 hover:text-[var(--ink)]"
              onClick={() => {
                setError(null);
                setStep("manual");
              }}
            >
              Ou coller / saisir manuellement
            </button>
          </div>
        )}

        {step === "loading" && (
          <div className="mt-12 flex flex-col items-center gap-4 py-8 text-center">
            <div className="h-1 w-40 overflow-hidden bg-[var(--paper-deep)]">
              <div className="analyze-progress h-full bg-[var(--amber)]" />
            </div>
            <p className="display text-xl" aria-live="polite">
              {loadingMsg}
            </p>
            {fileName && <p className="mono text-xs text-[var(--ink-soft)]">{fileName}</p>}
          </div>
        )}

        {step === "preview" && (
          <div className="mt-8 space-y-6">
            <div className="border border-[var(--hairline)] px-4 py-4">
              <p className="label">Vérification</p>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                Voici ce que nous avons lu — corrigez si besoin avant de continuer.
              </p>

              <label className="mt-4 block">
                <span className="label mb-1.5 block">Années d’expérience (estimées)</span>
                <input
                  className="field max-w-[8rem]"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={experienceYears}
                  onChange={(e) => {
                    setExperienceYears(e.target.value);
                    setYearsHint(null);
                  }}
                  placeholder="ex. 3"
                  aria-invalid={yearsHint ? true : undefined}
                />
                <span className="mt-1 block text-xs text-[var(--ink-soft)]">Nombre entier, ex. 3</span>
                {yearsHint && (
                  <span className="mt-1 block text-xs" style={{ color: "var(--brick)" }}>
                    {yearsHint}
                  </span>
                )}
              </label>

              <div className="mt-4">
                <TagInput
                  label="Compétences détectées"
                  tags={skills}
                  onChange={setSkills}
                  hint="Entrée ou virgule"
                  placeholder="ex. React"
                />
              </div>

              {softSkills.length > 0 && (
                <p className="mt-3 text-xs text-[var(--ink-soft)]">
                  Soft skills : {softSkills.slice(0, 6).join(" · ")}
                </p>
              )}
            </div>

            <p className="text-sm text-[var(--ink-soft)]">
              Vous pourrez toujours modifier ces informations plus tard depuis votre profil.
            </p>

            <button
              type="button"
              className="btn btn-amber w-full"
              disabled={busy}
              onClick={() => void saveAndContinue()}
            >
              {busy ? "…" : "C’est parti"}
            </button>
            <button
              type="button"
              className="w-full text-center text-sm text-[var(--ink-soft)] underline underline-offset-4"
              onClick={() => {
                setStep("upload");
                setError(null);
              }}
            >
              Importer un autre fichier
            </button>
          </div>
        )}

        {step === "manual" && (
          <form className="mt-8 space-y-4" onSubmit={(e) => void onManualSubmit(e)}>
            <p className="text-sm text-[var(--ink-soft)]">
              Pas de panique — collez le texte de votre CV, ou indiquez vos compétences à la main.
            </p>
            <label className="block">
              <span className="label mb-1.5 block">Texte du CV (optionnel si compétences remplies)</span>
              <textarea
                className="field min-h-32 resize-y"
                value={manualCvText}
                onChange={(e) => {
                  setManualCvText(e.target.value);
                  setError(null);
                }}
                placeholder="Collez ici le contenu de votre CV…"
              />
            </label>
            <TagInput
              label="Compétences"
              tags={skills}
              onChange={(next) => {
                setSkills(next);
                setError(null);
              }}
              hint="Entrée ou virgule — comme sur Mon profil"
              placeholder="ex. React, TypeScript"
            />
            <label className="block">
              <span className="label mb-1.5 block">Années d’expérience</span>
              <input
                className="field max-w-[8rem]"
                inputMode="numeric"
                pattern="[0-9]*"
                value={experienceYears}
                onChange={(e) => {
                  setExperienceYears(e.target.value);
                  setYearsHint(null);
                }}
                placeholder="ex. 3"
                aria-invalid={yearsHint ? true : undefined}
              />
              <span className="mt-1 block text-xs text-[var(--ink-soft)]">Nombre entier uniquement (ex. 3)</span>
              {yearsHint && (
                <span className="mt-1 block text-xs" style={{ color: "var(--brick)" }}>
                  {yearsHint}
                </span>
              )}
            </label>
            <button
              type="submit"
              className="btn btn-amber w-full"
              disabled={busy || !manualReady}
            >
              {busy ? "…" : "Continuer"}
            </button>
            {!manualReady && (
              <p className="text-xs text-[var(--ink-soft)]">
                Remplissez le texte du CV ou ajoutez au moins une compétence pour continuer.
              </p>
            )}
            <button
              type="button"
              className="w-full text-center text-sm text-[var(--ink-soft)] underline underline-offset-4"
              onClick={() => {
                setStep("upload");
                setError(null);
                setYearsHint(null);
              }}
            >
              Retour à l’import
            </button>
          </form>
        )}

        {error && (
          <p className="mt-4 text-sm" style={{ color: "var(--brick)" }} role="alert">
            {error}
          </p>
        )}

        {step === "upload" && (
          <p className="mt-8 text-center text-xs text-[var(--ink-soft)]">
            <button
              type="button"
              className="underline underline-offset-4 hover:text-[var(--ink)]"
              onClick={skip}
            >
              Je le ferai plus tard depuis mon profil
            </button>
          </p>
        )}
      </main>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden className="text-[var(--amber)]">
      <path
        d="M12 16V4m0 0 4 4m-4-4-4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
