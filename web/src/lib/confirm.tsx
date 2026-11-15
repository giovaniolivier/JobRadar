import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useLocale } from "./i18n";

export type ConfirmOptions = {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
};

type PendingConfirm = ConfirmOptions & { resolve: (value: boolean) => void };

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        lastFocused.current = document.activeElement as HTMLElement | null;
        setPending({ ...opts, resolve });
      }),
    []
  );

  const settle = useCallback((value: boolean) => {
    setPending((current) => {
      current?.resolve(value);
      return null;
    });
    // Rend le focus à l'élément déclencheur.
    lastFocused.current?.focus?.();
  }, []);

  useEffect(() => {
    if (!pending) return;
    confirmBtnRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        settle(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending, settle]);

  const danger = pending?.tone === "danger";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending &&
        createPortal(
          <div
            className="fixed inset-0 z-[110] flex items-center justify-center p-4"
            style={{ background: "color-mix(in srgb, var(--ink) 45%, transparent)" }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) settle(false);
            }}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-title"
              aria-describedby="confirm-message"
              className="toast-in w-full max-w-sm rounded-sm border p-5 shadow-xl"
              style={{ background: "var(--paper-lift)", borderColor: "var(--hairline)" }}
            >
              <h2 id="confirm-title" className="text-lg font-semibold" style={{ color: "var(--ink)" }}>
                {pending.title ?? t("common.confirmTitle")}
              </h2>
              <p id="confirm-message" className="mt-2 text-sm leading-snug text-(--ink)/80">
                {pending.message}
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" className="btn btn-ghost" onClick={() => settle(false)}>
                  {pending.cancelLabel ?? t("common.cancel")}
                </button>
                <button
                  ref={confirmBtnRef}
                  type="button"
                  className="btn"
                  style={
                    danger
                      ? { background: "var(--brick)", color: "var(--paper-lift)" }
                      : { background: "var(--amber)", color: "var(--amber-fg)" }
                  }
                  onClick={() => settle(true)}
                >
                  {pending.confirmLabel ?? t("common.confirm")}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </ConfirmContext.Provider>
  );
}

/** Confirmation non bloquante : `const ok = await confirm({ message })`. */
export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm doit être utilisé dans <ConfirmProvider>");
  return ctx;
}
