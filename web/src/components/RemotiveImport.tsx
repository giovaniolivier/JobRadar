import { useId, useState, type FormEvent } from "react";
import { api, type ProfileResponse } from "../lib/api";
import { useLocale } from "../lib/i18n";

/**
 * Import d'offres en télétravail depuis Remotive (POST /offers/sync).
 * Les offres importées n'ont pas de score tant qu'elles n'ont pas été analysées.
 */
export function RemotiveImport({ onImported }: { onImported: () => void | Promise<void> }) {
  const { t } = useLocale();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Ouvre le formulaire, prérempli avec le premier poste visé du profil. */
  function openForm() {
    setOpen(true);
    setMessage(null);
    setError(null);
    if (search) return;
    void api<ProfileResponse>("/profile")
      .then((data) => {
        const role = data.profile?.targetRoles?.[0]?.trim();
        if (role) setSearch((current) => current || role);
      })
      .catch(() => undefined);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api<{ source: string; count: number }>("/offers/sync", {
        method: "POST",
        body: JSON.stringify({ search: search.trim() || undefined }),
      });
      setMessage(
        res.count === 0
          ? t("offers.remotiveNone")
          : t(res.count === 1 ? "offers.remotiveDone" : "offers.remotiveDonePlural", {
              n: res.count,
            })
      );
      await onImported();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("offers.remotiveError"));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-ghost self-start text-xs!"
        onClick={openForm}
      >
        {t("offers.remotiveOpen")}
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="w-full rounded-sm border border-(--hairline) p-4 sm:max-w-md"
      aria-busy={busy}
    >
      <label htmlFor={inputId} className="label mb-1.5 block">
        {t("offers.remotiveLabel")}
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          className="field min-w-0 flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("offers.remotivePlaceholder")}
          disabled={busy}
          autoFocus
        />
        <button type="submit" className="btn btn-amber shrink-0 text-xs!" disabled={busy}>
          {busy ? t("offers.remotiveBusy") : t("offers.remotiveSubmit")}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-(--ink-soft)">{t("offers.remotiveHint")}</p>
      {message ? (
        <p className="mt-2 text-sm" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-sm" style={{ color: "var(--brick)" }} role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className="mt-3 text-xs underline underline-offset-4"
        onClick={() => setOpen(false)}
        disabled={busy}
      >
        {t("offers.remotiveClose")}
      </button>
    </form>
  );
}
