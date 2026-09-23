import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchDashboard, type DashboardSummary } from "../lib/home";
import { useAnalyzeOffer } from "../components/AnalyzeOfferPanel";
import { RedFlagList, ScoreBadge } from "../components/ScoreBadge";

export function DashboardPage() {
  const { openAnalyze } = useAnalyzeOffer();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const summary = await fetchDashboard();
        if (!cancelled) setData(summary);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erreur");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="label">Chargement du tableau de bord…</p>;
  }
  if (error) {
    return (
      <p className="text-sm" style={{ color: "var(--brick)" }}>
        {error}
      </p>
    );
  }
  if (!data) return null;

  const { stats, topOffers, pipelineFocus } = data;
  const isEmpty = stats.totalAnalyses === 0 && topOffers.length === 0;
  const needsCv = !data.hasCv;

  return (
    <div className="fade-in space-y-10">
      {needsCv && (
        <div className="border border-[var(--amber)]/50 bg-[var(--row-hover)] px-4 py-3 sm:px-5">
          <p className="text-sm text-[var(--ink)]">
            Importez votre CV pour débloquer des scores fiables.{" "}
            <Link
              to="/onboarding"
              className="font-medium underline decoration-[var(--amber)] underline-offset-4"
            >
              Continuer l’import
            </Link>
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4 border-b border-[var(--hairline)] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <p className="label">Tour de contrôle</p>
          <h1 className="mt-1 text-3xl sm:text-4xl">Tableau de bord</h1>
          <p className="mt-2 text-[var(--ink-soft)]">
            Où vous en êtes — et la prochaine action utile.
          </p>
          {stats.activityHint && (
            <p className="mt-3 text-sm" style={{ color: "var(--match)" }}>
              {stats.activityHint}
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn btn-amber self-start sm:self-auto"
          onClick={openAnalyze}
        >
          Analyser une nouvelle offre
        </button>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Analysées cette semaine"
          value={String(stats.analyzedThisWeek)}
        />
        <StatCard
          label="Score moyen"
          value={stats.avgScore != null ? `${stats.avgScore}` : "—"}
        />
        <StatCard
          label="En attente de réponse"
          value={String(stats.awaitingResponse)}
        />
      </section>

      {isEmpty ? (
        <section className="border border-[var(--hairline)] px-5 py-10 sm:px-8">
          <h2 className="text-2xl">Prêt à démarrer</h2>
          <p className="mt-3 max-w-lg text-[var(--ink-soft)]">
            Ajoutez votre première offre pour voir votre score de correspondance et construire votre
            pipeline.
          </p>
          <button type="button" className="btn btn-amber mt-6 inline-flex" onClick={openAnalyze}>
            Analyser une nouvelle offre
          </button>
        </section>
      ) : (
        <>
          <section>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="label">Priorité</p>
                <h2 className="mt-1 text-2xl">Offres qui méritent votre attention</h2>
              </div>
              <Link
                to="/offers"
                className="text-sm underline decoration-[var(--amber)] underline-offset-4"
              >
                Voir toutes
              </Link>
            </div>
            {topOffers.length === 0 ? (
              <p className="text-[var(--ink-soft)]">
                Aucune offre « à postuler » à fort score pour le moment.{" "}
                <button
                  type="button"
                  className="underline decoration-[var(--amber)]"
                  onClick={openAnalyze}
                >
                  Analysez une offre
                </button>
                .
              </p>
            ) : (
              <ul className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
                {topOffers.map((offer, i) => (
                  <li
                    key={offer.id}
                    className="fade-in flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <div className="flex min-w-0 items-start gap-4">
                      <ScoreBadge score={offer.relevanceScore} />
                      <div className="min-w-0">
                        <h3 className="display text-lg font-semibold leading-snug">{offer.title}</h3>
                        <p className="text-sm text-[var(--ink-soft)]">{offer.company}</p>
                        {offer.summary && (
                          <p className="mt-2 line-clamp-2 text-sm text-[var(--ink)]/80">
                            {offer.summary}
                          </p>
                        )}
                        <RedFlagList flags={offer.redFlags} />
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
                      <Link to={`/offers/${offer.id}`} className="btn btn-amber !text-xs">
                        Générer la lettre
                      </Link>
                      <Link to={`/offers/${offer.id}`} className="btn btn-ghost !text-xs">
                        Ouvrir
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="label">Pipeline</p>
                <h2 className="mt-1 text-2xl">En cours</h2>
              </div>
              <Link
                to="/pipeline"
                className="text-sm underline decoration-[var(--amber)] underline-offset-4"
              >
                Pipeline complet
              </Link>
            </div>
            {pipelineFocus.length === 0 ? (
              <p className="text-[var(--ink-soft)]">
                Pas encore de candidature en mouvement. Passez une offre en « Candidaté » ou
                « Entretien » depuis le pipeline.
              </p>
            ) : (
              <ul className="space-y-3">
                {pipelineFocus.map((item) => (
                  <li key={item.id}>
                    <Link
                      to={`/offers/${item.jobId}`}
                      className="flex flex-col gap-1 border border-[var(--hairline)] px-4 py-3 transition-colors hover:bg-[var(--row-hover)] sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium">
                          {item.title}
                          <span className="text-[var(--ink-soft)]"> — {item.company}</span>
                        </p>
                        <p className="mt-1 text-sm text-[var(--ink-soft)]">{item.hint}</p>
                      </div>
                      <span className="label shrink-0">
                        {item.status === "INTERVIEW" ? "Entretien" : "Relance"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--hairline)] px-4 py-4">
      <p className="label">{label}</p>
      <p className="display mt-2 text-3xl tabular-nums">{value}</p>
    </div>
  );
}
