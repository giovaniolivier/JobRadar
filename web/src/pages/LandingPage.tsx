import { Link } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";
import { ScoreBadge } from "../components/ScoreBadge";

const STEPS = [
  {
    n: "01",
    title: "Importez votre CV",
    text: "Une base claire pour comparer chaque annonce à votre vrai profil — pas à une fiction générique.",
  },
  {
    n: "02",
    title: "Collez une offre qui vous intéresse",
    text: "Texte, lien ou fichier : vous gardez la source, JobRadar lit le contenu.",
  },
  {
    n: "03",
    title: "Obtenez un score et les points à surveiller",
    text: "Correspondance, écarts, red flags (salaire flou, expérience irréaliste) — en un coup d’œil.",
  },
  {
    n: "04",
    title: "Suivez vos candidatures au même endroit",
    text: "Du « à postuler » à la réponse, avec relances et lettres au fil du pipeline.",
  },
] as const;

const DEMO_OFFERS = [
  { title: "Développeur front-end React", company: "Lumen Atelier", score: 88, flag: null },
  { title: "Full-stack (React / Node)", company: "NovaTech", score: 72, flag: "Salaire non précisé" },
  { title: "Ingénieur logiciel senior", company: "Atlas Digital", score: 41, flag: "Expérience irréaliste" },
] as const;

export function LandingPage() {
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
              Se connecter
            </Link>
            <Link to="/register" className="btn btn-amber !py-2 !text-sm">
              Créer un compte
            </Link>
          </div>
        </div>
      </header>

      {/* Hero — une composition ; empilé sous ~1280px pour garder l’aperçu lisible */}
      <section className="relative overflow-hidden border-b border-[var(--ink)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_70%_20%,var(--glow-amber),transparent_55%)]" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-16 xl:grid-cols-2 xl:items-center xl:gap-14 xl:py-20">
          <div className="landing-fade min-w-0">
            <p className="label">JobRadar</p>
            <h1 className="mt-3 max-w-xl text-3xl leading-[1.12] sm:text-4xl lg:text-[2.65rem]">
              Arrêtez de deviner. Sachez en un coup d’œil quelles offres valent vraiment le coup.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-[var(--ink-soft)] sm:text-lg">
              JobRadar compare chaque offre à votre CV, détecte les signaux d’alerte, et vous aide à
              répondre plus vite.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link to="/register" className="btn btn-amber !px-5 !py-2.5 !text-sm sm:!text-base">
                Créer un compte gratuitement
              </Link>
              <a
                href="#comment-ca-marche"
                className="text-sm text-[var(--ink-soft)] underline decoration-[var(--amber)] underline-offset-4 hover:text-[var(--ink)]"
              >
                Voir comment ça marche
              </a>
            </div>
          </div>

          <div className="landing-fade-delay mx-auto w-full min-w-0 max-w-lg xl:mx-0 xl:max-w-none" aria-hidden>
            <InstrumentPreview />
          </div>
        </div>
      </section>

      {/* Comment ça marche */}
      <section id="comment-ca-marche" className="scroll-mt-20 border-b border-[var(--hairline)]">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
          <p className="label">Parcours</p>
          <h2 className="mt-2 text-2xl sm:text-3xl">Comment ça marche</h2>
          <p className="mt-2 max-w-xl text-[var(--ink-soft)]">
            Quatre gestes, le même fil que dans l’app — sans jargon.
          </p>

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
          <p className="label">Ce que ça change</p>
          <h2 className="mt-2 max-w-2xl text-2xl sm:text-3xl">
            Moins de temps perdu sur des annonces qui ne collent pas
          </h2>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2">
            <li className="border-l-2 border-[var(--amber)] pl-4">
              <p className="text-lg leading-snug">
                Repérez en 10 secondes un salaire non précisé ou une expérience irréaliste demandée.
              </p>
              <p className="mt-2 text-sm text-[var(--ink-soft)]">
                Les red flags remontent à côté du score — avant que vous n’investissiez une soirée.
              </p>
            </li>
            <li className="border-l-2 border-[var(--match)] pl-4">
              <p className="text-lg leading-snug">
                Priorisez les offres où votre profil pèse vraiment, et avancez dans un seul pipeline.
              </p>
              <p className="mt-2 text-sm text-[var(--ink-soft)]">
                Analyse, lettre, relance : le fil reste visible sans tableur parallèle.
              </p>
            </li>
          </ul>
          <p className="mt-8 max-w-2xl text-sm italic text-[var(--ink-soft)]">
            Exemple d’usage (illustratif) — « En recherche active, j’ouvre JobRadar pour trier ce qui
            mérite une candidature ce soir, plutôt que de tout coller dans un tableur. »
          </p>
        </div>
      </section>

      {/* Confiance */}
      <section className="border-b border-[var(--hairline)]">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <p className="label">Données</p>
          <h2 className="mt-2 text-xl sm:text-2xl">Votre CV reste privé</h2>
          <p className="mt-3 max-w-2xl text-[var(--ink-soft)]">
            Jamais partagé avec des recruteurs, ni vendu à des tiers. Il sert uniquement à
            personnaliser vos analyses dans votre compte.
          </p>
          <Link
            to="/legal/privacy"
            className="mt-4 inline-block text-sm underline decoration-[var(--amber)] underline-offset-4"
          >
            Politique de confidentialité
          </Link>
        </div>
      </section>

      {/* CTA final */}
      <section className="border-b border-[var(--ink)]">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-5 px-4 py-14 sm:px-6 sm:py-16 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl sm:text-3xl">Prêt à scorer votre prochaine offre ?</h2>
            <p className="mt-2 text-[var(--ink-soft)]">
              Compte gratuit — email et mot de passe, puis votre CV.
            </p>
          </div>
          <Link to="/register" className="btn btn-amber shrink-0 !px-5 !py-2.5">
            Commencer gratuitement
          </Link>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-[var(--ink-soft)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="mono text-xs">JobRadar</p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          <Link to="/legal/cgu" className="hover:text-[var(--ink)] hover:underline underline-offset-4">
            CGU
          </Link>
          <Link
            to="/legal/privacy"
            className="hover:text-[var(--ink)] hover:underline underline-offset-4"
          >
            Confidentialité
          </Link>
          <a
            href="mailto:hello@jobradar.app"
            className="hover:text-[var(--ink)] hover:underline underline-offset-4"
          >
            Contact
          </a>
        </nav>
      </footer>
    </div>
  );
}

