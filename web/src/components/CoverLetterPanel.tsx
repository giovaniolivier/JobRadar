import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { api, type Application, type Job } from "../lib/api";

export type LetterJob = Pick<Job, "id" | "title" | "company"> & {
  analysis?: Job["analysis"];
};

type Tone = "formal" | "neutral" | "direct";
type Length = "short" | "standard" | "detailed";

const TONES: { id: Tone; label: string }[] = [
  { id: "formal", label: "Formel" },
  { id: "neutral", label: "Neutre" },
  { id: "direct", label: "Direct-personnel" },
];

const LENGTHS: { id: Length; label: string }[] = [
  { id: "short", label: "Courte" },
  { id: "standard", label: "Standard" },
  { id: "detailed", label: "Détaillée" },
];

const LOADING_STEPS = [
  "Lecture de votre profil…",
  "Rédaction de la lettre…",
  "Ajustement du ton…",
];

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
      setLoadingStep((s) => (s + 1) % LOADING_STEPS.length);
    }, 1600);
    return () => window.clearInterval(id);
  }, [busy]);

  async function generate() {
    if (!job) return;
    if (!hasCvState) {
      setError("Importez votre CV pour générer une lettre");
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
      setError(err instanceof Error ? err.message : "Génération impossible");
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
      setError(err instanceof Error ? err.message : "Enregistrement impossible");
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
      setError("Impossible de copier — sélectionnez le texte manuellement");
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

  return createPortal(
    <div className="fixed inset-0 z-[60] overflow-hidden">
      <button
        type="button"
        className="absolute inset-0 bg-[var(--ink)]/40"
        aria-label="Fermer"
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
              <p className="label">Lettre de motivation</p>
              <h2 id="letter-panel-title" className="mt-0.5 text-lg leading-snug sm:text-xl">
                <span className="line-clamp-2">
                  {job.title}
                  <span className="text-[var(--ink-soft)]"> — {job.company}</span>
                </span>
              </h2>
            </div>
            <button type="button" className="btn btn-ghost !px-2 !py-1 !text-xs" onClick={onClose}>
              Fermer
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {!hasCvState ? (
            <div className="border border-dashed border-[var(--ink)] px-5 py-8">
              <p className="text-lg text-[var(--ink)]">
                Importez votre CV pour générer une lettre
              </p>
              <p className="mt-2 text-sm text-[var(--ink-soft)]">
                Sans profil candidat, la personnalisation n’a pas de base fiable.
              </p>
              <Link to="/profile" className="btn btn-amber mt-5 inline-flex" onClick={onClose}>
                Ouvrir Mon profil
              </Link>
            </div>
          ) : (
            <>
              <section className="space-y-4 border-b border-[var(--hairline)] pb-5">
                <div>
                  <p className="label">Réglages</p>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">
                    Orientez le ton avant de générer — chaque régénération remplace la version
                    précédente.
                  </p>
                </div>
                <div>
                  <span className="label mb-1.5 block">Ton</span>
                  <Segmented
                    ariaLabel="Ton"
                    value={tone}
                    options={TONES}
                    onChange={setTone}
                    disabled={busy === "generate"}
                  />
                </div>
                <div>
                  <span className="label mb-1.5 block">Longueur</span>
                  <Segmented
                    ariaLabel="Longueur"
                    value={length}
                    options={LENGTHS}
                    onChange={setLength}
                    disabled={busy === "generate"}
                  />
                </div>
                <label className="block">
                  <span className="label mb-1.5 block">Point à mettre en avant (optionnel)</span>
                  <input
                    className="field"
                    value={highlight}
                    disabled={busy === "generate"}
                    onChange={(e) => setHighlight(e.target.value)}
                    placeholder="ex. Insiste sur ma reconversion et ma motivation"
                  />
                </label>
                {!hasLetter && (
                  <button
                    type="button"
                    className="btn btn-amber"
                    disabled={busy === "generate"}
                    onClick={() => void generate()}
                  >
                    {busy === "generate" ? "Génération…" : "Générer"}
                  </button>
                )}
              </section>

              {busy === "generate" && (
                <div className="mt-5 border border-[var(--hairline)] px-4 py-5">
                  <p className="label">En cours</p>
                  <p className="mt-2 text-[var(--ink)]">{LOADING_STEPS[loadingStep]}</p>
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
                      Réessayer
                    </button>
                  )}
                </div>
              )}

              {hasLetter && busy !== "generate" && (
                <section className="mt-5 space-y-3">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="label">Résultat</p>
                      {demo && (
                        <span className="mono text-[0.65rem] tracking-wide text-[var(--ink-soft)]">
                          Exemple — IA non connectée
                        </span>
                      )}
                    </div>
                    <p className="mono text-xs text-[var(--ink-soft)]">
                      {words} mot{words !== 1 ? "s" : ""} · {chars} car.
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
                    aria-label="Lettre de motivation éditable"
                  />
                  <p className="text-xs text-[var(--ink-soft)]">
                    Générée à partir de votre CV et des points forts de l’analyse
                    {job.analysis?.strengths?.length
                      ? ` (${job.analysis.strengths.slice(0, 2).join(" · ")})`
                      : ""}
                    .
                  </p>
                </section>
              )}
            </>
          )}
        </div>

        {hasCvState && hasLetter && busy !== "generate" && (
          <footer className="shrink-0 space-y-2 border-t border-[var(--hairline)] px-4 py-3">
            <p className="text-xs text-[var(--ink-soft)]">
              Relisez toujours avant l’envoi — l’IA peut se tromper sur des détails.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-amber flex-1 !py-2"
                disabled={!!busy}
                onClick={() => void copyLetter()}
              >
                {copied ? "Copié" : "Copier"}
              </button>
              <button
                type="button"
                className="btn btn-ghost flex-1 !py-2"
                disabled={!!busy}
                onClick={downloadLetter}
              >
                Télécharger (.txt)
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-ghost flex-1 !py-2"
                disabled={!!busy}
                onClick={() => void generate()}
              >
                Régénérer
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
                    ? "Enregistrée"
                    : "Enregistrer dans la candidature"}
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}
