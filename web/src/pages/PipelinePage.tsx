import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Application } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ScoreBadge } from "../components/ScoreBadge";

const STATUSES = ["TO_APPLY", "APPLIED", "INTERVIEW", "RESPONSE"] as const;

const LABELS: Record<(typeof STATUSES)[number], string> = {
  TO_APPLY: "À postuler",
  APPLIED: "Candidaté",
  INTERVIEW: "Entretien",
  RESPONSE: "Réponse",
};

export function PipelinePage() {
  const { token } = useAuth();
  const [apps, setApps] = useState<Application[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    const data = await api<Application[]>("/applications", { token });
    setApps(data);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [token]);

  async function updateStatus(id: string, status: (typeof STATUSES)[number]) {
    if (!token) return;
    await api(`/applications/${id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ status }),
    });
    await load();
  }

  if (error) {
    return (
      <p className="text-sm" style={{ color: "var(--brick)" }}>
        {error}
      </p>
    );
  }

  return (
    <div className="fade-in">
      <p className="label">Suivi</p>
      <h1 className="mt-1 text-3xl sm:text-4xl">Candidatures</h1>
      <p className="mt-2 text-[var(--ink-soft)]">
        Pipeline à quatre colonnes — à postuler → candidaté → entretien → réponse.
      </p>

      <div className="mt-8 grid gap-0 border-t border-[var(--ink)] lg:grid-cols-4">
        {STATUSES.map((status, colIdx) => {
          const column = apps.filter((a) => a.status === status);
          return (
            <section
              key={status}
              className={`border-b border-[var(--hairline)] py-4 lg:border-b-0 lg:px-4 ${
                colIdx === 0 ? "lg:pl-0" : "lg:border-l lg:border-[var(--hairline)]"
              } ${colIdx === STATUSES.length - 1 ? "lg:pr-0" : ""}`}
            >
              <div className="mb-3 flex items-baseline justify-between gap-2 border-b border-[var(--hairline)] pb-2">
                <h2 className="label !normal-case !tracking-wide" style={{ color: "var(--ink)" }}>
                  {LABELS[status]}
                </h2>
                <span className="mono text-xs text-[var(--ink-soft)]">{column.length}</span>
              </div>
              <ul>
                {column.map((app) => (
                  <li
                    key={app.id}
                    className="border-b border-[var(--hairline)] py-3 last:border-b-0"
                  >
                    <div className="flex gap-2">
                      <ScoreBadge score={app.job?.analysis?.relevanceScore} size={36} />
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/offers/${app.jobId}`}
                          className="display block truncate text-sm font-semibold hover:text-[var(--amber)]"
                        >
                          {app.job?.title ?? "Offre"}
                        </Link>
                        <p className="truncate text-xs text-[var(--ink-soft)]">{app.job?.company}</p>
                        <select
                          value={app.status}
                          onChange={(e) =>
                            void updateStatus(app.id, e.target.value as (typeof STATUSES)[number])
                          }
                          className="field mt-2 !py-1 text-xs"
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {LABELS[s]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </li>
                ))}
                {!column.length && (
                  <li className="py-8 text-center label">Vide</li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
