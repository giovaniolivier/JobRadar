import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, api, type Job } from "../lib/api";
import { RedFlagList, ScoreBadge, ScoreDialLoading } from "./ScoreBadge";

type Step = "input" | "loading" | "result" | "error";
type InputMode = "paste" | "link" | "file";

type AnalyzeOfferContextValue = {
  open: boolean;
  openAnalyze: () => void;
  closeAnalyze: () => void;
};

const AnalyzeOfferContext = createContext<AnalyzeOfferContextValue | null>(null);

export function useAnalyzeOffer() {
  const ctx = useContext(AnalyzeOfferContext);
  if (!ctx) throw new Error("useAnalyzeOffer must be used within AnalyzeOfferProvider");
  return ctx;
}

const LOADING_MESSAGES = [
  "Lecture de l'offre…",
  "Comparaison avec votre profil…",
  "Calcul du score de correspondance…",
];

const MIN_TEXT = 80;

export function AnalyzeOfferProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openAnalyze = useCallback(() => setOpen(true), []);
  const closeAnalyze = useCallback(() => setOpen(false), []);
  const value = useMemo(
    () => ({ open, openAnalyze, closeAnalyze }),
    [open, openAnalyze, closeAnalyze]
  );

  return (
    <AnalyzeOfferContext.Provider value={value}>
      {children}
      <AnalyzeOfferPanel open={open} onClose={closeAnalyze} />
    </AnalyzeOfferContext.Provider>
  );
}

function AnalyzeOfferPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>("input");
  const [mode, setMode] = useState<InputMode>("paste");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsCv, setNeedsCv] = useState(false);
  const [result, setResult] = useState<Job | null>(null);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]!);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [letter, setLetter] = useState<string | null>(null);
  const [stillWaiting, setStillWaiting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("input");
    setMode("paste");
    setDescription("");
    setUrl("");
    setTitle("");
    setCompany("");
    setFileName(null);
    setError(null);
    setNeedsCv(false);
    setResult(null);
    setLetter(null);
    setBusyAction(null);
    setStillWaiting(false);
    abortRef.current?.abort();
    abortRef.current = null;
  }, [open]);

  useEffect(() => {
    if (step !== "loading") {
      setStillWaiting(false);
      return;
    }
    let i = 0;
    setLoadingMsg(LOADING_MESSAGES[0]!);
    const msgId = window.setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      setLoadingMsg(LOADING_MESSAGES[i]!);
    }, 1600);
    const waitId = window.setTimeout(() => setStillWaiting(true), 3500);
    return () => {
      window.clearInterval(msgId);
      window.clearTimeout(waitId);
    };
  }, [step]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && step !== "loading") requestClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, step, description, url, title, company, fileName]);

  function hasDraft() {
    return Boolean(
      description.trim() || url.trim() || title.trim() || company.trim() || fileName
    );
  }

  function requestClose() {
    if (step === "loading") return;
    if (step === "input" && hasDraft()) {
      const ok = window.confirm("Vous avez saisi du contenu. Abandonner cette offre ?");
      if (!ok) return;
    }
    onClose();
  }

  async function onFileChange(file: File | null) {
    setFileName(null);
    if (!file) return;
    setFileName(file.name);
    setError(null);
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      setError(
        "L’extraction PDF automatique arrive bientôt. Ouvrez le fichier, copiez le texte, puis utilisez « Coller le texte »."
      );
      return;
    }
    const text = await file.text();
    setDescription(text);
    setMode("paste");
  }

  async function runAnalyze() {
    setError(null);
    setNeedsCv(false);

    if (mode === "link") {
      if (!url.trim()) {
        setError("Indiquez l’URL de l’offre.");
        return;
      }
      if (description.trim().length < MIN_TEXT) {
        setError(
          "Le scraping automatique n’est pas encore disponible. Passez sur « Coller le texte » pour analyser l’annonce — vous pourrez garder l’URL dans les champs optionnels."
        );
        return;
      }
    }

    if (mode === "file" && description.trim().length < MIN_TEXT) {
      setError("Importez un fichier .txt, ou collez le texte de l’offre.");
      return;
    }

    const text = description.trim();
    if (text.length < MIN_TEXT) {
      setError("Collez le texte complet de l'offre pour lancer l'analyse.");
      return;
    }

    setStep("loading");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const data = await api<Job>("/offers/analyze-new", {
        method: "POST",
        body: JSON.stringify({
          description: text,
          title: title.trim() || undefined,
          company: company.trim() || undefined,
          url: url.trim() || undefined,
        }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setResult(data);
      setStep("result");
    } catch (err) {
      if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
        setStep("input");
        return;
      }
      if (err instanceof ApiError && err.message.toLowerCase().includes("cv")) {
        setNeedsCv(true);
        setError(err.message);
        setStep("input");
        return;
      }
      setError(
        err instanceof ApiError && err.status < 500
          ? err.message
          : "L'analyse a échoué. Réessayez dans un instant."
      );
      setStep("error");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function cancelAnalysis() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStep("input");
    setStillWaiting(false);
  }

  async function addToPipeline() {
    if (!result) return;
    setBusyAction("pipeline");
    setError(null);
    try {
      await api("/applications", {
        method: "POST",
        body: JSON.stringify({ jobId: result.id, status: "TO_APPLY" }),
      });
      onClose();
      navigate("/pipeline");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'ajouter au pipeline");
    } finally {
      setBusyAction(null);
    }
  }

  async function generateLetter() {
    if (!result) return;
    setBusyAction("letter");
    setError(null);
    try {
      const data = await api<{ coverLetter: string }>(`/offers/${result.id}/generate-letter`, {
        method: "POST",
        body: "{}",
      });
      setLetter(data.coverLetter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Génération impossible");
    } finally {
      setBusyAction(null);
    }
  }

  async function ignoreOffer() {
    if (!result) {
      onClose();
      return;
    }
    setBusyAction("ignore");
    try {
      // Soft ignore: leave offer in DB for Offres list, just close
      onClose();
      navigate("/");
    } finally {
      setBusyAction(null);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-[var(--ink)]/40"
        aria-label="Fermer"
        disabled={step === "loading"}
        onClick={() => step !== "loading" && requestClose()}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="analyze-offer-title"
        className="relative flex h-full w-full max-w-lg flex-col border-l border-[var(--ink)] bg-[var(--paper)] shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-5 py-4">
          <div>
            <p className="label">Action</p>
            <h2 id="analyze-offer-title" className="mt-1 text-xl sm:text-2xl">
              {step === "loading"
                ? "Analyse en cours"
                : step === "result"
                  ? "Résultat de l’analyse"
                  : step === "error"
                    ? "Analyse interrompue"
                    : "Analyser une nouvelle offre"}
            </h2>
          </div>
          {step !== "loading" && (
            <button
              type="button"
              className="btn btn-ghost !px-2 !py-1 !text-xs"
              onClick={requestClose}
            >
              Fermer
            </button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {step === "input" && (
            <InputStep
              mode={mode}
              setMode={setMode}
              description={description}
              setDescription={setDescription}
              url={url}
              setUrl={setUrl}
              title={title}
              setTitle={setTitle}
              company={company}
              setCompany={setCompany}
              fileName={fileName}
              onFileChange={onFileChange}
              error={error}
              needsCv={needsCv}
            />
          )}

          {step === "loading" && (
            <div className="flex min-h-[60%] flex-col items-center justify-center gap-6 py-12 text-center">
              <ScoreDialLoading size={96} />
              <div className="max-w-xs">
                <p className="display text-xl" aria-live="polite">
                  {loadingMsg}
                </p>
                {stillWaiting && (
                  <p className="mt-3 text-sm text-[var(--ink-soft)]">Quelques secondes encore…</p>
                )}
              </div>
              <button
                type="button"
                className="text-xs text-[var(--ink-soft)] underline underline-offset-4"
                onClick={cancelAnalysis}
              >
                Annuler l’analyse
              </button>
            </div>
          )}

          {step === "error" && (
            <div className="flex min-h-[50%] flex-col items-center justify-center gap-4 py-12 text-center">
              <p className="text-sm" style={{ color: "var(--brick)" }} role="alert">
                {error ?? "L'analyse a échoué. Réessayez dans un instant."}
              </p>
              <button type="button" className="btn btn-amber" onClick={() => void runAnalyze()}>
                Réessayer
              </button>
              <button
                type="button"
                className="text-sm text-[var(--ink-soft)] underline underline-offset-4"
                onClick={() => {
                  setError(null);
                  setStep("input");
                }}
              >
                Modifier la saisie
              </button>
            </div>
          )}

          {step === "result" && result?.analysis && (
            <ResultStep
              job={result}
              letter={letter}
              error={error}
              busyAction={busyAction}
              onPipeline={() => void addToPipeline()}
              onLetter={() => void generateLetter()}
              onIgnore={() => void ignoreOffer()}
            />
          )}
        </div>

        {step === "input" && (
          <footer className="flex items-center justify-between gap-3 border-t border-[var(--hairline)] px-5 py-4">
            <button
              type="button"
              className="text-sm text-[var(--ink-soft)] underline underline-offset-4"
              onClick={requestClose}
            >
              Annuler
            </button>
            <button type="button" className="btn btn-amber" onClick={() => void runAnalyze()}>
              Analyser
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

function InputStep({
  mode,
  setMode,
  description,
  setDescription,
  url,
  setUrl,
  title,
  setTitle,
  company,
  setCompany,
  fileName,
  onFileChange,
  error,
  needsCv,
}: {
  mode: InputMode;
  setMode: (m: InputMode) => void;
  description: string;
  setDescription: (v: string) => void;
  url: string;
  setUrl: (v: string) => void;
  title: string;
  setTitle: (v: string) => void;
  company: string;
  setCompany: (v: string) => void;
  fileName: string | null;
  onFileChange: (f: File | null) => void;
  error: string | null;
  needsCv: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const len = description.trim().length;
  const enough = len >= MIN_TEXT;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Méthode d'ajout">
        {(
          [
            ["paste", "Coller le texte"],
            ["link", "Coller un lien"],
            ["file", "Importer un fichier"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            className={`btn !py-1.5 !text-xs ${mode === id ? "btn-amber" : "btn-ghost"}`}
            onClick={() => setMode(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "paste" && (
        <div>
          <label className="block">
            <span className="label mb-1.5 block">Texte de l’offre</span>
            <textarea
              className="field min-h-40 resize-y"
              rows={8}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Collez ici l’annonce complète…"
              autoFocus
            />
          </label>
          <div className="mt-1.5 flex items-start justify-between gap-3">
            <span className="text-xs text-[var(--ink-soft)]">
              Collez l’intégralité de l’annonce pour une analyse plus précise
            </span>
            <span
              className="mono shrink-0 text-[0.7rem] tabular-nums"
              style={{ color: enough ? "var(--match)" : "var(--ink-soft)" }}
              aria-live="polite"
            >
              {len}/{MIN_TEXT}
            </span>
          </div>
        </div>
      )}

      {mode === "link" && (
        <label className="block">
          <span className="label mb-1.5 block">URL de l’offre</span>
          <input
            className="field"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://linkedin.com/jobs/… ou indeed, site carrière…"
            autoFocus
          />
          <span className="mt-1.5 block text-xs text-[var(--ink-soft)]">
            Le lien sera gardé en référence. Pour l’instant, l’analyse se fait via « Coller le texte »
            (scraping automatique bientôt).
          </span>
        </label>
      )}

      {mode === "file" && (
        <div>
          <span className="label mb-1.5 block">Fichier de l’offre</span>
          <label
            className={`flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 border border-dashed px-4 py-8 text-center transition-colors ${
              dragging ? "border-[var(--amber)] bg-[var(--row-hover)]" : "border-[var(--hairline)]"
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
              void onFileChange(e.dataTransfer.files?.[0] ?? null);
            }}
          >
            <input
              type="file"
              accept=".txt,.md,.pdf,text/plain,application/pdf"
              className="sr-only"
              onChange={(e) => void onFileChange(e.target.files?.[0] ?? null)}
            />
            <span className="text-sm font-medium">Glissez un fichier ici, ou parcourir</span>
            <span className="text-xs text-[var(--ink-soft)]">Formats acceptés : PDF, .txt</span>
            {fileName && (
              <span className="mt-1 mono text-xs text-[var(--ink)]">Sélectionné : {fileName}</span>
            )}
          </label>
          {description.trim().length > 0 && mode === "file" && (
            <p className="mt-2 text-xs text-[var(--ink-soft)]">
              Texte chargé ({description.trim().length} car.) — vous pouvez lancer l’analyse, ou
              basculer sur « Coller le texte » pour le relire.
            </p>
          )}
        </div>
      )}

      <details className="border border-[var(--hairline)] px-3 py-2">
        <summary className="label cursor-pointer select-none">Champs optionnels</summary>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="label mb-1.5 block">Entreprise</span>
            <input className="field" value={company} onChange={(e) => setCompany(e.target.value)} />
          </label>
          <label className="block">
            <span className="label mb-1.5 block">Intitulé du poste</span>
            <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          {mode !== "link" && (
            <label className="block">
              <span className="label mb-1.5 block">Lien de l’offre</span>
              <input
                className="field"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
              />
            </label>
          )}
          <p className="text-xs text-[var(--ink-soft)]">
            L’IA peut extraire ces infos du texte — ne les remplissez que si vous voulez les forcer.
          </p>
        </div>
      </details>

      {error && (
        <div
          className="border border-[var(--brick)]/40 px-3 py-3 text-sm"
          style={{ color: "var(--brick)" }}
          role="alert"
        >
          <p>{error}</p>
          {needsCv && (
            <Link
              to="/profile?onboarding=1"
              className="mt-2 inline-block underline decoration-[var(--amber)] underline-offset-4"
            >
              Importer mon CV
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function ResultStep({
  job,
  letter,
  error,
  busyAction,
  onPipeline,
  onLetter,
  onIgnore,
}: {
  job: Job;
  letter: string | null;
  error: string | null;
  busyAction: string | null;
  onPipeline: () => void;
  onLetter: () => void;
  onIgnore: () => void;
}) {
  const a = job.analysis!;
  const strengths = a.strengths ?? [];
  const gaps = a.gaps ?? [];
  const lowScore = a.relevanceScore < 45;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 border-b border-[var(--hairline)] pb-5">
        <ScoreBadge score={a.relevanceScore} size={80} />
        <div className="min-w-0 pt-1">
          <h3 className="text-xl leading-snug sm:text-2xl">{job.title}</h3>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">{job.company}</p>
          <p className="mono mt-2 text-xs text-[var(--ink-soft)]">Score {a.relevanceScore}/100</p>
        </div>
      </div>

      <blockquote className="border-l-2 border-[var(--amber)] pl-4 text-[0.95rem] leading-relaxed text-[var(--ink)]/90 italic">
        {a.summary}
      </blockquote>

      {lowScore && (
        <div
          className="border px-3 py-3 text-sm leading-relaxed"
          style={{ borderColor: "color-mix(in srgb, var(--brick) 45%, transparent)" }}
        >
          <p className="label mb-1.5" style={{ color: "var(--brick)" }}>
            Écart important
          </p>
          <p>
            {gaps[0] ??
              "Cette offre correspond peu à votre profil actuel. Les écarts ci-dessous indiquent pourquoi — utile pour prioriser ou préparer un entretien ciblé."}
          </p>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <p className="label" style={{ color: "var(--match)" }}>
            Points forts
          </p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {strengths.length ? (
              strengths.slice(0, 3).map((s) => <li key={s}>• {s}</li>)
            ) : (
              <li className="text-[var(--ink-soft)]">Aucun point fort net détecté</li>
            )}
          </ul>
        </div>
        <div>
          <p className="label" style={{ color: "var(--amber)" }}>
            Écarts à combler
          </p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {gaps.length ? (
              gaps.slice(0, 3).map((g) => <li key={g}>• {g}</li>)
            ) : (
              <li className="text-[var(--ink-soft)]">Pas d’écart majeur signalé</li>
            )}
          </ul>
        </div>
      </div>

      {a.redFlags.length > 0 && (
        <div
          className="border px-3 py-3"
          style={{ borderColor: "color-mix(in srgb, var(--brick) 50%, transparent)" }}
        >
          <p className="label" style={{ color: "var(--brick)" }}>
            Red flags
          </p>
          <RedFlagList flags={a.redFlags} />
        </div>
      )}

      {letter && (
        <section className="border border-[var(--hairline)] px-3 py-3">
          <p className="label">Lettre de motivation</p>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-[var(--font-body)] text-sm leading-relaxed not-italic">
            {letter}
          </pre>
        </section>
      )}

      {error && (
        <p className="text-sm" style={{ color: "var(--brick)" }} role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 border-t border-[var(--hairline)] pt-4">
        <button
          type="button"
          className="btn btn-amber w-full"
          disabled={!!busyAction}
          onClick={onPipeline}
        >
          {busyAction === "pipeline" ? "Ajout…" : "Ajouter au pipeline"}
        </button>
        <button
          type="button"
          className="btn btn-ghost w-full"
          disabled={!!busyAction}
          onClick={onLetter}
        >
          {busyAction === "letter" ? "Génération…" : "Générer la lettre de motivation"}
        </button>
        <button
          type="button"
          className="mt-1 text-center text-sm text-[var(--ink-soft)] underline underline-offset-4"
          disabled={!!busyAction}
          onClick={onIgnore}
        >
          Ignorer cette offre
        </button>
      </div>
    </div>
  );
}
