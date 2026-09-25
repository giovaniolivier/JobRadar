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
import { useLocale } from "../lib/i18n";
import { CoverLetterPanel } from "./CoverLetterPanel";
import { RedFlagList, ScoreBadge, ScoreDialLoading } from "./ScoreBadge";

type Step = "input" | "loading" | "result" | "error";
type InputMode = "paste" | "link" | "file";

type AnalyzeOfferContextValue = {
  open: boolean;
  openAnalyze: () => void;
  openOfferDetail: (job: Job) => void;
  closeAnalyze: () => void;
};

const AnalyzeOfferContext = createContext<AnalyzeOfferContextValue | null>(null);

export function useAnalyzeOffer() {
  const ctx = useContext(AnalyzeOfferContext);
  if (!ctx) throw new Error("useAnalyzeOffer must be used within AnalyzeOfferProvider");
  return ctx;
}

const MIN_TEXT = 80;

const LOADING_KEYS = ["analyze.loading1", "analyze.loading2", "analyze.loading3"] as const;

type PanelIntent = "create" | "view";

export function AnalyzeOfferProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState<PanelIntent>("create");
  const [viewJob, setViewJob] = useState<Job | null>(null);

  const openAnalyze = useCallback(() => {
    setIntent("create");
    setViewJob(null);
    setOpen(true);
  }, []);

  const openOfferDetail = useCallback((job: Job) => {
    setIntent("view");
    setViewJob(job);
    setOpen(true);
  }, []);

  const closeAnalyze = useCallback(() => {
    setOpen(false);
    setViewJob(null);
    setIntent("create");
  }, []);

  const value = useMemo(
    () => ({ open, openAnalyze, openOfferDetail, closeAnalyze }),
    [open, openAnalyze, openOfferDetail, closeAnalyze]
  );

  return (
    <AnalyzeOfferContext.Provider value={value}>
      {children}
      <AnalyzeOfferPanel
        open={open}
        onClose={closeAnalyze}
        intent={intent}
        initialJob={viewJob}
      />
    </AnalyzeOfferContext.Provider>
  );
}

