import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Job } from "../lib/api";
import { useAuth } from "../lib/auth";
import { RedFlagList, ScoreBadge } from "../components/ScoreBadge";

export function DashboardPage() {
  const { token } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [minScore, setMinScore] = useState("");
  const [location, setLocation] = useState("");
  const [tech, setTech] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (source) params.set("source", source);
      if (minScore) params.set("minScore", minScore);
      if (location) params.set("location", location);
      if (tech) params.set("tech", tech);
      const data = await api<Job[]>(`/jobs?${params}`, { token });
      setJobs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [token, q, source, minScore, location, tech]);

  useEffect(() => {
    void load();
  }, [load]);

  async function syncRemotive() {
    if (!token) return;
    setSyncing(true);
    setInfo(null);
    setError(null);
    try {
      const result = await api<{ count: number }>("/jobs/sync", {
        method: "POST",
        token,
        body: JSON.stringify({ search: q || "developer" }),
      });
      setInfo(`${result.count} offres Remotive synchronisées.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync échouée");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="fade-in">
      <div className="flex flex-col gap-4 border-b border-[var(--hairline)] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <p className="label">Tableau d'affichage</p>
          <h1 className="mt-1 text-3xl sm:text-4xl">Offres en approche</h1>
          <p className="mt-2 text-[var(--ink-soft)]">
            Score, red flags, extraction — gardez le contrôle sur le flux.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void syncRemotive()}
          disabled={syncing}
          className="btn btn-amber self-start sm:self-auto"
        >
          {syncing ? "Sync…" : "Sync Remotive"}
        </button>
      </div>

      <div className="mt-5 grid gap-3 border-b border-[var(--hairline)] pb-5 sm:grid-cols-2 lg:grid-cols-12">
        <input
          className="field lg:col-span-5"
          placeholder="Recherche"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="field lg:col-span-2"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <option value="">Toutes sources</option>
          <option value="remotive">Remotive</option>
          <option value="manual">Manuel</option>
        </select>
        <input
          className="field lg:col-span-2"
          placeholder="Lieu"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <input
          className="field lg:col-span-2"
          placeholder="Tech (exact)"
          value={tech}
          onChange={(e) => setTech(e.target.value)}
        />
        <input
          className="field mono lg:col-span-1"
          type="number"
          min={0}
          max={100}
          placeholder="Min"
          title="Score minimum"
          value={minScore}
          onChange={(e) => setMinScore(e.target.value)}
        />
      </div>

      {info && (
        <p className="mt-4 mono text-sm" style={{ color: "var(--match)" }}>
          {info}
        </p>
      )}
      {error && (
        <p className="mt-4 text-sm" style={{ color: "var(--brick)" }}>
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-10 label">Chargement du tableau…</p>
      ) : jobs.length === 0 ? (
        <p className="mt-10 text-[var(--ink-soft)]">
          Aucune offre. Sync Remotive, import CSV, ou seed la base.
        </p>
      ) : (
        <div className="board mt-8">
          <div
            className="board-head label hidden md:grid"
            style={{ gridTemplateColumns: "52px 1fr 140px 110px 90px" }}
          >
            <span>Score</span>
            <span>Offre / Société</span>
            <span>Lieu</span>
            <span>Salaire</span>
            <span>Source</span>
          </div>
          <ul>
            {jobs.map((job, i) => (
              <li key={job.id} className="fade-in" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                <Link
                  to={`/jobs/${job.id}`}
                  className="board-row md:grid"
                  style={{ gridTemplateColumns: "52px 1fr 140px 110px 90px" }}
                >
                  <ScoreBadge score={job.analysis?.relevanceScore} />
                  <div className="min-w-0">
                    <h2 className="display text-lg font-semibold leading-snug">
                      {job.title}
                    </h2>
                    <p className="mt-0.5 text-sm text-[var(--ink-soft)]">{job.company}</p>
                    {job.analysis?.summary && (
                      <p className="mt-2 line-clamp-2 text-sm text-[var(--ink)]/80">
                        {job.analysis.summary}
                      </p>
                    )}
                    {job.analysis && <RedFlagList flags={job.analysis.redFlags} />}
                    {!!job.techStack.length && (
                      <p className="mono mt-2 text-[0.7rem] text-[var(--ink-soft)]">
                        {job.techStack.slice(0, 8).join(" · ")}
                      </p>
                    )}
                  </div>
                  <p className="hidden text-sm text-[var(--ink-soft)] md:block">
                    {job.location ?? "—"}
                  </p>
                  <p className="mono hidden text-sm md:block" style={{ color: job.salaryRaw ? "var(--ink)" : "var(--brick)" }}>
                    {job.salaryRaw ?? "n/c"}
                  </p>
                  <p className="label hidden md:block">{job.source}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
