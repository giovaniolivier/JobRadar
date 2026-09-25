import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { api, type Application, type ApplicationStatus, type StatusEvent } from "../lib/api";
import { useLocale, type MessageKey } from "../lib/i18n";
import { CoverLetterPanel } from "./CoverLetterPanel";
import { RedFlagList, ScoreBadge } from "./ScoreBadge";

const STATUSES = ["TO_APPLY", "APPLIED", "INTERVIEW", "RESPONSE"] as const;

const STATUS_KEYS: Record<ApplicationStatus, MessageKey> = {
  TO_APPLY: "pipeline.statusToApply",
  APPLIED: "pipeline.statusApplied",
  INTERVIEW: "pipeline.statusInterview",
  RESPONSE: "pipeline.statusResponse",
};

const PIPELINE_STEPS: ApplicationStatus[] = ["TO_APPLY", "APPLIED", "INTERVIEW", "RESPONSE"];

function formatDate(iso: string, locale: "fr" | "en") {
  try {
    return new Date(iso).toLocaleDateString(locale === "en" ? "en-GB" : "fr-FR", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string, locale: "fr" | "en") {
  try {
    return new Date(iso).toLocaleString(locale === "en" ? "en-GB" : "fr-FR", {
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

function buildTimeline(
  app: Application,
  labels: {
    analyzed: string;
    pipeline: string;
    applied: string;
    interview: string;
    response: string;
    rejected: string;
  }
): TimelineStep[] {
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
      label: labels.analyzed,
      date: analyzedAt,
      done: Boolean(app.job?.analysis),
    },
    {
      key: "added",
      label: labels.pipeline,
      date: firstOf("TO_APPLY") ?? app.createdAt,
      done: true,
    },
  ];

  const futureLabels: Record<Exclude<ApplicationStatus, "TO_APPLY">, string> = {
    APPLIED: labels.applied,
    INTERVIEW: labels.interview,
    RESPONSE: app.outcome === "rejected" ? labels.rejected : labels.response,
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
  const { t, locale } = useLocale();
  const [notes, setNotes] = useState("");
  const [coverPanelOpen, setCoverPanelOpen] = useState(false);
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
    setCoverPanelOpen(false);
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
      if (e.key === "Escape" && !coverPanelOpen) onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, coverPanelOpen]);

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
  const timeline = buildTimeline(local, {
    analyzed: t("app.timelineAnalyzed"),
    pipeline: t("app.timelinePipeline"),
    applied: t("pipeline.statusApplied"),
    interview: t("pipeline.statusInterview"),
    response: t("pipeline.statusResponse"),
    rejected: t("pipeline.rejected"),
  });
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
      setError(err instanceof Error ? err.message : t("app.errorUpdate"));
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
      setError(err instanceof Error ? err.message : t("app.errorNotes"));
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
    if (!local || status === local.status) return;
    const body: Record<string, unknown> = { status };
    if (status !== "RESPONSE") body.outcome = null;
    await patch(body, "status");
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-50 overflow-hidden">
        <button
          type="button"
          className="absolute inset-0 bg-[var(--ink)]/40"
          aria-label={t("app.close")}
          onClick={onClose}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="app-detail-title"
          className="absolute inset-0 left-auto flex w-full max-w-lg flex-col border-l border-[var(--ink)] bg-[var(--paper)] shadow-2xl"
        >
          <header className="shrink-0 border-b border-[var(--hairline)] px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="label">{t("app.eyebrow")}</p>
                <h2 id="app-detail-title" className="mt-0.5 truncate text-lg leading-snug sm:text-xl">
                  {job?.title ?? t("app.detailFallback")}
                </h2>
                <p className="truncate text-sm text-[var(--ink-soft)]">{job?.company ?? "—"}</p>
              </div>
              <button type="button" className="btn btn-ghost !px-2 !py-1 !text-xs" onClick={onClose}>
                {t("app.close")}
              </button>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <ScoreBadge score={analysis?.relevanceScore ?? null} size={44} />
              <select
                className="field min-w-0 flex-1 !py-1.5 text-sm"
                value={local.status}
                disabled={!!busy}
                aria-label={t("app.statusAria")}
                onChange={(e) => void changeStatus(e.target.value as ApplicationStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(STATUS_KEYS[s])}
                  </option>
                ))}
              </select>
            </div>
          </header>

          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
          >
            {loadingDetail && <p className="label mb-3">{t("app.loading")}</p>}

            <section className="border-b border-[var(--hairline)] pb-4">
              <p className="label mb-2">{t("app.journey")}</p>
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
                          {formatDate(step.date, locale)}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
              {local.followUpAt && (
                <p className="mono mt-2 text-[0.65rem]" style={{ color: "var(--amber)" }}>
                  {t("app.followUp", { date: formatDate(local.followUpAt, locale) })}
                </p>
              )}
            </section>

            <section className="border-b border-[var(--hairline)] py-4">
              <p className="label mb-2">{t("app.analysis")}</p>
              {analysis ? (
                <div className="space-y-3">
                  <p className="text-sm leading-snug text-[var(--ink)]/90">
                    {analysis.summary || t("app.noSummary")}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="label" style={{ color: "var(--match)" }}>
                        {t("app.strengths")}
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
                        {t("app.gaps")}
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
                        {t("app.redFlags")}
                      </p>
                      <RedFlagList flags={analysis.redFlags} />
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-[var(--ink-soft)]">{t("app.noAnalysis")}</p>
              )}
            </section>

            <section className="border-b border-[var(--hairline)] py-4">
              <label className="block">
                <span className="label mb-1 block">{t("app.notes")}</span>
                <textarea
                  className="field min-h-[4.5rem] resize-y text-sm"
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    setNotesDirty(true);
                  }}
                  placeholder={t("app.notesPh")}
                />
              </label>
              <p className="mono mt-1 text-[0.65rem] text-[var(--ink-soft)]">
                {busy === "notes"
                  ? t("app.notesSaving")
                  : notesDirty
                    ? t("app.notesDirty")
                    : notesSavedAt
                      ? t("app.notesSaved", { date: formatDateTime(notesSavedAt, locale) })
                      : t("app.notesAutosave")}
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
                    {t("app.viewOriginal")}
                  </a>
                ) : (
                  <Link
                    to={sourceHref}
                    className="underline underline-offset-4 hover:text-[var(--amber)]"
                    onClick={onClose}
                  >
                    {t("app.viewOffer")}
                  </Link>
                )}
              </p>
            )}

            {local.coverLetter && (
              <section className="mt-3 border border-[var(--hairline)] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="label">{t("app.letterSaved")}</p>
                  <button
                    type="button"
                    className="text-xs underline underline-offset-4 text-[var(--ink-soft)] hover:text-[var(--ink)]"
                    onClick={() => setCoverPanelOpen(true)}
                  >
                    {t("app.letterOpen")}
                  </button>
                </div>
                <pre className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap font-[var(--font-body)] text-sm leading-relaxed text-[var(--ink-soft)]">
                  {local.coverLetter.slice(0, 280)}
                  {local.coverLetter.length > 280 ? "…" : ""}
                </pre>
              </section>
            )}

            {error && (
              <p className="mt-2 text-sm" style={{ color: "var(--brick)" }} role="alert">
                {error}
              </p>
            )}
          </div>

          <footer className="shrink-0 border-t border-[var(--hairline)] bg-[var(--paper)] px-4 py-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              {local.status !== "RESPONSE" && (
                <button
                  type="button"
                  className="btn btn-ghost flex-1 !py-2"
                  disabled={!!busy}
                  onClick={() => void markRejected()}
                >
                  {busy === "reject" ? "…" : t("app.rejected")}
                </button>
              )}
              {(local.status === "APPLIED" || local.status === "INTERVIEW") && (
                <button
                  type="button"
                  className="btn btn-ghost flex-1 !py-2"
                  disabled={!!busy}
                  onClick={() => void planFollowUp()}
                >
                  {busy === "followup" ? "…" : t("app.followUp7")}
                </button>
              )}
              <button
                type="button"
                className="btn btn-amber flex-1 !py-2"
                disabled={!!busy || !job}
                onClick={() => setCoverPanelOpen(true)}
              >
                {local.coverLetter ? t("app.viewLetter") : t("app.generateLetter")}
              </button>
            </div>
          </footer>
        </div>
      </div>

      <CoverLetterPanel
        open={coverPanelOpen && Boolean(job)}
        onClose={() => setCoverPanelOpen(false)}
        job={job ?? null}
        initialLetter={local.coverLetter}
        applicationId={local.id}
        onSaved={(nextLetter, application) => {
          const merged: Application = {
            ...(application ?? local),
            coverLetter: nextLetter,
            job: application?.job?.id ? application.job : local.job,
          };
          setLocal(merged);
          onUpdated(merged);
        }}
      />
    </>,
    document.body
  );
}
