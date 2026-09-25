import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchDashboard, type DashboardSummary } from "../lib/home";
import { useAnalyzeOffer } from "../components/AnalyzeOfferPanel";
import { RedFlagList, ScoreBadge } from "../components/ScoreBadge";
import { useLocale } from "../lib/i18n";

const CV_BANNER_DISMISS_KEY = "jobradar_cv_reminder_dismissed";

function readCvBannerDismissed(): boolean {
  try {
    return localStorage.getItem(CV_BANNER_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function DashboardPage() {
  const { t } = useLocale();
  const { openAnalyze } = useAnalyzeOffer();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cvBannerDismissed, setCvBannerDismissed] = useState(readCvBannerDismissed);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const summary = await fetchDashboard();
        if (!cancelled) {
          setData(summary);
          if (summary.hasCv) {
            try {
              localStorage.removeItem(CV_BANNER_DISMISS_KEY);
            } catch {
              // ignore
            }
            setCvBannerDismissed(false);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t("common.error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  if (loading) {
    return <p className="label">{t("dashboard.loading")}</p>;
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
  const showCvBanner = !data.hasCv && !cvBannerDismissed;

  function dismissCvBanner() {
    try {
      localStorage.setItem(CV_BANNER_DISMISS_KEY, "1");
    } catch {
      // ignore
    }
    setCvBannerDismissed(true);
  }

  return (
    <div className="fade-in space-y-10">
      {showCvBanner && (
        <div className="flex items-start gap-3 border border-[var(--amber)]/50 bg-[var(--row-hover)] px-4 py-3 sm:px-5">
          <p className="min-w-0 flex-1 text-sm text-[var(--ink)]">
            {t("dashboard.cvBanner")}{" "}
            <Link
              to="/onboarding"
              className="font-medium underline decoration-[var(--amber)] underline-offset-4"
            >
              {t("dashboard.cvBannerLink")}
            </Link>
          </p>
          <button
            type="button"
            className="shrink-0 text-xs text-[var(--ink)]/70 underline underline-offset-4 hover:text-[var(--ink)]"
            onClick={dismissCvBanner}
          >
            {t("dashboard.cvBannerLater")}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4 border-b border-[var(--hairline)] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <p className="label">{t("dashboard.eyebrow")}</p>
          <h1 className="mt-1 text-3xl sm:text-4xl">{t("dashboard.title")}</h1>
          <p className="mt-2 text-[var(--ink)]/75">{t("dashboard.subtitle")}</p>
          {stats.activityHint && (
            <p className="mt-3 text-sm" style={{ color: "var(--match)" }}>
              {stats.activityHint}
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn btn-amber !hidden self-start lg:!inline-flex"
          onClick={openAnalyze}
        >
          {t("dashboard.analyzeCta")}
        </button>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard label={t("dashboard.statAnalyzed")} value={String(stats.analyzedThisWeek)} />
        <StatCard
          label={t("dashboard.statAvgScore")}
          value={stats.avgScore != null ? `${stats.avgScore}` : "—"}
        />
        <StatCard label={t("dashboard.statAwaiting")} value={String(stats.awaitingResponse)} />
      </section>

      {isEmpty ? (
        <section className="border border-[var(--hairline)] px-5 py-10 max-lg:pr-20 sm:px-8">
          <h2 className="text-2xl">{t("dashboard.emptyTitle")}</h2>
          <p className="mt-3 max-w-lg text-[var(--ink)]/75">{t("dashboard.emptyBody")}</p>
          <button type="button" className="btn btn-amber mt-6 inline-flex" onClick={openAnalyze}>
            {t("dashboard.analyzeCta")}
          </button>
        </section>
      ) : (
        <>
          <section>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="label">{t("dashboard.priorityEyebrow")}</p>
                <h2 className="mt-1 text-2xl">{t("dashboard.priorityTitle")}</h2>
              </div>
              <Link
                to="/offers"
                className="text-sm underline decoration-[var(--amber)] underline-offset-4"
              >
                {t("dashboard.seeAll")}
              </Link>
            </div>
            {topOffers.length === 0 ? (
              <p className="text-[var(--ink)]/75">
                {t("dashboard.noTopOffers")}{" "}
                <button
                  type="button"
                  className="underline decoration-[var(--amber)]"
                  onClick={openAnalyze}
                >
                  {t("dashboard.analyzeLink")}
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
                        <p className="text-sm text-[var(--ink)]/70">{offer.company}</p>
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
                        {t("dashboard.generateLetter")}
                      </Link>
                      <Link to={`/offers/${offer.id}`} className="btn btn-ghost !text-xs">
                        {t("dashboard.open")}
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
                <p className="label">{t("dashboard.pipelineEyebrow")}</p>
                <h2 className="mt-1 text-2xl">{t("dashboard.pipelineTitle")}</h2>
              </div>
              <Link
                to="/pipeline"
                className="text-sm underline decoration-[var(--amber)] underline-offset-4"
              >
                {t("dashboard.pipelineFull")}
              </Link>
            </div>
            {pipelineFocus.length === 0 ? (
              <p className="text-[var(--ink)]/75">{t("dashboard.pipelineEmpty")}</p>
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
                          <span className="text-[var(--ink)]/70"> — {item.company}</span>
                        </p>
                        <p className="mt-1 text-sm text-[var(--ink)]/70">{item.hint}</p>
                      </div>
                      <span className="label shrink-0">
                        {item.status === "INTERVIEW"
                          ? t("dashboard.statusInterview")
                          : t("dashboard.statusFollowUp")}
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
