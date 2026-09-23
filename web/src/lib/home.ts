import { api } from "./api";

export type DashboardSummary = {
  needsOnboarding: boolean;
  hasCv: boolean;
  stats: {
    analyzedThisWeek: number;
    avgScore: number | null;
    awaitingResponse: number;
    activityHint: string | null;
    totalAnalyses: number;
  };
  topOffers: Array<{
    id: string;
    title: string;
    company: string;
    location: string | null;
    relevanceScore: number;
    redFlags: string[];
    summary: string;
    applicationStatus: string | null;
  }>;
  pipelineFocus: Array<{
    id: string;
    jobId: string;
    status: "APPLIED" | "INTERVIEW";
    title: string;
    company: string;
    hint: string;
    updatedAt: string;
  }>;
};

export async function fetchDashboard(): Promise<DashboardSummary> {
  return api<DashboardSummary>("/dashboard");
}

/** After login / register / OAuth: onboarding if no CV & no analyses, else dashboard. */
export async function resolvePostAuthPath(): Promise<string> {
  try {
    const data = await fetchDashboard();
    if (data.needsOnboarding) return "/onboarding";
    return "/dashboard";
  } catch {
    return "/dashboard";
  }
}
