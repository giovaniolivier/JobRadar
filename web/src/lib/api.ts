const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

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
  summary: string;
  extractedSalary: string | null;
  extractedStack: string[];
  extractedSeniority: string | null;
};

export type Application = {
  id: string;
  jobId: string;
  status: "TO_APPLY" | "APPLIED" | "INTERVIEW" | "RESPONSE";
  notes: string | null;
  coverLetter: string | null;
  updatedAt: string;
  job?: Job;
};

export type ProfileResponse = {
  id: string;
  email: string;
  name: string;
  profile: {
    cvText: string;
    skills: string[];
    targetRoles: string[];
    experienceYears: number | null;
    preferredLocations: string[];
  } | null;
};
