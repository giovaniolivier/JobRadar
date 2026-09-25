import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLocale } from "../lib/i18n";

type DeleteAccountPanelProps = {
  hasPassword: boolean;
  /** Affiché au-dessus du formulaire (erreur parente optionnelle). */
  onError?: (message: string | null) => void;
  className?: string;
};

/** API confirm literal — must stay SUPPRIMER in both locales. */
const DELETE_CONFIRM = "SUPPRIMER";

export function DeleteAccountPanel({
  hasPassword,
  onError,
  className = "",
}: DeleteAccountPanelProps) {
  const { t } = useLocale();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  function setErr(msg: string | null) {
    setLocalError(msg);
    onError?.(msg);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (confirm !== DELETE_CONFIRM) {
      setErr(t("profile.deleteConfirm"));
      return;
    }
    if (hasPassword && !password) {
      setErr(t("profile.deletePasswordRequired"));
      return;
    }

    setBusy(true);
    setErr(null);
    try {
      await api("/profile", {
        method: "DELETE",
        body: JSON.stringify({
          confirm: DELETE_CONFIRM,
          ...(hasPassword ? { password } : {}),
        }),
      });
      await logout();
      navigate("/login", { replace: true });
    } catch (err) {
      setErr(err instanceof Error ? err.message : t("profile.deleteFailed"));
      setBusy(false);
    }
  }

  return (
    <div className={`space-y-4 border border-[var(--brick)] p-5 ${className}`}>
      <div>
        <p className="label" style={{ color: "var(--brick)" }}>
          {t("profile.deleteDanger")}
        </p>
        <h3 className="mt-1 text-xl" style={{ color: "var(--brick)" }}>
          {t("profile.deleteTitle")}
        </h3>
        <p className="mt-2 text-sm text-[var(--ink)]/75">{t("profile.deleteBody")}</p>
      </div>

      {localError && !onError && (
        <p className="text-sm" style={{ color: "var(--brick)" }} role="alert">
          {localError}
        </p>
      )}

      <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
        <label className="block">
          <span className="label mb-1.5 block">{t("profile.deleteConfirm")}</span>
          <input
            className="field"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {hasPassword && (
          <label className="block">
            <span className="label mb-1.5 block">{t("profile.deletePassword")}</span>
            <input
              className="field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
        )}
        <button
          type="submit"
          className="btn"
          style={{ background: "var(--brick)", borderColor: "var(--brick)", color: "#fff" }}
          disabled={busy || confirm !== DELETE_CONFIRM}
        >
          {busy ? t("profile.deleteBusy") : t("profile.deleteSubmit")}
        </button>
      </form>
    </div>
  );
}
