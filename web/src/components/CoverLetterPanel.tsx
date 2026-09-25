import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { api, type Application, type Job } from "../lib/api";
import { useLocale, type MessageKey } from "../lib/i18n";

export type LetterJob = Pick<Job, "id" | "title" | "company"> & {
  analysis?: Job["analysis"];
};

type Tone = "formal" | "neutral" | "direct";
type Length = "short" | "standard" | "detailed";

const TONE_KEYS: Record<Tone, MessageKey> = {
  formal: "letter.toneFormal",
  neutral: "letter.toneNeutral",
  direct: "letter.toneDirect",
};

const LENGTH_KEYS: Record<Length, MessageKey> = {
  short: "letter.lengthShort",
  standard: "letter.lengthStandard",
  detailed: "letter.lengthDetailed",
};

const LOADING_KEYS = ["letter.loading1", "letter.loading2", "letter.loading3"] as const;

function countWords(text: string) {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={ariaLabel}>
      {options.map((opt) => {
        const on = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onChange(opt.id)}
            className={
              on
                ? "inline-flex items-center border border-[var(--amber)] bg-[var(--amber)] px-3 py-1.5 text-sm font-medium text-[var(--amber-fg)] disabled:opacity-50"
                : "inline-flex items-center border border-[var(--hairline)] bg-transparent px-3 py-1.5 text-sm text-[var(--ink-soft)] hover:border-[var(--ink)] hover:text-[var(--ink)] disabled:opacity-50"
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function CoverLetterPanel({
  open,
  onClose,
  job,
  initialLetter = null,
  applicationId = null,
  hasCv = true,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  job: LetterJob | null;
  initialLetter?: string | null;
  applicationId?: string | null;
  hasCv?: boolean;
  onSaved?: (letter: string, application?: Application | null) => void;
}) {
  const { t } = useLocale();
  const [tone, setTone] = useState<Tone>("neutral");
  const [length, setLength] = useState<Length>("standard");
  const [highlight, setHighlight] = useState("");
  const [letter, setLetter] = useState("");
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [busy, setBusy] = useState<"generate" | "save" | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [demo, setDemo] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [hasCvState, setHasCvState] = useState(hasCv);

  const tones = (Object.keys(TONE_KEYS) as Tone[]).map((id) => ({
    id,
    label: t(TONE_KEYS[id]),
  }));
  const lengths = (Object.keys(LENGTH_KEYS) as Length[]).map((id) => ({
    id,
    label: t(LENGTH_KEYS[id]),
  }));

  useEffect(() => {
    if (!open || !job) return;
    const initial = initialLetter ?? "";
    setLetter(initial);
    setSavedSnapshot(initial || null);
    setDirty(false);
    setError(null);
    setBusy(null);
    setCopied(false);
    setTone("neutral");
    setLength("standard");
    setHighlight("");
    setDemo(false);
    setHasCvState(hasCv);

    let cancelled = false;
    void api<{ profile: { hasCv?: boolean; cvText?: string } | null }>("/profile")
      .then((data) => {
        if (cancelled) return;
        const ok = Boolean(data.profile?.hasCv || data.profile?.cvText?.trim());
        setHasCvState(ok);
      })
      .catch(() => {
        /* keep prop */
      });
    return () => {
      cancelled = true;
    };
  }, [open, job?.id, initialLetter, hasCv]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (busy !== "generate") return;
    setLoadingStep(0);
    const id = window.setInterval(() => {
      setLoadingStep((s) => (s + 1) % LOADING_KEYS.length);
    }, 1600);
    return () => window.clearInterval(id);
  }, [busy]);

  async function generate() {
    if (!job) return;
    if (!hasCvState) {
      setError(t("letter.needCv"));
      return;
    }
    setBusy("generate");
    setError(null);
    try {
      const data = await api<{
        coverLetter: string;
        demo?: boolean;
        application?: Application | null;
      }>(`/offers/${job.id}/generate-letter`, {
        method: "POST",
        body: JSON.stringify({
          tone,
          length,
          highlight: highlight.trim() || undefined,
          save: false,
        }),
      });
      setLetter(data.coverLetter);
      setDemo(Boolean(data.demo));
      setDirty(true);
      setSavedSnapshot(null);
      window.setTimeout(() => textareaRef.current?.focus(), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("letter.generateError"));
    } finally {
      setBusy(null);
    }
  }

  async function saveToApplication() {
    if (!job || !letter.trim()) return;
    setBusy("save");
    setError(null);
    try {
      const application = applicationId
        ? await api<Application>(`/applications/${applicationId}`, {
            method: "PATCH",
            body: JSON.stringify({ coverLetter: letter }),
          })
        : await api<Application>(`/applications`, {
            method: "POST",
            body: JSON.stringify({
              jobId: job.id,
              status: "TO_APPLY",
              coverLetter: letter,
            }),
          });
      setSavedSnapshot(letter);
      setDirty(false);
      onSaved?.(letter, application);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("letter.saveError"));
    } finally {
      setBusy(null);
    }
  }

  async function copyLetter() {
    if (!letter.trim()) return;
    try {
      await navigator.clipboard.writeText(letter);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t("letter.copyError"));
    }
  }

  function downloadLetter() {
    if (!letter.trim() || !job) return;
    const slug = `${job.company}-${job.title}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
    const blob = new Blob([letter], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lettre-${slug || "jobradar"}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (!open || !job) return null;

  const hasLetter = Boolean(letter.trim());
  const words = countWords(letter);
  const chars = letter.length;
  const strengthsSuffix = job.analysis?.strengths?.length
    ? ` (${job.analysis.strengths.slice(0, 2).join(" · ")})`
    : "";

  return createPortal(
    <div className="fixed inset-0 z-[60] overflow-hidden">
      <button
        type="button"
        className="absolute inset-0 bg-[var(--ink)]/40"
        aria-label={t("letter.close")}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="letter-panel-title"
        className="absolute inset-0 left-auto flex w-full max-w-2xl flex-col border-l border-[var(--ink)] bg-[var(--paper)] shadow-2xl"
      >
        <header className="shrink-0 border-b border-[var(--hairline)] px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="label">{t("letter.eyebrow")}</p>
              <h2 id="letter-panel-title" className="mt-0.5 text-lg leading-snug sm:text-xl">
                <span className="line-clamp-2">
                  {job.title}
                  <span className="text-[var(--ink-soft)]"> — {job.company}</span>
                </span>
              </h2>
            </div>
            <button type="button" className="btn btn-ghost !px-2 !py-1 !text-xs" onClick={onClose}>
              {t("letter.close")}
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {!hasCvState ? (
            <div className="border border-dashed border-[var(--ink)] px-5 py-8">
              <p className="text-lg text-[var(--ink)]">{t("letter.needCv")}</p>
              <p className="mt-2 text-sm text-[var(--ink-soft)]">{t("letter.needCvBody")}</p>
              <Link to="/profile" className="btn btn-amber mt-5 inline-flex" onClick={onClose}>
                {t("letter.goProfile")}
              </Link>
            </div>
          ) : (
            <>
              <section className="space-y-4 border-b border-[var(--hairline)] pb-5">
                <div>
                  <p className="label">{t("letter.settings")}</p>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">{t("letter.settingsHint")}</p>
                </div>
                <div>
                  <span className="label mb-1.5 block">{t("letter.tone")}</span>
                  <Segmented
                    ariaLabel={t("letter.tone")}
                    value={tone}
                    options={tones}
                    onChange={setTone}
                    disabled={busy === "generate"}
                  />
                </div>
                <div>
                  <span className="label mb-1.5 block">{t("letter.length")}</span>
                  <Segmented
                    ariaLabel={t("letter.length")}
                    value={length}
                    options={lengths}
                    onChange={setLength}
                    disabled={busy === "generate"}
                  />
                </div>
                <label className="block">
                  <span className="label mb-1.5 block">{t("letter.highlight")}</span>
                  <input
                    className="field"
                    value={highlight}
                    disabled={busy === "generate"}
                    onChange={(e) => setHighlight(e.target.value)}
                    placeholder={t("letter.highlightPlaceholder")}
                  />
                </label>
                {!hasLetter && (
                  <button
                    type="button"
                    className="btn btn-amber"
                    disabled={busy === "generate"}
                    onClick={() => void generate()}
                  >
                    {busy === "generate" ? t("letter.generating") : t("letter.generate")}
                  </button>
                )}
              </section>

              {busy === "generate" && (
                <div className="mt-5 border border-[var(--hairline)] px-4 py-5">
                  <p className="label">{t("letter.loadingLabel")}</p>
                  <p className="mt-2 text-[var(--ink)]">{t(LOADING_KEYS[loadingStep]!)}</p>
                  <div className="mt-4 h-1 overflow-hidden bg-[var(--paper-deep)]">
                    <div className="analyze-progress h-full bg-[var(--amber)]" />
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-4 space-y-2" role="alert">
                  <p className="text-sm" style={{ color: "var(--brick)" }}>
                    {error}
                  </p>
                  {hasCvState && (
                    <button
                      type="button"
                      className="btn btn-ghost !py-1.5 !text-sm"
                      disabled={!!busy}
                      onClick={() => void generate()}
                    >
                      {t("letter.retry")}
                    </button>
                  )}
                </div>
              )}

              {hasLetter && busy !== "generate" && (
                <section className="mt-5 space-y-3">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="label">{t("letter.result")}</p>
                      {demo && (
                        <span className="mono text-[0.65rem] tracking-wide text-[var(--ink-soft)]">
                          {t("letter.demo")}
                        </span>
                      )}
                    </div>
                    <p className="mono text-xs text-[var(--ink-soft)]">
                      {words === 1
                        ? t("letter.wordCount", { words, chars })
                        : t("letter.wordCountPlural", { words, chars })}
                    </p>
                  </div>
                  <textarea
                    ref={textareaRef}
                    className="field min-h-[16rem] font-[var(--font-body)] text-sm leading-relaxed"
                    value={letter}
                    onChange={(e) => {
                      setLetter(e.target.value);
                      setDirty(true);
                    }}
                    aria-label={t("letter.editableAria")}
                  />
                  <p className="text-xs text-[var(--ink-soft)]">
                    {t("letter.fromProfile", { strengths: strengthsSuffix })}
                  </p>
                </section>
              )}
            </>
          )}
        </div>

        {hasCvState && hasLetter && busy !== "generate" && (
          <footer className="shrink-0 space-y-2 border-t border-[var(--hairline)] px-4 py-3">
            <p className="text-xs text-[var(--ink-soft)]">{t("letter.disclaimer")}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-amber flex-1 !py-2"
                disabled={!!busy}
                onClick={() => void copyLetter()}
              >
                {copied ? t("letter.copied") : t("letter.copy")}
              </button>
              <button
                type="button"
                className="btn btn-ghost flex-1 !py-2"
                disabled={!!busy}
                onClick={downloadLetter}
              >
                {t("letter.download")}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-ghost flex-1 !py-2"
                disabled={!!busy}
                onClick={() => void generate()}
              >
                {t("letter.regenerate")}
              </button>
              <button
                type="button"
                className="btn btn-ghost flex-1 !py-2"
                disabled={!!busy || (!dirty && savedSnapshot === letter)}
                onClick={() => void saveToApplication()}
              >
                {busy === "save"
                  ? "…"
                  : savedSnapshot === letter && !dirty
                    ? t("letter.saved")
                    : t("letter.saveToApp")}
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}
