import { Link } from "react-router-dom";
import { useAnalyzeOffer } from "../components/AnalyzeOfferPanel";

/** Legacy import hub — primary path is now the side panel. */
export function ImportPage() {
  const { openAnalyze } = useAnalyzeOffer();

  return (
    <div className="fade-in max-w-xl">
      <p className="label">Ingestion</p>
      <h1 className="mt-1 text-3xl sm:text-4xl">Analyser une offre</h1>
      <p className="mt-3 text-[var(--ink-soft)]">
        L’analyse se lance dans un panneau latéral pour rester dans votre contexte de travail.
      </p>
      <button type="button" className="btn btn-amber mt-6" onClick={openAnalyze}>
        Analyser une nouvelle offre
      </button>
      <p className="mt-6 text-sm text-[var(--ink-soft)]">
        Besoin du tableau de bord ?{" "}
        <Link to="/" className="underline decoration-[var(--amber)] underline-offset-4">
          Y retourner
        </Link>
      </p>
    </div>
  );
}
