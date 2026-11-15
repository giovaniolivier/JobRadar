import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type ToastVariant = "success" | "error" | "info";

type Toast = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type ShowOptions = { variant?: ToastVariant; duration?: number };

type ToastApi = {
  show: (message: string, opts?: ShowOptions) => number;
  success: (message: string, duration?: number) => number;
  error: (message: string, duration?: number) => number;
  info: (message: string, duration?: number) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const MAX_VISIBLE = 4;
const DEFAULT_DURATION: Record<ToastVariant, number> = {
  success: 3200,
  info: 4000,
  error: 6000,
};

const VARIANT_COLOR: Record<ToastVariant, string> = {
  success: "var(--match)",
  error: "var(--brick)",
  info: "var(--amber)",
};

const VARIANT_ICON: Record<ToastVariant, string> = {
  success: "M5 10.5l3 3 7-7",
  error: "M10 5.5v5.5m0 3h.01",
  info: "M10 9v5m0-8h.01",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (message: string, opts?: ShowOptions): number => {
      const text = message?.trim();
      if (!text) return -1;
      const variant = opts?.variant ?? "info";
      const id = nextId.current++;
      setToasts((list) => {
        const next = [...list, { id, message: text, variant }];
        // Limite la pile : on retire les plus anciens au-delà du maximum.
        return next.slice(-MAX_VISIBLE);
      });
      const duration = opts?.duration ?? DEFAULT_DURATION[variant];
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration)
        );
      }
      return id;
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message, duration) => show(message, { variant: "success", duration }),
      error: (message, duration) => show(message, { variant: "error", duration }),
      info: (message, duration) => show(message, { variant: "info", duration }),
      dismiss,
    }),
    [show, dismiss]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
            aria-live="polite"
            aria-relevant="additions"
          >
            {toasts.map((toast) => (
              <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const color = VARIANT_COLOR[toast.variant];
  return (
    <div
      role={toast.variant === "error" ? "alert" : "status"}
      className="toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-sm border px-4 py-3 shadow-lg"
      style={{
        background: "var(--paper-lift)",
        borderColor: "var(--hairline)",
        borderLeft: `3px solid ${color}`,
      }}
    >
      <svg
        className="mt-0.5 shrink-0"
        width="18"
        height="18"
        viewBox="0 0 20 20"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {toast.variant === "success" ? null : <circle cx="10" cy="10" r="8" opacity="0.9" />}
        <path d={VARIANT_ICON[toast.variant]} />
      </svg>
      <p className="flex-1 text-sm leading-snug" style={{ color: "var(--ink)" }}>
        {toast.message}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="-m-1 shrink-0 rounded p-1 text-(--ink-soft) transition-opacity hover:opacity-70"
        aria-label="Fermer la notification"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M3 3l8 8M11 3l-8 8" />
        </svg>
      </button>
    </div>
  );
}

/** Accès aux notifications. Doit être utilisé sous <ToastProvider>. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast doit être utilisé dans <ToastProvider>");
  return ctx;
}
