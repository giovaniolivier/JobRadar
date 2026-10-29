export const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

if (import.meta.env.PROD && !import.meta.env.VITE_API_URL) {
  console.error(
    "[jobradar] VITE_API_URL n'est pas défini au build : repli sur http://localhost:4000. " +
      "Définissez VITE_API_URL (URL de l'API) dans les variables d'environnement du site, puis redéployez."
  );
}

/** status 0 = la requête n'a jamais atteint l'API (réseau, CORS, timeout). */
export class ApiError extends Error {
  status: number;
  code?: "network" | "timeout";

  constructor(status: number, message: string, code?: "network" | "timeout") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function isNetworkError(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 0;
}

/** Timeout généreux : un service Render en veille peut mettre ~30 s à démarrer. */
export const REQUEST_TIMEOUT_MS = 30_000;

/**
 * `fetch` avec timeout et erreurs normalisées.
 * Un échec réseau/CORS/timeout devient une ApiError(status 0) au lieu d'une
 * TypeError qui remonte parfois hors des try/catch (=> spinner infini).
 */
export async function request(
  url: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    const timedOut = controller.signal.aborted;
    throw new ApiError(0, timedOut ? "timeout" : "network", timedOut ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const csrf = readCookie("csrf_token");
      try {
        const res = await request(`${API_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: {
            ...(csrf ? { "X-CSRF-Token": csrf } : {}),
          },
        });
        return res.ok;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function ensureCsrf(): Promise<string | null> {
  const existing = readCookie("csrf_token");
  if (existing) return existing;
  const res = await request(`${API_URL}/auth/csrf`, { credentials: "include" });
  if (!res.ok) return null;
  const data = (await res.json()) as { csrfToken?: string };
  return data.csrfToken ?? readCookie("csrf_token");
}

export async function api<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const { token: _ignoredToken, headers, ...rest } = options;
  const method = (rest.method ?? "GET").toUpperCase();

  const run = async () => {
    const csrf = method === "GET" || method === "HEAD" ? null : await ensureCsrf();
    return request(`${API_URL}${path}`, {
      ...rest,
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        ...headers,
      },
    });
  };

  let res = await run();
  if (res.status === 401 && path !== "/auth/login" && path !== "/auth/refresh" && path !== "/auth/verify-2fa") {
    const ok = await tryRefresh();
    if (ok) res = await run();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? res.statusText);
  }
  return data as T;
}

export type Job = {
  id: string;
  source: string;
  title: string;
  company: string;
  location: string | null;
  salaryRaw: string | null;
  description: string;
  techStack: string[];
  seniority: string | null;
  url: string | null;
  fetchedAt: string;
  analysis: Analysis | null;
  application: Application | null;
};

export type Analysis = {
  id: string;
  relevanceScore: number;
  redFlags: string[];
  strengths?: string[];
  gaps?: string[];
  summary: string;
  extractedSalary: string | null;
  extractedStack: string[];
  extractedSeniority: string | null;
  createdAt?: string;
};

export type ApplicationStatus = "TO_APPLY" | "APPLIED" | "INTERVIEW" | "RESPONSE";

export type StatusEvent = {
  status: ApplicationStatus;
  at: string;
};

export type Application = {
  id: string;
  jobId: string;
  status: ApplicationStatus;
  outcome?: "accepted" | "rejected" | null;
  notes: string | null;
  coverLetter: string | null;
  statusHistory?: StatusEvent[];
  followUpAt?: string | null;
  createdAt: string;
  updatedAt: string;
  job?: Job;
};

export type ProfileData = {
  cvText: string;
  cvFileName: string | null;
  cvImportedAt: string | null;
  skills: string[];
  softSkills: string[];
  targetRoles: string[];
  experienceYears: number | null;
  preferredLocations: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  workModes: string[];
  targetSeniority: string | null;
  preferredSectors: string[];
  avoidedSectors: string[];
  hasCv?: boolean;
  updatedAt?: string;
};

export type ProfileResponse = {
  id: string;
  email: string;
  name: string;
  hasPassword: boolean;
  profile: ProfileData | null;
};

export type UserSettings = {
  emailNotifications: boolean;
  inAppNotifications: boolean;
  notifyHighScore: boolean;
  notifyFollowUp: boolean;
  notifyInterview: boolean;
  notifyWeeklyDigest: boolean;
  digestFrequency: "daily" | "weekly" | string;
  theme: "light" | "dark" | "system" | string;
  locale: "fr" | "en" | string;
  dateFormat: string;
  currency: string;
  updatedAt?: string;
};

/** Télécharge l’export RGPD (JSON). */
export async function downloadDataExport(): Promise<void> {
  const run = async () =>
    request(`${API_URL}/settings/export`, {
      method: "GET",
      credentials: "include",
    });

  let res = await run();
  if (res.status === 401) {
    const ok = await tryRefresh();
    if (ok) res = await run();
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (data as { error?: string }).error ?? res.statusText);
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] ?? `jobradar-export-${new Date().toISOString().slice(0, 10)}.json`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Upload multipart (CV) — ne force pas Content-Type JSON. */
export async function apiForm<T>(path: string, form: FormData): Promise<T> {
  const method = "POST";
  const run = async () => {
    const csrf = await ensureCsrf();
    return request(`${API_URL}${path}`, {
      method,
      credentials: "include",
      headers: {
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      body: form,
    });
  };

  let res = await run();
  if (res.status === 401) {
    const ok = await tryRefresh();
    if (ok) res = await run();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (data as { error?: string }).error ?? res.statusText);
  }
  return data as T;
}