function StepPasteMock() {
  return (
    <div
      className="mt-auto pt-4"
      aria-hidden
    >
      <div className="border border-dashed border-[var(--hairline)] bg-[var(--paper-lift)] px-3 py-3 sm:px-3.5 sm:py-3.5">
        <p className="label mb-2">Texte de l’offre</p>
        <p className="font-[var(--font-body)] text-sm leading-snug text-[var(--ink-soft)]">
          Collez l’annonce complète…
        </p>
        <p className="mono mt-3 text-right text-[0.7rem] tabular-nums text-[var(--ink-soft)]">
          0/80
        </p>
      </div>
    </div>
  );
}

function StepScoreMock() {
  return (
    <div className="mt-auto pt-4" aria-hidden>
      <div className="flex items-center gap-3 border border-[var(--hairline)] bg-[var(--paper-lift)] px-3 py-3 sm:gap-3.5 sm:px-3.5">
        <ScoreBadge score={88} size={52} />
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug text-[var(--ink)]">Score 88/100</p>
          <p className="mt-0.5 text-xs leading-snug text-[var(--ink-soft)]">
            Points forts · red flags
          </p>
        </div>
      </div>
    </div>
  );
}

function InstrumentPreview() {
  return (
    <div className="border border-[var(--ink)] bg-[var(--paper-lift)] shadow-[8px_8px_0_0_color-mix(in_srgb,var(--ink)_12%,transparent)]">
      <div className="flex items-center justify-between border-b border-[var(--hairline)] px-4 py-2.5">
        <p className="label">Instrument · offres</p>
        <p className="mono text-[0.65rem] text-[var(--ink-soft)]">aperçu</p>
      </div>
      <ul className="divide-y divide-[var(--hairline)]">
        {DEMO_OFFERS.map((offer, i) => (
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
