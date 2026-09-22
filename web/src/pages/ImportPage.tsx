import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export function ImportPage() {
  const { token } = useAuth();
  const [csv, setCsv] = useState(
    "title,company,location,salary,description,url,tech\nBackend Node,Acme,Remote,60k€,Node et PostgreSQL,https://example.com,Node|PostgreSQL"
  );
  const [text, setText] = useState(
    "Frontend React | Leaf Co\nhttps://example.com/job\nPoste React + Tailwind, remote EU."
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function importCsv(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const data = await api<{ count: number }>("/offers", {
        method: "POST",
        token,
        body: JSON.stringify({ csv }),
      });
      setMessage(`${data.count} offre(s) importée(s) depuis le CSV.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function importText(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const data = await api<{ count: number }>("/offers", {
        method: "POST",
        token,
        body: JSON.stringify({ text }),
      });
      setMessage(`${data.count} offre(s) importée(s) depuis le texte.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fade-in max-w-3xl">
      <p className="label">Ingestion</p>
      <h1 className="mt-1 text-3xl sm:text-4xl">Import d'offres</h1>
      <p className="mt-2 text-[var(--ink-soft)]">
        CSV ou collage texte via{" "}
        <code className="mono text-[var(--ink)]">POST /offers</code>.
      </p>

      {message && (
        <p className="mt-4 mono text-sm" style={{ color: "var(--match)" }}>
          {message}
        </p>
      )}
      {error && (
        <p className="mt-4 text-sm" style={{ color: "var(--brick)" }}>
          {error}
        </p>
      )}

      <form onSubmit={importCsv} className="panel mt-6 space-y-3">
        <p className="label">Canal A</p>
        <h2 className="text-xl">CSV</h2>
        <textarea
          className="field mono min-h-36 text-xs"
          rows={6}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />
        <button type="submit" disabled={loading} className="btn btn-amber">
          Importer CSV
        </button>
      </form>

      <form onSubmit={importText} className="panel space-y-3">
        <p className="label">Canal B</p>
        <h2 className="text-xl">Collage texte</h2>
        <p className="text-sm text-[var(--ink-soft)]">
          Première ligne : <code className="mono">Titre | Entreprise</code>, puis description.
        </p>
        <textarea
          className="field mono min-h-36 text-xs"
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" disabled={loading} className="btn btn-ghost">
          Importer texte
        </button>
      </form>
    </div>
  );
}
