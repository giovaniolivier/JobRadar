export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "jobradar.theme";

export function readStoredTheme(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // ignore
  }
  return "system";
}

export function applyTheme(theme: ThemePreference) {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore
  }
}

/** Thème effectivement affiché (après résolution de « system »). */
export function isResolvedDark(): boolean {
  if (typeof document === "undefined") return false;
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark") return true;
  if (attr === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Abonne aux changements de thème (data-theme + prefers-color-scheme). */
export function subscribeResolvedTheme(onChange: () => void): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onMq = () => onChange();
  mq.addEventListener("change", onMq);
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => {
    mq.removeEventListener("change", onMq);
    obs.disconnect();
  };
}

/** Applique le thème stocké avant le premier paint (éviter un flash). */
export function bootTheme() {
  applyTheme(readStoredTheme());
}
