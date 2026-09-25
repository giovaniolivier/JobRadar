import { Link } from "react-router-dom";
import { useAnalyzeOffer } from "../components/AnalyzeOfferPanel";
import { useLocale } from "../lib/i18n";

/** Legacy import hub — primary path is now the side panel. */
export function ImportPage() {
  const { openAnalyze } = useAnalyzeOffer();
  const { t } = useLocale();

  return (
    <div className="fade-in max-w-xl">
      <p className="label">{t("import.eyebrow")}</p>
      <h1 className="mt-1 text-3xl sm:text-4xl">{t("import.title")}</h1>
      <p className="mt-3 text-[var(--ink-soft)]">{t("import.subtitle")}</p>
      <button type="button" className="btn btn-amber mt-6" onClick={openAnalyze}>
        {t("import.cta")}
      </button>
      <p className="mt-6 text-sm text-[var(--ink-soft)]">
        {t("import.dashboardHint")}{" "}
        <Link to="/dashboard" className="underline decoration-[var(--amber)] underline-offset-4">
          {t("import.dashboardLink")}
        </Link>
      </p>
    </div>
  );
}
