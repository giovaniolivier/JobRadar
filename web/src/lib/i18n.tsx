import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { messages } from "./messages";

export type AppLocale = "fr" | "en";

const STORAGE_KEY = "jobradar.locale";

export type MessageKey = keyof (typeof messages)["fr"];

export function readStoredLocale(): AppLocale {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "fr" || raw === "en") return raw;
  } catch {
    // ignore
  }
  return "fr";
}

export function persistLocale(locale: AppLocale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore
  }
  document.documentElement.lang = locale;
}

export function bootLocale() {
  persistLocale(readStoredLocale());
}

function translate(locale: AppLocale, key: MessageKey, vars?: Record<string, string | number>) {
  let text: string = messages[locale][key] ?? messages.fr[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(() => readStoredLocale());

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
    persistLocale(next);
  }, []);

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
