import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { api, type Application, type ApplicationStatus, type StatusEvent } from "../lib/api";
import { RedFlagList, ScoreBadge } from "./ScoreBadge";

const STATUSES = ["TO_APPLY", "APPLIED", "INTERVIEW", "RESPONSE"] as const;

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  TO_APPLY: "À postuler",
  APPLIED: "Postulé",
  INTERVIEW: "Entretien",
  RESPONSE: "Réponse",
};

const PIPELINE_STEPS: ApplicationStatus[] = ["TO_APPLY", "APPLIED", "INTERVIEW", "RESPONSE"];

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

type TimelineStep = {
  key: string;
  label: string;
  date: string | null;
  done: boolean;
};

function buildTimeline(app: Application): TimelineStep[] {
  const history =
    app.statusHistory && app.statusHistory.length > 0
      ? app.statusHistory
      : [{ status: app.status, at: app.createdAt } satisfies StatusEvent];

  const firstOf = (status: ApplicationStatus) =>
    history.find((e) => e.status === status)?.at ?? null;

  const currentIdx = PIPELINE_STEPS.indexOf(app.status);
  const analyzedAt = app.job?.analysis?.createdAt ?? null;

  const steps: TimelineStep[] = [
    {
      key: "analyzed",
      label: "Analysée",
      date: analyzedAt,
      done: Boolean(app.job?.analysis),
    },
    {
      key: "added",
      label: "Pipeline",
      date: firstOf("TO_APPLY") ?? app.createdAt,
      done: true,
    },
  ];

  const futureLabels: Record<Exclude<ApplicationStatus, "TO_APPLY">, string> = {
    APPLIED: "Postulé",
    INTERVIEW: "Entretien",
    RESPONSE: app.outcome === "rejected" ? "Refusé" : "Réponse",
  };

  for (const status of ["APPLIED", "INTERVIEW", "RESPONSE"] as const) {
    const idx = PIPELINE_STEPS.indexOf(status);
    const at = firstOf(status);
    const done = currentIdx >= idx;
    steps.push({
      key: status,
      label: futureLabels[status],
      date: done ? (at ?? (app.status === status ? app.updatedAt : null)) : null,
      done,
    });
  }

  return steps;
}

