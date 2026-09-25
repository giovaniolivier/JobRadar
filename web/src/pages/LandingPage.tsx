import { Link } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";
import { ScoreBadge } from "../components/ScoreBadge";
import { useLocale } from "../lib/i18n";

export function LandingPage() {
  const { t } = useLocale();

  const STEPS = [
    { n: "01", title: t("landing.step1Title"), text: t("landing.step1Text") },
    { n: "02", title: t("landing.step2Title"), text: t("landing.step2Text") },
    { n: "03", title: t("landing.step3Title"), text: t("landing.step3Text") },
    { n: "04", title: t("landing.step4Title"), text: t("landing.step4Text") },
  ] as const;

  const DEMO_OFFERS = [
    { title: t("landing.demo1Title"), company: t("landing.demo1Company"), score: 88, flag: null },
    {
      title: t("landing.demo2Title"),
      company: t("landing.demo2Company"),
      score: 72,
      flag: t("landing.demo2Flag"),
    },
    {
      title: t("landing.demo3Title"),
      company: t("landing.demo3Company"),
      score: 41,
      flag: t("landing.demo3Flag"),
    },
  ] as const;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-[var(--ink)] bg-[var(--paper)]/95 backdrop-blur-[2px]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6 lg:py-3">
          <BrandLogo to="/" size="md" lockup="full" />
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/login"
              className="text-sm text-[var(--ink-soft)] underline-offset-4 hover:text-[var(--ink)] hover:underline"
            >
              {t("landing.login")}
            </Link>
            <Link to="/register" className="btn btn-amber !py-2 !text-sm">
              {t("landing.register")}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero — une composition ; empilé sous ~1280px pour garder l’aperçu lisible */}
      <section className="relative overflow-hidden border-b border-[var(--ink)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_70%_20%,var(--glow-amber),transparent_55%)]" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-16 xl:grid-cols-2 xl:items-center xl:gap-14 xl:py-20">
          <div className="landing-fade min-w-0">
            <p className="label">{t("landing.brand")}</p>
            <h1 className="mt-3 max-w-xl text-3xl leading-[1.12] sm:text-4xl lg:text-[2.65rem]">
              {t("landing.heroTitle")}
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-[var(--ink-soft)] sm:text-lg">
              {t("landing.heroSubtitle")}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link to="/register" className="btn btn-amber !px-5 !py-2.5 !text-sm sm:!text-base">
                {t("landing.ctaFree")}
              </Link>
              <a
                href="#comment-ca-marche"
                className="text-sm text-[var(--ink-soft)] underline decoration-[var(--amber)] underline-offset-4 hover:text-[var(--ink)]"
              >
                {t("landing.howItWorksLink")}
              </a>
            </div>
          </div>

          <div className="landing-fade-delay mx-auto w-full min-w-0 max-w-lg xl:mx-0 xl:max-w-none" aria-hidden>
            <InstrumentPreview demoOffers={DEMO_OFFERS} />
          </div>
        </div>
      </section>

      {/* Comment ça marche */}
      <section id="comment-ca-marche" className="scroll-mt-20 border-b border-[var(--hairline)]">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
          <p className="label">{t("landing.howEyebrow")}</p>
          <h2 className="mt-2 text-2xl sm:text-3xl">{t("landing.howTitle")}</h2>
          <p className="mt-2 max-w-xl text-[var(--ink-soft)]">{t("landing.howSubtitle")}</p>

          <ol className="mt-10 grid gap-8 sm:grid-cols-2 xl:grid-cols-4 xl:gap-6">
            {STEPS.map((step, i) => (
              <li
                key={step.n}
                className="landing-step flex flex-col border-t border-[var(--ink)] pt-4"
                style={{ animationDelay: `${120 + i * 80}ms` }}
              >
                <p className="mono text-xs text-[var(--amber)]">{step.n}</p>
                <h3 className="mt-2 text-lg leading-snug">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">{step.text}</p>
                {i === 1 && <StepPasteMock />}
                {i === 2 && <StepScoreMock />}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Preuve / valeur */}
      <section className="border-b border-[var(--hairline)]">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
          <p className="label">{t("landing.valueEyebrow")}</p>
          <h2 className="mt-2 max-w-2xl text-2xl sm:text-3xl">{t("landing.valueTitle")}</h2>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2">
            <li className="border-l-2 border-[var(--amber)] pl-4">
              <p className="text-lg leading-snug">{t("landing.value1Title")}</p>
              <p className="mt-2 text-sm text-[var(--ink-soft)]">{t("landing.value1Text")}</p>
            </li>
            <li className="border-l-2 border-[var(--match)] pl-4">
              <p className="text-lg leading-snug">{t("landing.value2Title")}</p>
              <p className="mt-2 text-sm text-[var(--ink-soft)]">{t("landing.value2Text")}</p>
            </li>
          </ul>
          <p className="mt-8 max-w-2xl text-sm italic text-[var(--ink-soft)]">
            {t("landing.testimonial")}
          </p>
        </div>
      </section>

      {/* Confiance */}
      <section className="border-b border-[var(--hairline)]">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <p className="label">{t("landing.trustEyebrow")}</p>
          <h2 className="mt-2 text-xl sm:text-2xl">{t("landing.trustTitle")}</h2>
          <p className="mt-3 max-w-2xl text-[var(--ink-soft)]">{t("landing.trustBody")}</p>
          <Link
            to="/legal/privacy"
            className="mt-4 inline-block text-sm underline decoration-[var(--amber)] underline-offset-4"
          >
            {t("landing.privacyLink")}
          </Link>
        </div>
      </section>

      {/* CTA final */}
      <section className="border-b border-[var(--ink)]">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-5 px-4 py-14 sm:px-6 sm:py-16 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl sm:text-3xl">{t("landing.finalTitle")}</h2>
            <p className="mt-2 text-[var(--ink-soft)]">{t("landing.finalSubtitle")}</p>
          </div>
          <Link to="/register" className="btn btn-amber shrink-0 !px-5 !py-2.5">
            {t("landing.finalCta")}
          </Link>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-[var(--ink-soft)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="mono text-xs">{t("landing.brand")}</p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          <Link to="/legal/cgu" className="hover:text-[var(--ink)] hover:underline underline-offset-4">
            {t("legal.cgu")}
          </Link>
          <Link
            to="/legal/privacy"
            className="hover:text-[var(--ink)] hover:underline underline-offset-4"
          >
            {t("legal.privacy")}
          </Link>
          <Link
            to="/legal/mentions"
            className="hover:text-[var(--ink)] hover:underline underline-offset-4"
          >
            {t("legal.mentions")}
          </Link>
          <a
            href="mailto:hello@jobradar.app"
            className="hover:text-[var(--ink)] hover:underline underline-offset-4"
          >
            {t("common.contact")}
          </a>
        </nav>
      </footer>
    </div>
  );
}

function StepPasteMock() {
  const { t } = useLocale();
  return (
    <div className="mt-auto pt-4" aria-hidden>
      <div className="border border-dashed border-[var(--hairline)] bg-[var(--paper-lift)] px-3 py-3 sm:px-3.5 sm:py-3.5">
        <p className="label mb-2">{t("landing.mockOfferLabel")}</p>
        <p className="font-[var(--font-body)] text-sm leading-snug text-[var(--ink-soft)]">
          {t("landing.mockOfferPlaceholder")}
        </p>
        <p
          className="mono mt-3 text-right text-[0.7rem] tabular-nums text-[var(--ink-soft)]"
          title="Minimum 80 caractères (illustration)"
        >
          {t("landing.mockCounter")}
        </p>
      </div>
    </div>
  );
}

function StepScoreMock() {
  const { t } = useLocale();
  return (
    <div className="mt-auto pt-4" aria-hidden>
      <div className="flex items-center gap-3 border border-[var(--hairline)] bg-[var(--paper-lift)] px-3 py-3 sm:gap-3.5 sm:px-3.5">
        <ScoreBadge score={88} size={52} />
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug text-[var(--ink)]">{t("landing.mockScore")}</p>
          <p className="mt-0.5 text-xs leading-snug text-[var(--ink-soft)]">
            {t("landing.mockScoreHint")}
          </p>
        </div>
      </div>
    </div>
  );
}

function InstrumentPreview({
  demoOffers,
}: {
  demoOffers: readonly { title: string; company: string; score: number; flag: string | null }[];
}) {
  const { t } = useLocale();
  return (
    <div className="border border-[var(--ink)] bg-[var(--paper-lift)] shadow-[8px_8px_0_0_color-mix(in_srgb,var(--ink)_12%,transparent)]">
      <div className="flex items-center justify-between border-b border-[var(--hairline)] px-4 py-2.5">
        <p className="label">{t("landing.previewLabel")}</p>
        <p className="mono text-[0.65rem] text-[var(--ink-soft)]">{t("landing.previewBadge")}</p>
      </div>
      <ul className="divide-y divide-[var(--hairline)]">
        {demoOffers.map((offer, i) => (
          <li
            key={offer.title}
            className="flex items-center gap-3 px-4 py-3 landing-row sm:gap-3.5 sm:py-3.5"
            style={{ animationDelay: `${200 + i * 90}ms` }}
          >
            <ScoreBadge score={offer.score} size={48} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-snug">{offer.title}</p>
              <p className="truncate text-xs text-[var(--ink-soft)]">{offer.company}</p>
              {offer.flag && (
                <p className="mt-1 text-[0.7rem] sm:text-xs" style={{ color: "var(--brick)" }}>
                  {offer.flag}
                </p>
              )}
            </div>
            <span className="mono shrink-0 text-xs tabular-nums text-[var(--ink-soft)]">
              {offer.score}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