function AnalyzeOfferPanel({
  open,
  onClose,
  intent,
  initialJob,
}: {
  open: boolean;
  onClose: () => void;
  intent: PanelIntent;
  initialJob: Job | null;
}) {
  const { t } = useLocale();
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
  const [loadingMsg, setLoadingMsg] = useState(() => t("analyze.loading1"));
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [letter, setLetter] = useState<string | null>(null);
  const [letterOpen, setLetterOpen] = useState(false);
  const [stillWaiting, setStillWaiting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    abortRef.current?.abort();
    abortRef.current = null;
    setError(null);
    setNeedsCv(false);
    setBusyAction(null);
    setStillWaiting(false);
    setLetter(initialJob?.application?.coverLetter ?? null);
    setLetterOpen(false);

    if (intent === "view" && initialJob) {
      setResult(initialJob);
      setStep("result");
      return;
    }

    setStep("input");
    setMode("paste");
    setDescription("");
    setUrl("");
    setTitle("");
    setCompany("");
    setFileName(null);
    setResult(null);
    setLetter(null);
  }, [open, intent, initialJob]);

  useEffect(() => {
    if (step !== "loading") {
      setStillWaiting(false);
      return;
    }
    let i = 0;
    setLoadingMsg(t(LOADING_KEYS[0]!));
    const msgId = window.setInterval(() => {
      i = (i + 1) % LOADING_KEYS.length;
      setLoadingMsg(t(LOADING_KEYS[i]!));
    }, 1600);
    const waitId = window.setTimeout(() => setStillWaiting(true), 3500);
    return () => {
      window.clearInterval(msgId);
      window.clearTimeout(waitId);
    };
  }, [step, t]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && step !== "loading" && !letterOpen) requestClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, step, letterOpen, description, url, title, company, fileName]);

  function hasDraft() {
    return Boolean(
      description.trim() || url.trim() || title.trim() || company.trim() || fileName
    );
  }

  function requestClose() {
    if (step === "loading") return;
    if (intent === "create" && step === "input" && hasDraft()) {
      const ok = window.confirm(t("analyze.confirmAbandon"));
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
      setError(t("analyze.errorPdf"));
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
        setError(t("analyze.errorUrl"));
        return;
      }
      if (description.trim().length < MIN_TEXT) {
        setError(t("analyze.errorScraping"));
        return;
      }
    }

    if (mode === "file" && description.trim().length < MIN_TEXT) {
      setError(t("analyze.errorFile"));
      return;
    }

    const text = description.trim();
    if (text.length < MIN_TEXT) {
      setError(t("analyze.errorMinText"));
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
        err instanceof ApiError && err.message ? err.message : t("analyze.errorFailed")
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
      if (intent === "create") navigate("/pipeline");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("analyze.errorPipeline"));
    } finally {
      setBusyAction(null);
    }
  }

  async function ignoreOffer() {
    setBusyAction("ignore");
    try {
      onClose();
      if (intent === "create") navigate("/dashboard");
    } finally {
      setBusyAction(null);
    }
  }

  if (!open) return null;

  return (
    <>
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-[var(--ink)]/40"
        aria-label={t("analyze.close")}
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
            <p className="label">{t("analyze.action")}</p>
            <h2 id="analyze-offer-title" className="mt-1 text-xl sm:text-2xl">
              {step === "loading"
                ? t("analyze.titleLoading")
                : step === "result"
                  ? intent === "view"
                    ? t("analyze.titleView")
                    : t("analyze.titleResult")
                  : step === "error"
                    ? t("analyze.titleError")
                    : t("analyze.title")}
            </h2>
          </div>
          {step !== "loading" && (
            <button
              type="button"
              className="btn btn-ghost !px-2 !py-1 !text-xs"
              onClick={requestClose}
            >
              {t("analyze.close")}
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
                  <p className="mt-3 text-sm text-[var(--ink-soft)]">{t("analyze.stillWaiting")}</p>
                )}
              </div>
              <button
                type="button"
                className="text-xs text-[var(--ink-soft)] underline underline-offset-4"
                onClick={cancelAnalysis}
              >
                {t("analyze.cancelAnalysis")}
              </button>
            </div>
          )}

          {step === "error" && (
            <div className="flex min-h-[50%] flex-col items-center justify-center gap-4 py-12 text-center">
              <p className="text-sm" style={{ color: "var(--brick)" }} role="alert">
                {error ?? t("analyze.errorFailed")}
              </p>
              <button type="button" className="btn btn-amber" onClick={() => void runAnalyze()}>
                {t("analyze.retry")}
              </button>
              <button
                type="button"
                className="text-sm text-[var(--ink-soft)] underline underline-offset-4"
                onClick={() => {
                  setError(null);
                  setStep("input");
                }}
              >
                {t("analyze.editInput")}
              </button>
            </div>
          )}

          {step === "result" && result?.analysis && (
            <ResultStep
              job={result}
              hasLetter={Boolean(letter)}
              error={error}
              busyAction={busyAction}
              alreadyInPipeline={Boolean(result.application)}
              onPipeline={() => void addToPipeline()}
              onLetter={() => setLetterOpen(true)}
              onIgnore={() => void ignoreOffer()}
            />
          )}
          {step === "result" && result && !result.analysis && (
            <p className="text-sm text-[var(--ink-soft)]">{t("analyze.noAnalysis")}</p>
          )}
        </div>

        {step === "input" && (
          <footer className="flex items-center justify-between gap-3 border-t border-[var(--hairline)] px-5 py-4">
            <button
              type="button"
              className="text-sm text-[var(--ink-soft)] underline underline-offset-4"
              onClick={requestClose}
            >
              {t("analyze.cancel")}
            </button>
            <button type="button" className="btn btn-amber" onClick={() => void runAnalyze()}>
              {t("analyze.submit")}
            </button>
          </footer>
        )}
      </div>
    </div>

    <CoverLetterPanel
      open={letterOpen && Boolean(result)}
      onClose={() => setLetterOpen(false)}
      job={result}
      initialLetter={letter}
      applicationId={result?.application?.id ?? null}
      onSaved={(nextLetter, application) => {
        setLetter(nextLetter);
        if (application && result) {
          setResult({ ...result, application });
        }
      }}
    />
    </>
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
  const { t } = useLocale();
  const [dragging, setDragging] = useState(false);
  const len = description.trim().length;
  const enough = len >= MIN_TEXT;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("analyze.modeAria")}>
        {(
          [
            ["paste", t("analyze.modePaste")],
            ["link", t("analyze.modeLink")],
            ["file", t("analyze.modeFile")],
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
            <span className="label mb-1.5 block">{t("analyze.textLabel")}</span>
            <textarea
              className="field min-h-40 resize-y"
              rows={8}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("analyze.textPlaceholder")}
              autoFocus
            />
          </label>
          <div className="mt-1.5 flex items-start justify-between gap-3">
            <span className="text-xs text-[var(--ink-soft)]">{t("analyze.textHint")}</span>
            <span
              className="mono shrink-0 text-[0.7rem] tabular-nums"
              style={{ color: enough ? "var(--match)" : "var(--ink-soft)" }}
              aria-live="polite"
              title={`Minimum ${MIN_TEXT}`}
            >
              {t("analyze.counter", { len, min: MIN_TEXT })}
            </span>
          </div>
        </div>
      )}

      {mode === "link" && (
        <label className="block">
          <span className="label mb-1.5 block">{t("analyze.urlLabel")}</span>
          <input
            className="field"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t("analyze.urlPlaceholder")}
            autoFocus
          />
          <span className="mt-1.5 block text-xs text-[var(--ink-soft)]">{t("analyze.urlHint")}</span>
        </label>
      )}

      {mode === "file" && (
        <div>
          <span className="label mb-1.5 block">{t("analyze.fileLabel")}</span>
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
            <span className="text-sm font-medium">{t("analyze.fileDrop")}</span>
            <span className="text-xs text-[var(--ink-soft)]">{t("analyze.fileFormats")}</span>
            {fileName && (
              <span className="mt-1 mono text-xs text-[var(--ink)]">
                {t("analyze.fileSelected", { name: fileName })}
              </span>
            )}
          </label>
          {description.trim().length > 0 && mode === "file" && (
            <p className="mt-2 text-xs text-[var(--ink-soft)]">
              {t("analyze.fileLoaded", { n: description.trim().length })}
            </p>
          )}
        </div>
      )}

      <details className="border border-[var(--hairline)] px-3 py-2">
        <summary className="label cursor-pointer select-none">{t("analyze.optional")}</summary>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="label mb-1.5 block">{t("analyze.company")}</span>
            <input className="field" value={company} onChange={(e) => setCompany(e.target.value)} />
          </label>
          <label className="block">
            <span className="label mb-1.5 block">{t("analyze.jobTitle")}</span>
            <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          {mode !== "link" && (
            <label className="block">
              <span className="label mb-1.5 block">{t("analyze.offerLink")}</span>
              <input
                className="field"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t("analyze.linkPlaceholder")}
              />
            </label>
          )}
          <p className="text-xs text-[var(--ink-soft)]">{t("analyze.optionalHint")}</p>
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
              to="/onboarding"
              className="mt-2 inline-block underline decoration-[var(--amber)] underline-offset-4"
            >
              {t("analyze.importCv")}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function ResultStep({
  job,
  hasLetter,
  error,
  busyAction,
  alreadyInPipeline,
  onPipeline,
  onLetter,
  onIgnore,
}: {
  job: Job;
  hasLetter: boolean;
  error: string | null;
  busyAction: string | null;
  alreadyInPipeline: boolean;
  onPipeline: () => void;
  onLetter: () => void;
  onIgnore: () => void;
}) {
  const { t } = useLocale();
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
          <p className="mono mt-2 text-xs text-[var(--ink-soft)]">
            {t("analyze.scoreLabel", { n: a.relevanceScore })}
          </p>
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
            {t("analyze.lowScoreTitle")}
          </p>
          <p>{gaps[0] ?? t("analyze.lowScoreFallback")}</p>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <p className="label" style={{ color: "var(--match)" }}>
            {t("analyze.strengths")}
          </p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {strengths.length ? (
              strengths.slice(0, 3).map((s) => <li key={s}>• {s}</li>)
            ) : (
              <li className="text-[var(--ink-soft)]">{t("analyze.noStrengths")}</li>
            )}
          </ul>
        </div>
        <div>
          <p className="label" style={{ color: "var(--amber)" }}>
            {t("analyze.gaps")}
          </p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {gaps.length ? (
              gaps.slice(0, 3).map((g) => <li key={g}>• {g}</li>)
            ) : (
              <li className="text-[var(--ink-soft)]">{t("analyze.noGaps")}</li>
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
            {t("analyze.redFlags")}
          </p>
          <RedFlagList flags={a.redFlags} />
        </div>
      )}

      {error && (
        <p className="text-sm" style={{ color: "var(--brick)" }} role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 border-t border-[var(--hairline)] pt-4">
        {alreadyInPipeline ? (
          <p className="label text-center" style={{ color: "var(--match)" }}>
            {t("analyze.inPipeline")}
          </p>
        ) : (
          <button
            type="button"
            className="btn btn-amber w-full"
            disabled={!!busyAction}
            onClick={onPipeline}
          >
            {busyAction === "pipeline" ? t("analyze.addingPipeline") : t("analyze.addPipeline")}
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost w-full"
          disabled={!!busyAction}
          onClick={onLetter}
        >
          {hasLetter ? t("analyze.viewLetter") : t("analyze.generateLetter")}
        </button>
        {!alreadyInPipeline && (
          <button
            type="button"
            className="mt-1 text-center text-sm text-[var(--ink-soft)] underline underline-offset-4"
            disabled={!!busyAction}
            onClick={onIgnore}
          >
            {t("analyze.ignore")}
          </button>
        )}
      </div>
    </div>
  );
}
