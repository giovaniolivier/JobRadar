import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import {
  api,
  type Application,
  type ApplicationStatus,
  type StatusEvent,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAnalyzeOffer } from "../components/AnalyzeOfferPanel";
import { ApplicationDetailPanel } from "../components/ApplicationDetailPanel";
import { ScoreBadge } from "../components/ScoreBadge";

const STATUSES = ["TO_APPLY", "APPLIED", "INTERVIEW", "RESPONSE"] as const;

const LABELS: Record<ApplicationStatus, string> = {
  TO_APPLY: "À postuler",
  APPLIED: "Postulé",
  INTERVIEW: "Entretien",
  RESPONSE: "Réponse",
};

/** Badge « Relancer ? » après 14 jours en Postulé sans MAJ */
const FOLLOWUP_MS = 14 * 24 * 60 * 60 * 1000;
/** Surlignage discret après 21 jours sans nouvelles */
const STALE_MS = 21 * 24 * 60 * 60 * 1000;

function daysInStatus(app: Application, status: ApplicationStatus): number {
  const history = app.statusHistory?.length
    ? app.statusHistory
    : [{ status: app.status, at: app.createdAt } satisfies StatusEvent];
  const event = [...history].reverse().find((e) => e.status === status);
  const from = event ? +new Date(event.at) : +new Date(app.updatedAt);
  return Math.floor((Date.now() - from) / (24 * 60 * 60 * 1000));
}

function keyDate(app: Application): { label: string; iso: string } {
  const history = app.statusHistory?.length
    ? app.statusHistory
    : [{ status: app.status, at: app.createdAt } satisfies StatusEvent];

  const lastOf = (s: ApplicationStatus) =>
    [...history].reverse().find((e) => e.status === s)?.at;

  switch (app.status) {
    case "TO_APPLY":
      return { label: "Ajoutée", iso: app.createdAt };
    case "APPLIED":
      return { label: "Envoyée", iso: lastOf("APPLIED") ?? app.updatedAt };
    case "INTERVIEW":
      return { label: "Entretien", iso: lastOf("INTERVIEW") ?? app.updatedAt };
    case "RESPONSE":
      return { label: "Réponse", iso: lastOf("RESPONSE") ?? app.updatedAt };
  }
}

function formatShort(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return "—";
  }
}

function needsFollowUp(app: Application) {
  if (app.status !== "APPLIED") return false;
  if (app.followUpAt && +new Date(app.followUpAt) > Date.now()) return false;
  const history = app.statusHistory?.length
    ? app.statusHistory
    : [{ status: app.status, at: app.updatedAt }];
  const appliedAt = [...history].reverse().find((e) => e.status === "APPLIED")?.at ?? app.updatedAt;
  return Date.now() - +new Date(appliedAt) >= FOLLOWUP_MS;
}

function isStale(app: Application) {
  if (app.status !== "APPLIED") return false;
  const history = app.statusHistory?.length
    ? app.statusHistory
    : [{ status: app.status, at: app.updatedAt }];
  const appliedAt = [...history].reverse().find((e) => e.status === "APPLIED")?.at ?? app.updatedAt;
  return Date.now() - +new Date(appliedAt) >= STALE_MS;
}

