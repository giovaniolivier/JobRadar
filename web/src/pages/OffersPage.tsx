import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { api, type Job } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAnalyzeOffer } from "../components/AnalyzeOfferPanel";
import { RedFlagList, ScoreBadge } from "../components/ScoreBadge";

type SortKey = "score" | "date" | "salary";
type ScoreFilter = "all" | "80" | "60";
type RedFlagFilter = "all" | "yes" | "no";
type PipelineFilter = "all" | "in" | "out";
type WorkMode = "all" | "remote" | "hybrid" | "onsite";

const PAGE_SIZE = 20;

/** Red flags affichées : analyse + cohérence avec la colonne salaire (n/c). */
function effectiveRedFlags(job: Job): string[] {
  const flags = [...(job.analysis?.redFlags ?? [])];
  if (!job.salaryRaw?.trim() && !flags.some((f) => /salaire/i.test(f))) {
    flags.unshift("Salaire non précisé");
  }
  return flags;
}

function salarySortValue(raw: string | null): number {
  if (!raw) return -1;
  const digits = raw.replace(/[^\d]/g, "");
  const n = Number(digits);
  return Number.isFinite(n) ? n : -1;
}

function detectWorkMode(location: string | null): "remote" | "hybrid" | "onsite" {
  const loc = (location ?? "").toLowerCase();
  if (/hybrid|hybride/.test(loc)) return "hybrid";
  if (/remote|télétravail|teletravail|full\s*remote|anywhere/.test(loc)) return "remote";
  return "onsite";
}

function filtersActive(f: {
  q: string;
  sort: SortKey;
  score: ScoreFilter;
  redFlags: RedFlagFilter;
  pipeline: PipelineFilter;
  work: WorkMode;
}) {
  return (
    f.q.trim() !== "" ||
    f.sort !== "score" ||
    f.score !== "all" ||
    f.redFlags !== "all" ||
    f.pipeline !== "all" ||
    f.work !== "all"
  );
}

