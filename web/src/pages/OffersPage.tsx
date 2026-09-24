import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
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

/** Nombre de filtres non-défaut (hors recherche). */
function activeFilterCount(f: {
  sort: SortKey;
  score: ScoreFilter;
  redFlags: RedFlagFilter;
  pipeline: PipelineFilter;
  work: WorkMode;
}) {
  let n = 0;
  if (f.sort !== "score") n += 1;
  if (f.score !== "all") n += 1;
  if (f.redFlags !== "all") n += 1;
  if (f.pipeline !== "all") n += 1;
  if (f.work !== "all") n += 1;
  return n;
}

function filtersDirty(f: {
  q: string;
  sort: SortKey;
  score: ScoreFilter;
  redFlags: RedFlagFilter;
  pipeline: PipelineFilter;
  work: WorkMode;
}) {
  return f.q.trim() !== "" || activeFilterCount(f) > 0;
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const wasOpen = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!filtersOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.dataset.mobileSheet = "1";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFiltersOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      delete document.body.dataset.mobileSheet;
      document.removeEventListener("keydown", onKey);
    };
  }, [filtersOpen]);

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
  const filterCount = activeFilterCount({ sort, score, redFlags, pipeline, work });
  const dirty = filtersDirty({ q, sort, score, redFlags, pipeline, work });
  const trulyEmpty = !loading && jobs.length === 0;
  const filterEmpty = !loading && jobs.length > 0 && filtered.length === 0;

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loading || filterEmpty || trulyEmpty) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setPage((p) => p + 1);
        }
      },
      { rootMargin: "200px 0px" }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, loading, filterEmpty, trulyEmpty, visible.length]);

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

  const filterFields = (
    <>
      <FilterSelect
        label="Tri"
        value={sort}
        onChange={(v) => setSort(v as SortKey)}
        options={[
          { value: "score", label: "Score" },
          { value: "date", label: "Date d’ajout" },
          { value: "salary", label: "Salaire" },
        ]}
      />
      <FilterSelect
        label="Score minimum"
        value={score}
        onChange={(v) => setScore(v as ScoreFilter)}
        options={[
          { value: "all", label: "Tous" },
          { value: "80", label: "80+" },
          { value: "60", label: "60+" },
        ]}
      />
      <FilterSelect
        label="Pipeline"
        value={pipeline}
        onChange={(v) => setPipeline(v as PipelineFilter)}
        options={[
          { value: "all", label: "Tous" },
          { value: "out", label: "Pas encore traitée" },
          { value: "in", label: "Déjà ajoutée" },
        ]}
      />
      <FilterSelect
        label="Red flags"
        value={redFlags}
        onChange={(v) => setRedFlags(v as RedFlagFilter)}
        options={[
          { value: "all", label: "Tous" },
          { value: "yes", label: "Avec red flags" },
          { value: "no", label: "Sans red flags" },
        ]}
      />
      <FilterSelect
        label="Lieu"
        value={work}
        onChange={(v) => setWork(v as WorkMode)}
        options={[
          { value: "all", label: "Tous" },
          { value: "remote", label: "Remote" },
          { value: "hybrid", label: "Hybride" },
          { value: "onsite", label: "Sur site" },
        ]}
      />
    </>
  );

  return (
    <div className="fade-in">
      <div className="flex flex-col gap-4 border-b border-[var(--hairline)] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <p className="label">Registre</p>
          <h1 className="mt-1 text-3xl sm:text-4xl">Offres</h1>
          <p className="mt-2 text-[var(--ink)]/75">
            Toutes vos offres analysées, triées par score
          </p>
          {!loading && (
            <p className="mono mt-3 text-sm text-[var(--ink)]/70">
              {filtered.length === jobs.length
                ? `${jobs.length} offre${jobs.length !== 1 ? "s" : ""}`
                : `${filtered.length} / ${jobs.length} offres`}
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn btn-amber !hidden self-start lg:!inline-flex"
          onClick={openAnalyze}
        >
          + Nouvelle offre
        </button>
      </div>

      {!trulyEmpty && (
        <div className="mt-5 border-b border-[var(--hairline)] pb-5">
          {/* Mobile — recherche + Filtrer */}
          <div className="flex gap-2 md:hidden">
            <input
              className="field min-w-0 flex-1"
              placeholder="Rechercher un poste ou une entreprise"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-ghost shrink-0 !px-3 !text-xs"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen(true)}
            >
              {filterCount > 0 ? `Filtrer · ${filterCount}` : "Filtrer"}
            </button>
          </div>

          {/* Desktop — filtres inline */}
          <div className="hidden space-y-3 md:block">
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
              {dirty && (
                <button type="button" className="btn btn-ghost !text-xs" onClick={resetFilters}>
                  Réinitialiser les filtres
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {filtersOpen && (
        <FiltersSheet
          onClose={() => setFiltersOpen(false)}
          onReset={() => {
            resetFilters();
          }}
          dirty={filterCount > 0 || q.trim() !== ""}
        >
          {filterFields}
        </FiltersSheet>
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
          {/* Mobile — cartes registre */}
          <ul className="mt-6 divide-y divide-[var(--hairline)] border-y border-[var(--ink)] md:hidden">
            {visible.map((job, i) => {
              const flags = effectiveRedFlags(job);
              return (
                <li
                  key={job.id}
                  className="fade-in"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                >
                  <button
                    type="button"
                    className="flex w-full flex-col gap-2 px-0 py-4 text-left transition-colors active:bg-[var(--row-hover)]"
                    onClick={() => openOfferDetail(job)}
                  >
                    <div className="flex items-start gap-3">
                      <ScoreBadge score={job.analysis?.relevanceScore} />
                      <div className="min-w-0 flex-1">
                        <h2 className="display text-base font-semibold leading-snug">
                          {job.title}
                        </h2>
                        <p className="mt-0.5 text-sm text-[var(--ink)]/70">{job.company}</p>
                      </div>
                    </div>
                    <p
                      className="mono pl-[3.5rem] text-sm"
                      style={{ color: job.salaryRaw ? "var(--ink)" : "var(--brick)" }}
                    >
                      {job.salaryRaw ?? "Salaire n/c"}
                      {job.location ? (
                        <span className="text-[var(--ink)]/70"> · {job.location}</span>
                      ) : null}
                    </p>
                    {flags.length > 0 ? (
                      <div className="pl-[3.5rem]">
                        <RedFlagList flags={flags.slice(0, 3)} />
                      </div>
                    ) : null}
                    {job.application ? (
                      <p className="label pl-[3.5rem] text-[var(--match)]">Au pipeline</p>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Desktop — tableau */}
          <div className="board mt-8 hidden md:block">
            <div
              className="board-head label grid"
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
                      className="board-row grid cursor-pointer items-center"
                      style={{
                        gridTemplateColumns: "52px minmax(0,1fr) 100px minmax(120px,0.9fr) 128px",
                      }}
                      onClick={() => openOfferDetail(job)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openOfferDetail(job);
                        }
                      }}
                    >
                      <ScoreBadge score={job.analysis?.relevanceScore} />
                      <div className="min-w-0">
                        <h2 className="display text-lg font-semibold leading-snug">{job.title}</h2>
                        <p className="mt-0.5 text-sm text-[var(--ink)]/70">
                          {job.company}
                          {job.location ? ` · ${job.location}` : ""}
                        </p>
                      </div>
                      <p
                        className="mono text-sm"
                        style={{ color: job.salaryRaw ? "var(--ink)" : "var(--brick)" }}
                      >
                        {job.salaryRaw ?? "n/c"}
                      </p>
                      <div className="min-w-0">
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
                          <span className="text-sm text-[var(--ink)]/70">—</span>
                        )}
                      </div>
                      <div className="flex items-center justify-end">
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

          {hasMore && <div ref={sentinelRef} className="h-8" aria-hidden />}
        </>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label mb-1.5 block">
        {label}
      </label>
      <select
        id={id}
        className="field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function FiltersSheet({
  children,
  onClose,
  onReset,
  dirty,
}: {
  children: ReactNode;
  onClose: () => void;
  onReset: () => void;
  dirty: boolean;
}) {
  const panelId = useId();

  return createPortal(
    <div className="fixed inset-0 z-[60] md:hidden" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-[var(--paper-deep)]/70"
        aria-label="Fermer les filtres"
        onClick={onClose}
      />
      <div
        id={panelId}
        role="dialog"
        aria-modal="true"
        aria-label="Filtres des offres"
        className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col border-t border-[var(--ink)] bg-[var(--paper-lift)] shadow-lg"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-auto mb-1 mt-2 h-1 w-10 shrink-0 rounded-full bg-[var(--hairline)]" aria-hidden />
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3">
          <p className="label">Filtres</p>
          <div className="flex items-center gap-3">
            {dirty && (
              <button
                type="button"
                className="text-xs text-[var(--ink)]/70 underline underline-offset-4"
                onClick={onReset}
              >
                Réinitialiser
              </button>
            )}
            <button type="button" className="btn btn-ghost !py-1.5 !text-xs" onClick={onClose}>
              Fermer
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">{children}</div>
        <div className="shrink-0 border-t border-[var(--hairline)] px-4 py-3">
          <button type="button" className="btn btn-amber w-full" onClick={onClose}>
            Voir les résultats
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