export function PipelinePage() {
  const { token } = useAuth();
  const { openAnalyze } = useAnalyzeOffer();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Application | null>(null);
  const [dragOver, setDragOver] = useState<ApplicationStatus | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api<Application[]>("/applications");
      setApps(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCount = useMemo(
    () => apps.filter((a) => a.status !== "RESPONSE" || a.outcome !== "rejected").length,
    [apps]
  );

  async function updateStatus(id: string, status: ApplicationStatus) {
    setBusyId(id);
    setError(null);
    try {
      const updated = await api<Application>(`/applications/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setApps((prev) =>
        prev.map((a) =>
          a.id === id
            ? {
                ...updated,
                job: updated.job ?? a.job,
                statusHistory: updated.statusHistory?.length
                  ? updated.statusHistory
                  : a.statusHistory,
              }
            : a
        )
      );
      setSelected((cur) =>
        cur?.id === id
          ? {
              ...updated,
              job: updated.job ?? cur.job,
              statusHistory: updated.statusHistory?.length
                ? updated.statusHistory
                : cur.statusHistory,
            }
          : cur
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de changer le statut");
    } finally {
      setBusyId(null);
    }
  }

  function onDragStart(e: DragEvent, app: Application) {
    e.dataTransfer.setData("text/app-id", app.id);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOverColumn(e: DragEvent, status: ApplicationStatus) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(status);
  }

  function onDropColumn(e: DragEvent, status: ApplicationStatus) {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/app-id");
    if (!id) return;
    const app = apps.find((a) => a.id === id);
    if (!app || app.status === status) return;
    void updateStatus(id, status);
  }

  const trulyEmpty = !loading && apps.length === 0;

  return (
    <div className="fade-in">
      <div className="border-b border-[var(--hairline)] pb-6">
        <p className="label">Pipeline</p>
        <h1 className="mt-1 text-3xl sm:text-4xl">Candidatures</h1>
        <p className="mt-2 max-w-xl text-[var(--ink-soft)]">
          Suivez chaque candidature du dépôt à la réponse
        </p>
        {!loading && (
          <p className="mono mt-3 text-sm text-[var(--ink-soft)]">
            {activeCount} candidature{activeCount !== 1 ? "s" : ""} active
            {activeCount !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {error && (
        <p className="mt-4 text-sm" style={{ color: "var(--brick)" }} role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-10 label">Chargement du pipeline…</p>
      ) : trulyEmpty ? (
        <div className="mt-12 max-w-lg">
          <p className="text-lg text-[var(--ink)]">
            Ajoutez votre première offre analysée au pipeline pour commencer le suivi.
          </p>
          <button type="button" className="btn btn-amber mt-5 inline-flex" onClick={openAnalyze}>
            Analyser une nouvelle offre
          </button>
        </div>
      ) : (
        <div className="mt-8 grid gap-0 border-t border-[var(--ink)] lg:grid-cols-4">
          {STATUSES.map((status, colIdx) => {
            const column = apps.filter((a) => a.status === status);
            const isTarget = dragOver === status;
            return (
              <section
                key={status}
                className={`border-b border-[var(--hairline)] py-4 transition-colors lg:border-b-0 lg:px-3 xl:px-4 ${
                  colIdx === 0 ? "lg:pl-0" : "lg:border-l lg:border-[var(--hairline)]"
                } ${colIdx === STATUSES.length - 1 ? "lg:pr-0" : ""} ${
                  isTarget ? "bg-[var(--row-hover)]" : ""
                }`}
                onDragOver={(e) => onDragOverColumn(e, status)}
                onDragLeave={() => setDragOver((cur) => (cur === status ? null : cur))}
                onDrop={(e) => onDropColumn(e, status)}
              >
                <div className="mb-3 flex items-baseline justify-between gap-2 border-b border-[var(--hairline)] pb-2">
                  <h2 className="label !normal-case !tracking-wide" style={{ color: "var(--ink)" }}>
                    {LABELS[status]}
                  </h2>
                  <span className="mono text-xs text-[var(--ink-soft)]">{column.length}</span>
                </div>

                <ul className="min-h-[4.5rem] space-y-0">
                  {column.map((app) => {
                    const date = keyDate(app);
                    const followUp = needsFollowUp(app);
                    const stale = isStale(app);
                    const days = daysInStatus(app, status);

                    return (
                      <li key={app.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          draggable
                          onDragStart={(e) => onDragStart(e, app)}
                          onClick={() => setSelected(app)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelected(app);
                            }
                          }}
                          className={`group cursor-grab border-b border-[var(--hairline)] py-3 active:cursor-grabbing last:border-b-0 hover:bg-[var(--row-hover)]`}
                          style={
                            stale
                              ? {
                                  background:
                                    "color-mix(in srgb, var(--amber) 10%, transparent)",
                                }
                              : undefined
                          }
                        >
                          <div className="flex gap-2">
                            <ScoreBadge score={app.job?.analysis?.relevanceScore} size={36} />
                            <div className="min-w-0 flex-1">
                              <p className="display truncate text-sm font-semibold leading-snug">
                                {app.job?.title ?? "Offre"}
                              </p>
                              <p className="truncate text-xs text-[var(--ink-soft)]">
                                {app.job?.company}
                              </p>
                              <p className="mono mt-1.5 text-[0.65rem] text-[var(--ink-soft)]">
                                {date.label} {formatShort(date.iso)}
                                {status === "APPLIED" && days > 0 ? ` · ${days}j` : ""}
                              </p>
                              {followUp && (
                                <span
                                  className="label mt-1.5 inline-block"
                                  style={{ color: "var(--amber)" }}
                                >
                                  Relancer ?
                                </span>
                              )}
                              {app.outcome === "rejected" && status === "RESPONSE" && (
                                <span
                                  className="label mt-1.5 inline-block"
                                  style={{ color: "var(--brick)" }}
                                >
                                  Refusé
                                </span>
                              )}
                              {app.outcome === "accepted" && status === "RESPONSE" && (
                                <span
                                  className="label mt-1.5 inline-block"
                                  style={{ color: "var(--match)" }}
                                >
                                  Accepté
                                </span>
                              )}
                              <select
                                value={app.status}
                                disabled={busyId === app.id}
                                aria-label="Changer le statut"
                                className="field mt-2 !py-1 text-xs opacity-70 transition-opacity group-hover:opacity-100"
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  void updateStatus(
                                    app.id,
                                    e.target.value as ApplicationStatus
                                  );
                                }}
                              >
                                {STATUSES.map((s) => (
                                  <option key={s} value={s}>
                                    {LABELS[s]}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                  {!column.length && (
                    <li className="py-8 text-center text-xs text-[var(--ink-soft)]">
                      Aucune candidature ici pour l’instant
                    </li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <ApplicationDetailPanel
        app={selected}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        onUpdated={(updated) => {
          setApps((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
          setSelected(updated);
        }}
      />
    </div>
  );
}