export function OffersPage() {
  const { token } = useAuth();
  const { open, openAnalyze, openOfferDetail } = useAnalyzeOffer();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("score");
  const [score, setScore] = useState<ScoreFilter>("all");
  const [redFlags, setRedFlags] = useState<RedFlagFilter>("all");
  const [pipeline, setPipeline] = useState<PipelineFilter>("all");
  const [work, setWork] = useState<WorkMode>("all");
  const [page, setPage] = useState(1);
  const [pipelineBusy, setPipelineBusy] = useState<string | null>(null);
  const wasOpen = useRef(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api<Job[]>("/offers", { token });
      setJobs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (wasOpen.current && !open) void load();
    wasOpen.current = open;
  }, [open, load]);

  useEffect(() => {
    setPage(1);
  }, [q, sort, score, redFlags, pipeline, work]);

  const filtered = useMemo(() => {
    let list = [...jobs];
    const query = q.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (j) =>
          j.title.toLowerCase().includes(query) ||
          j.company.toLowerCase().includes(query)
      );
    }
    if (score === "80") list = list.filter((j) => (j.analysis?.relevanceScore ?? -1) >= 80);
    if (score === "60") list = list.filter((j) => (j.analysis?.relevanceScore ?? -1) >= 60);
    if (redFlags === "yes") {
      list = list.filter((j) => effectiveRedFlags(j).length > 0);
    }
    if (redFlags === "no") {
      list = list.filter((j) => effectiveRedFlags(j).length === 0);
    }
    if (pipeline === "in") list = list.filter((j) => Boolean(j.application));
    if (pipeline === "out") list = list.filter((j) => !j.application);
    if (work !== "all") {
      list = list.filter((j) => detectWorkMode(j.location) === work);
    }

    list.sort((a, b) => {
      if (sort === "date") {
        return +new Date(b.fetchedAt) - +new Date(a.fetchedAt);
      }
      if (sort === "salary") {
        return salarySortValue(b.salaryRaw) - salarySortValue(a.salaryRaw);
      }
      return (b.analysis?.relevanceScore ?? -1) - (a.analysis?.relevanceScore ?? -1);
    });
    return list;
  }, [jobs, q, sort, score, redFlags, pipeline, work]);

  const visible = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < filtered.length;
  const activeFilters = filtersActive({ q, sort, score, redFlags, pipeline, work });
  const trulyEmpty = !loading && jobs.length === 0;
  const filterEmpty = !loading && jobs.length > 0 && filtered.length === 0;

  function resetFilters() {
    setQ("");
    setSort("score");
    setScore("all");
    setRedFlags("all");
    setPipeline("all");
    setWork("all");
  }

  async function addToPipeline(e: MouseEvent, job: Job) {
    e.stopPropagation();
    if (job.application || pipelineBusy) return;
    setPipelineBusy(job.id);
    try {
      await api("/applications", {
        method: "POST",
        body: JSON.stringify({ jobId: job.id, status: "TO_APPLY" }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'ajouter au pipeline");
    } finally {
      setPipelineBusy(null);
    }
  }

  return (
    <div className="fade-in">
      <div className="flex flex-col gap-4 border-b border-[var(--hairline)] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <p className="label">Registre</p>
          <h1 className="mt-1 text-3xl sm:text-4xl">Offres</h1>
          <p className="mt-2 text-[var(--ink-soft)]">
            Toutes vos offres analysées, triées par score
          </p>
          {!loading && (
            <p className="mono mt-3 text-sm text-[var(--ink-soft)]">
              {filtered.length === jobs.length
                ? `${jobs.length} offre${jobs.length !== 1 ? "s" : ""}`
                : `${filtered.length} / ${jobs.length} offres`}
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn btn-amber hidden self-start lg:inline-flex"
          onClick={openAnalyze}
        >
          + Nouvelle offre
        </button>
      </div>

      {!trulyEmpty && (
        <div className="mt-5 space-y-3 border-b border-[var(--hairline)] pb-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
            <input
              className="field lg:col-span-5"
              placeholder="Rechercher un poste ou une entreprise"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              className="field lg:col-span-2"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Trier par"
            >
              <option value="score">Tri : score</option>
              <option value="date">Tri : date d’ajout</option>
              <option value="salary">Tri : salaire</option>
            </select>
            <select
              className="field lg:col-span-2"
              value={score}
              onChange={(e) => setScore(e.target.value as ScoreFilter)}
              aria-label="Score minimum"
            >
              <option value="all">Score : tous</option>
              <option value="80">Score : 80+</option>
              <option value="60">Score : 60+</option>
            </select>
            <select
              className="field lg:col-span-3"
              value={pipeline}
              onChange={(e) => setPipeline(e.target.value as PipelineFilter)}
              aria-label="Statut pipeline"
            >
              <option value="all">Pipeline : tous</option>
              <option value="out">Pas encore traitée</option>
              <option value="in">Déjà ajoutée</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              className="field !w-auto min-w-[10rem]"
              value={redFlags}
              onChange={(e) => setRedFlags(e.target.value as RedFlagFilter)}
              aria-label="Red flags"
            >
              <option value="all">Red flags : tous</option>
              <option value="yes">Avec red flags</option>
              <option value="no">Sans red flags</option>
            </select>
            <select
              className="field !w-auto min-w-[10rem]"
              value={work}
              onChange={(e) => setWork(e.target.value as WorkMode)}
              aria-label="Mode de travail"
            >
              <option value="all">Lieu : tous</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybride</option>
              <option value="onsite">Sur site</option>
            </select>
            {activeFilters && (
              <button type="button" className="btn btn-ghost !text-xs" onClick={resetFilters}>
                Réinitialiser les filtres
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 text-sm" style={{ color: "var(--brick)" }} role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-10 label">Chargement du registre…</p>
      ) : trulyEmpty ? (
        <div className="mt-12 max-w-lg">
          <p className="text-lg text-[var(--ink)]">
            Ajoutez votre première offre pour voir votre score de correspondance.
          </p>
          <button type="button" className="btn btn-amber mt-5 inline-flex" onClick={openAnalyze}>
            Analyser une nouvelle offre
          </button>
        </div>
      ) : filterEmpty ? (
        <div className="mt-12 max-w-lg">
          <p className="text-lg text-[var(--ink)]">Aucune offre ne correspond à ces filtres.</p>
          <button type="button" className="btn btn-ghost mt-5" onClick={resetFilters}>
            Réinitialiser les filtres
          </button>
        </div>
      ) : (
        <>
          <div className="board mt-8">
            <div
              className="board-head label hidden md:grid"
              style={{ gridTemplateColumns: "52px minmax(0,1fr) 100px minmax(120px,0.9fr) 128px" }}
            >
              <span>Score</span>
              <span>Offre / Société</span>
              <span>Salaire</span>
              <span>Red flags</span>
              <span>Action</span>
            </div>
            <ul>
              {visible.map((job, i) => {
                const flags = effectiveRedFlags(job);
                return (
                <li
                  key={job.id}
                  className="group fade-in"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    className="board-row cursor-pointer flex flex-col gap-2 md:grid md:items-center"
                    style={{ gridTemplateColumns: "52px minmax(0,1fr) 100px minmax(120px,0.9fr) 128px" }}
                    onClick={() => openOfferDetail(job)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openOfferDetail(job);
                      }
                    }}
                  >
                    <div className="flex items-start gap-3 md:contents">
                      <ScoreBadge score={job.analysis?.relevanceScore} />
                      <div className="min-w-0 flex-1">
                        <h2 className="display text-base font-semibold leading-snug sm:text-lg">
                          {job.title}
                        </h2>
                        <p className="mt-0.5 text-sm text-[var(--ink-soft)]">
                          {job.company}
                          {job.location ? ` · ${job.location}` : ""}
                        </p>
                        <p
                          className="mono mt-1 text-sm md:hidden"
                          style={{ color: job.salaryRaw ? "var(--ink)" : "var(--brick)" }}
                        >
                          {job.salaryRaw ?? "Salaire n/c"}
                        </p>
                        {flags.length > 0 ? (
                          <div className="md:hidden">
                            <RedFlagList flags={flags.slice(0, 2)} />
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <p
                      className="mono hidden text-sm md:block"
                      style={{ color: job.salaryRaw ? "var(--ink)" : "var(--brick)" }}
                    >
                      {job.salaryRaw ?? "n/c"}
                    </p>
                    <div className="hidden min-w-0 md:block">
                      {flags.length ? (
                        <span
                          className="label line-clamp-2"
                          style={{ color: "var(--brick)" }}
                          title={flags.join(" · ")}
                        >
                          {flags[0]}
                          {flags.length > 1 ? ` +${flags.length - 1}` : ""}
                        </span>
                      ) : (
                        <span className="text-sm text-[var(--ink-soft)]">—</span>
                      )}
                    </div>
                    <div className="flex items-center justify-start md:justify-end">
                      {job.application ? (
                        <span className="label text-[var(--match)]">Au pipeline</span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost !py-1 !text-xs whitespace-nowrap opacity-70 transition-opacity group-hover:opacity-100 focus:opacity-100"
                          disabled={pipelineBusy === job.id}
                          onClick={(e) => void addToPipeline(e, job)}
                        >
                          {pipelineBusy === job.id ? "…" : "+ Pipeline"}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
                );
              })}
            </ul>
          </div>

          {hasMore && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPage((p) => p + 1)}
              >
                Afficher plus ({filtered.length - visible.length} restantes)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
