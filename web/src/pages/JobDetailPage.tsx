import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Job } from "../lib/api";
import { useAuth } from "../lib/auth";
import { CoverLetterPanel } from "../components/CoverLetterPanel";
import { RedFlagList, ScoreBadge } from "../components/ScoreBadge";

export function JobDetailPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [coverLetter, setCoverLetter] = useState<string | null>(null);
  const [letterOpen, setLetterOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    if (!token || !id) return;
    const data = await api<Job>(`/offers/${id}`, { token });
    setJob(data);
    setCoverLetter(data.application?.coverLetter ?? null);
  }

  useEffect(() => {
    reload().catch((err) => setError(err.message));
  }, [token, id]);

  async function analyze() {
    if (!token || !id) return;
    setBusy("analyze");
    setError(null);
    try {
      await api(`/offers/${id}/analyze`, { method: "POST", token, body: "{}" });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur analyse");
    } finally {
      setBusy(null);
    }
  }

  async function addToPipeline() {
    if (!token || !id) return;
    setBusy("pipeline");
    setError(null);
    try {
      await api("/applications", {
        method: "POST",
        token,
        body: JSON.stringify({ jobId: id, status: "TO_APPLY" }),
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  if (!job) {
    return <p className="label">{error ?? "Chargement…"}</p>;
  }

  return (
    <div className="fade-in max-w-3xl">
      <Link to="/dashboard" className="label hover:text-[var(--ink)]">
        ← Tableau d'affichage
      </Link>

      <div className="mt-5 flex items-start gap-4 border-b border-[var(--ink)] pb-6">
        <ScoreBadge score={job.analysis?.relevanceScore} size={56} />
        <div>
          <h1 className="text-3xl leading-tight sm:text-4xl">{job.title}</h1>
          <p className="mt-2 text-[var(--ink-soft)]">
            {job.company}
            {job.location ? ` · ${job.location}` : ""}
          </p>
          <p
            className="mono mt-1 text-sm"
            style={{ color: job.salaryRaw ? "var(--amber)" : "var(--brick)" }}
          >
            {job.salaryRaw ?? "Salaire non communiqué"}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <ActionBtn onClick={() => void analyze()} disabled={!!busy}>
          {busy === "analyze" ? "Analyse…" : "Analyser"}
        </ActionBtn>
        <ActionBtn onClick={() => setLetterOpen(true)} disabled={!!busy} variant="ghost">
          {coverLetter ? "Voir la lettre" : "Lettre"}
        </ActionBtn>
        <ActionBtn onClick={() => void addToPipeline()} disabled={!!busy} variant="ghost">
          {job.application ? "Dans le pipeline" : "Au pipeline"}
        </ActionBtn>
        {job.url && (
          <a href={job.url} target="_blank" rel="noreferrer" className="btn btn-ghost">
            Offre source
          </a>
        )}
      </div>

      {error && (
        <p className="mt-4 text-sm" style={{ color: "var(--brick)" }}>
          {error}
        </p>
      )}

      {job.analysis && (
        <section className="panel mt-6">
          <p className="label">Instrument · analyse</p>
          <h2 className="mt-1 text-xl">Lecture IA</h2>
          <p className="mt-3 leading-relaxed text-[var(--ink)]/90">{job.analysis.summary}</p>
          {(job.analysis.strengths?.length || job.analysis.gaps?.length) && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="label" style={{ color: "var(--match)" }}>
                  Points forts
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {(job.analysis.strengths ?? []).map((s) => (
                    <li key={s}>• {s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="label" style={{ color: "var(--amber)" }}>
                  Écarts
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {(job.analysis.gaps ?? []).map((g) => (
                    <li key={g}>• {g}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <RedFlagList flags={job.analysis.redFlags} />
          <dl className="mt-5 grid gap-4 border-t border-[var(--hairline)] pt-4 sm:grid-cols-3">
            <div>
              <dt className="label">Salaire</dt>
              <dd className="mono mt-1 text-sm">{job.analysis.extractedSalary ?? "—"}</dd>
            </div>
            <div>
              <dt className="label">Séniorité</dt>
              <dd className="mono mt-1 text-sm">{job.analysis.extractedSeniority ?? "—"}</dd>
            </div>
            <div>
              <dt className="label">Stack</dt>
              <dd className="mono mt-1 text-sm">{job.analysis.extractedStack.join(" · ") || "—"}</dd>
            </div>
          </dl>
        </section>
      )}

      {coverLetter && (
        <section className="panel">
          <p className="label">Brouillon</p>
          <h2 className="mt-1 text-xl">Lettre de motivation</h2>
          <pre className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap font-[var(--font-body)] text-sm leading-relaxed text-[var(--ink)]/90">
            {coverLetter.slice(0, 400)}
            {coverLetter.length > 400 ? "…" : ""}
          </pre>
          <button
            type="button"
            className="btn btn-ghost mt-3 !text-xs"
            onClick={() => setLetterOpen(true)}
          >
            Ouvrir l’éditeur
          </button>
        </section>
      )}

      <section className="panel">
        <p className="label">Source</p>
        <h2 className="mt-1 text-xl">Description</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--ink)]/85">
          {job.description}
        </p>
      </section>

      <CoverLetterPanel
        open={letterOpen}
        onClose={() => setLetterOpen(false)}
        job={job}
        initialLetter={coverLetter}
        applicationId={job.application?.id ?? null}
        onSaved={(nextLetter, application) => {
          setCoverLetter(nextLetter);
          if (application) {
            setJob({ ...job, application });
          }
        }}
      />
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled,
  variant = "solid",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "solid" | "ghost";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`btn ${variant === "ghost" ? "btn-ghost" : "btn-amber"}`}
    >
      {children}
    </button>
  );
}