export function ApplicationDetailPanel({
  app,
  open,
  onClose,
  onUpdated,
}: {
  app: Application | null;
  open: boolean;
  onClose: () => void;
  onUpdated: (app: Application) => void;
}) {
  const [notes, setNotes] = useState("");
  const [letterOpen, setLetterOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState<Application | null>(null);
  const [notesSavedAt, setNotesSavedAt] = useState<string | null>(null);
  const [notesDirty, setNotesDirty] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !app) return;
    setLocal(app);
    setNotes(app.notes ?? "");
    setNotesDirty(false);
    setNotesSavedAt(app.notes ? app.updatedAt : null);
    setLetterOpen(Boolean(app.coverLetter));
    setError(null);
    setBusy(null);
    scrollRef.current?.scrollTo({ top: 0 });

    let cancelled = false;
    setLoadingDetail(true);
    void (async () => {
      try {
        const fresh = await api<Application>(`/applications/${app.id}`);
        if (cancelled) return;
        setLocal(fresh);
        setNotes(fresh.notes ?? "");
        setNotesSavedAt(fresh.notes ? fresh.updatedAt : null);
        setLetterOpen(Boolean(fresh.coverLetter));
        onUpdated(fresh);
      } catch {
        /* garde le snapshot liste */
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, app?.id]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!local || !notesDirty) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void autosaveNotes();
    }, 800);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [notes, notesDirty, local?.id]);

  if (!open || !local) return null;

  const job = local.job;
  const analysis = job?.analysis ?? null;
  const timeline = buildTimeline(local);
  const sourceHref = job?.url?.trim() || (job?.id ? `/offers/${job.id}` : null);
  const sourceExternal = Boolean(job?.url?.trim());

  async function patch(body: Record<string, unknown>, action: string) {
    setBusy(action);
    setError(null);
    try {
      const updated = await api<Application>(`/applications/${local!.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      const merged: Application = {
        ...updated,
        job: updated.job?.id ? updated.job : local!.job,
        statusHistory: updated.statusHistory?.length
          ? updated.statusHistory
          : local!.statusHistory,
      };
      setLocal(merged);
      onUpdated(merged);
      return merged;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mise à jour impossible");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function autosaveNotes() {
    if (!local) return;
    const next = notes.trim() || null;
    if (next === (local.notes ?? null)) {
      setNotesDirty(false);
      return;
    }
    setBusy("notes");
    try {
      const updated = await api<Application>(`/applications/${local.id}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: next }),
      });
      const merged: Application = {
        ...updated,
        job: updated.job?.id ? updated.job : local.job,
        statusHistory: updated.statusHistory?.length
          ? updated.statusHistory
          : local.statusHistory,
      };
      setLocal(merged);
      onUpdated(merged);
      setNotesDirty(false);
      setNotesSavedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d’enregistrer les notes");
    } finally {
      setBusy(null);
    }
  }

  async function markRejected() {
    await patch({ status: "RESPONSE", outcome: "rejected" }, "reject");
  }

  async function planFollowUp() {
    const at = new Date();
    at.setDate(at.getDate() + 7);
    await patch({ followUpAt: at.toISOString() }, "followup");
  }

  async function changeStatus(status: ApplicationStatus) {
    if (status === local.status) return;
    const body: Record<string, unknown> = { status };
    if (status !== "RESPONSE") body.outcome = null;
    await patch(body, "status");
  }

  async function generateLetter() {
    if (!job) return;
    setBusy("letter");
    setError(null);
    try {
      const data = await api<{ coverLetter: string }>(`/offers/${job.id}/generate-letter`, {
        method: "POST",
        body: "{}",
      });
      const updated = await patch({ coverLetter: data.coverLetter }, "letter-save");
      if (updated) setLetterOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Génération impossible");
      setBusy(null);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-hidden">
      <button
        type="button"
        className="absolute inset-0 bg-[var(--ink)]/40"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-detail-title"
        className="absolute inset-0 left-auto flex w-full max-w-lg flex-col border-l border-[var(--ink)] bg-[var(--paper)] shadow-2xl"
      >
        {/* En-tête — toujours visible */}
        <header className="shrink-0 border-b border-[var(--hairline)] px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="label">Candidature</p>
              <h2 id="app-detail-title" className="mt-0.5 truncate text-lg leading-snug sm:text-xl">
                {job?.title ?? "Détail"}
              </h2>
              <p className="truncate text-sm text-[var(--ink-soft)]">{job?.company ?? "—"}</p>
            </div>
            <button type="button" className="btn btn-ghost !px-2 !py-1 !text-xs" onClick={onClose}>
              Fermer
            </button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <ScoreBadge score={analysis?.relevanceScore ?? null} size={44} />
            <select
              className="field min-w-0 flex-1 !py-1.5 text-sm"
              value={local.status}
              disabled={!!busy}
              aria-label="Statut de la candidature"
              onChange={(e) => void changeStatus(e.target.value as ApplicationStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </header>

        {/* Corps scrollable — prend tout l’espace entre header et footer */}
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
        >
          {loadingDetail && <p className="label mb-3">Chargement…</p>}

          <section className="border-b border-[var(--hairline)] pb-4">
            <p className="label mb-2">Parcours</p>
            <ol className="flex flex-wrap gap-x-1 gap-y-2">
              {timeline.map((step, i) => (
                <li key={step.key} className="flex items-center gap-1 text-xs">
                  {i > 0 && (
                    <span className="mx-0.5 text-[var(--ink-soft)]" aria-hidden>
                      →
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 ${
                      step.done
                        ? "border-[var(--amber)] text-[var(--ink)]"
                        : "border-dashed border-[var(--hairline)] text-[var(--ink-soft)]"
                    }`}
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        background: step.done ? "var(--amber)" : "transparent",
                        boxShadow: step.done
                          ? undefined
                          : "inset 0 0 0 1px color-mix(in srgb, var(--ink-soft) 50%, transparent)",
                      }}
                      aria-hidden
                    />
                    {step.label}
                    {step.done && step.date ? (
                      <span className="mono text-[0.65rem] text-[var(--ink-soft)]">
                        {formatDate(step.date)}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
            {local.followUpAt && (
              <p className="mono mt-2 text-[0.65rem]" style={{ color: "var(--amber)" }}>
                Relance · {formatDate(local.followUpAt)}
              </p>
            )}
          </section>

          <section className="border-b border-[var(--hairline)] py-4">
            <p className="label mb-2">Analyse</p>
            {analysis ? (
              <div className="space-y-3">
                <p className="text-sm leading-snug text-[var(--ink)]/90">
                  {analysis.summary || "Aucun résumé disponible."}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="label" style={{ color: "var(--match)" }}>
                      Points forts
                    </p>
                    <ul className="mt-1.5 space-y-1 text-sm">
                      {(analysis.strengths ?? []).length ? (
                        (analysis.strengths ?? []).slice(0, 3).map((s) => (
                          <li key={s}>• {s}</li>
                        ))
                      ) : (
                        <li className="text-[var(--ink-soft)]">—</li>
                      )}
                    </ul>
                  </div>
                  <div>
                    <p className="label" style={{ color: "var(--amber)" }}>
                      Écarts à combler
                    </p>
                    <ul className="mt-1.5 space-y-1 text-sm">
                      {(analysis.gaps ?? []).length ? (
                        (analysis.gaps ?? []).slice(0, 3).map((g) => (
                          <li key={g}>• {g}</li>
                        ))
                      ) : (
                        <li className="text-[var(--ink-soft)]">—</li>
                      )}
                    </ul>
                  </div>
                </div>
                {(analysis.redFlags ?? []).length > 0 && (
                  <div
                    className="border px-2.5 py-2"
                    style={{ borderColor: "color-mix(in srgb, var(--brick) 50%, transparent)" }}
                  >
                    <p className="label" style={{ color: "var(--brick)" }}>
                      Red flags
                    </p>
                    <RedFlagList flags={analysis.redFlags} />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--ink-soft)]">Pas d’analyse disponible.</p>
            )}
          </section>

          <section className="border-b border-[var(--hairline)] py-4">
            <label className="block">
              <span className="label mb-1 block">Notes personnelles</span>
              <textarea
                className="field min-h-[4.5rem] resize-y text-sm"
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setNotesDirty(true);
                }}
                placeholder="Impressions, relance à faire…"
              />
            </label>
            <p className="mono mt-1 text-[0.65rem] text-[var(--ink-soft)]">
              {busy === "notes"
                ? "Enregistrement…"
                : notesDirty
                  ? "Modification…"
                  : notesSavedAt
                    ? `Modifié · ${formatDateTime(notesSavedAt)}`
                    : "Sauvegarde auto"}
            </p>
          </section>

          {sourceHref && (
            <p className="pt-3 text-sm">
              {sourceExternal ? (
                <a
                  href={sourceHref}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4 hover:text-[var(--amber)]"
                >
                  Voir l’offre originale ↗
                </a>
              ) : (
                <Link
                  to={sourceHref}
                  className="underline underline-offset-4 hover:text-[var(--amber)]"
                  onClick={onClose}
                >
                  Voir le détail de l’offre
                </Link>
              )}
            </p>
          )}

          {letterOpen && local.coverLetter && (
            <section className="mt-3 border border-[var(--hairline)] px-3 py-2">
              <p className="label">Lettre</p>
              <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap font-[var(--font-body)] text-sm leading-relaxed">
                {local.coverLetter}
              </pre>
            </section>
          )}

          {error && (
            <p className="mt-2 text-sm" style={{ color: "var(--brick)" }} role="alert">
              {error}
            </p>
          )}
        </div>

        {/* Footer — toujours collé en bas, hors scroll */}
        <footer className="shrink-0 border-t border-[var(--hairline)] bg-[var(--paper)] px-4 py-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            {local.status !== "RESPONSE" && (
              <button
                type="button"
                className="btn btn-ghost flex-1 !py-2"
                disabled={!!busy}
                onClick={() => void markRejected()}
              >
                {busy === "reject" ? "…" : "Refusé"}
              </button>
            )}
            {(local.status === "APPLIED" || local.status === "INTERVIEW") && (
              <button
                type="button"
                className="btn btn-ghost flex-1 !py-2"
                disabled={!!busy}
                onClick={() => void planFollowUp()}
              >
                {busy === "followup" ? "…" : "Relance +7 j"}
              </button>
            )}
            <button
              type="button"
              className="btn btn-amber flex-1 !py-2"
              disabled={!!busy}
              onClick={() => {
                if (local.coverLetter) {
                  setLetterOpen(true);
                  scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
                } else void generateLetter();
              }}
            >
              {busy === "letter" || busy === "letter-save"
                ? "…"
                : local.coverLetter
                  ? "Voir la lettre"
                  : "Générer la lettre"}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
}
