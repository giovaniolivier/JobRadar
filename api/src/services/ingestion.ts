import { parse } from "csv-parse/sync";
import { prisma } from "../lib/prisma.js";

type RemotiveJob = {
  id: number;
  url: string;
  title: string;
  company_name: string;
  candidate_required_location?: string;
  salary?: string;
  description: string;
  tags?: string[];
  job_type?: string;
};

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function guessSeniority(title: string, description: string): string | null {
  const text = `${title} ${description}`;
  const match = /(junior|mid|confirmé|senior|lead|staff|principal|intern|stage)/i.exec(text);
  return match?.[1] ?? null;
}

export async function syncRemotive(search?: string) {
  const url = new URL("https://remotive.com/api/remote-jobs");
  if (search) url.searchParams.set("search", search);
  url.searchParams.set("limit", "50");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Remotive API error: ${res.status}`);
  const data = (await res.json()) as { jobs?: RemotiveJob[] };
  const jobs = data.jobs ?? [];

  let upserted = 0;
  for (const job of jobs) {
    const description = stripHtml(job.description ?? "");
    await prisma.job.upsert({
      where: {
        source_externalId: {
          source: "remotive",
          externalId: String(job.id),
        },
      },
      create: {
        source: "remotive",
        externalId: String(job.id),
        title: job.title,
        company: job.company_name,
        location: job.candidate_required_location || "Remote",
        salaryRaw: job.salary || null,
        description,
        techStack: job.tags ?? [],
        seniority: guessSeniority(job.title, description),
        url: job.url,
      },
      update: {
        title: job.title,
        company: job.company_name,
        location: job.candidate_required_location || "Remote",
        salaryRaw: job.salary || null,
        description,
        techStack: job.tags ?? [],
        seniority: guessSeniority(job.title, description),
        url: job.url,
        fetchedAt: new Date(),
      },
    });
    upserted += 1;
  }

  return { source: "remotive", count: upserted };
}

export type ManualJobInput = {
  title: string;
  company: string;
  location?: string;
  salaryRaw?: string;
  description: string;
  techStack?: string[];
  seniority?: string;
  url?: string;
};

export async function importManualJobs(jobs: ManualJobInput[]) {
  const created = [];
  for (const job of jobs) {
    const row = await prisma.job.create({
      data: {
        source: "manual",
        externalId: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: job.title,
        company: job.company,
        location: job.location ?? null,
        salaryRaw: job.salaryRaw ?? null,
        description: job.description,
        techStack: job.techStack ?? [],
        seniority: job.seniority ?? guessSeniority(job.title, job.description),
        url: job.url ?? null,
      },
    });
    created.push(row);
  }
  return created;
}

export function parseJobsCsv(csvText: string): ManualJobInput[] {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  return records
    .map((r) => ({
      title: r.title || r.Title || "",
      company: r.company || r.Company || "",
      location: r.location || r.Location || undefined,
      salaryRaw: r.salary || r.salaryRaw || r.Salary || undefined,
      description: r.description || r.Description || "",
      url: r.url || r.URL || undefined,
      techStack: (r.tech || r.techStack || r.stack || "")
        .split(/[|,;]/)
        .map((s) => s.trim())
        .filter(Boolean),
    }))
    .filter((j) => j.title && j.company && j.description);
}

export function parsePastedJob(text: string): ManualJobInput {
  const lines = text.trim().split(/\r?\n/);
  const first = lines[0] ?? "";
  const parts = first.split("|").map((p) => p.trim());
  const title = parts[0] || "Offre importée";
  const company = parts[1] || "Entreprise inconnue";
  const urlLine = lines.find((l) => /^https?:\/\//i.test(l.trim()));
  const description = lines.slice(1).join("\n").trim() || text;

  return {
    title,
    company,
    description,
    url: urlLine?.trim(),
  };
}
