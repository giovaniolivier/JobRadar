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

export async function syncRemotive(userId: string, search?: string) {
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
        userId_source_externalId: {
          userId,
          source: "remotive",
          externalId: String(job.id),
        },
      },
      create: {
        userId,
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

export async function importManualJobs(userId: string, jobs: ManualJobInput[]) {
  const created = [];
  for (const job of jobs) {
    const row = await prisma.job.create({
      data: {
        userId,
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
  const cleaned = text.trim();
  const lines = cleaned.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const first = lines[0] ?? "";

  // Format explicite « Titre | Entreprise »
  if (first.includes("|")) {
    const parts = first.split("|").map((p) => p.trim());
    const title = parts[0] || findRoleInText(cleaned) || "Offre à analyser";
    const company = parts[1] || findCompanyInText(cleaned, title) || "Entreprise inconnue";
    const urlLine = lines.find((l) => /^https?:\/\//i.test(l));
    return { title, company, description: cleaned, url: urlLine };
  }

  let title = findRoleInText(cleaned);
  let company = findCompanyInText(cleaned, title);

  if (!title && looksLikeRole(first)) title = first;
  if (!company && lines[1] && !looksLikeProse(lines[1]) && !ROLE_HINT.test(lines[1])) {
    company = lines[1];
  }

  // Pitch « Startfast est une startup… » : ne jamais le garder comme titre
  if (title && looksLikeProse(title)) {
    title = findRoleInText(cleaned.replace(title, "")) || "Offre à analyser";
  }

  const urlLine = lines.find((l) => /^https?:\/\//i.test(l));

  return {
    title: title || "Offre à analyser",
    company: company || "Entreprise inconnue",
    description: cleaned,
    url: urlLine,
  };
}

const ROLE_HINT =
  /(?:développeur(?:·?e|se)?|developer|ingénieur(?:·?e)?|engineer|fullstack|full[\s-]?stack|backend|frontend|front[\s-]?end|back[\s-]?end|product\s*manager|data\s*(?:scientist|engineer|analyst)|devops|sre|designer|analyst(?:e)?|chef\s*de\s*projet|tech\s*lead|lead\s*(?:dev|engineer)|software\s*(?:engineer|developer)|mobile\s*developer)/i;

const SECTION_HEADER =
  /^(vos?\s+)?(missions|responsabilit[eé]s?|profil(?:\s+recherch[eé])?|avantages|pr[eé]requis|comp[eé]tences|description(?:\s+du\s+poste)?|about(?:\s+us)?|qui\s+sommes[\s-]?nous|notre\s+[eé]quipe|stack(?:\s+technique)?|outils|environnement|ce\s+que\s+nous|pourquo[ie]\s+nous|process(?:us)?|modalit[eé]s|informations?\s+pratiques|à\s+propos)/i;

const PLACEHOLDER_COMPANY = /^(entreprise inconnue|unknown company|n\/?a|—|-)$/i;
const PLACEHOLDER_TITLE = /^(offre importée|offre à analyser|offre|sans titre|n\/?a|—|-)$/i;

function firstLabel(text: string, pattern: RegExp): string | null {
  const m = text.match(pattern);
  if (!m?.[1]) return null;
  const value = m[1].split(/\r?\n/)[0]?.trim() ?? "";
  return value.length >= 2 && value.length <= 120 ? value : null;
}

function isSectionHeader(line: string): boolean {
  const t = line.trim().replace(/[:\-–]\s*$/, "");
  return SECTION_HEADER.test(t) && !ROLE_HINT.test(t);
}

function looksLikeProse(line: string): boolean {
  return (
    line.length > 72 ||
    /\best\s+(une|un|la|le)\b/i.test(line) ||
    (line.split(/\s+/).length >= 12 && !ROLE_HINT.test(line))
  );
}

/** Un intitulé doit contenir un signal de rôle — jamais un titre de section d’annonce. */
function looksLikeRole(line: string): boolean {
  if (!line || looksLikeProse(line) || isSectionHeader(line)) return false;
  return ROLE_HINT.test(line);
}

function findRoleInText(text: string): string | null {
  const labelled = firstLabel(
    text,
    /(?:^|\n)\s*(?:poste|titre|intitulé|job\s*title|r[oô]le|position)\s*[:\-–]\s*(.+)/i
  );
  if (labelled && looksLikeRole(labelled)) return labelled;

  const chez = text.match(
    /(?:poste|offre|recrut(?:e|ons)|recherche)\s+(?:de\s+|d['’])?([^.\n|]{4,70}?)\s+chez\s+/i
  );
  if (chez?.[1] && looksLikeRole(chez[1].trim())) return chez[1].trim();

  for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 20)) {
    if (looksLikeRole(line)) return line;
  }

  const sought = text.match(
    /(?:recherch(?:ons|e)|recrutons|looking\s+for)\s+(?:un(?:e)?|a|an|our)\s+([^.!\n|]{4,70})/i
  );
  if (sought?.[1]) {
    const candidate = sought[1].replace(/\s+pour\b.*$/i, "").trim();
    if (looksLikeRole(candidate) && candidate.length <= 70) return candidate;
  }

  const inline = ROLE_HINT.exec(text.slice(0, 2000));
  if (inline && inline.index != null) {
    const from = inline.index;
    const slice = text.slice(from, from + 70);
    const candidate = slice.split(/[.\n|,;(]| pour | afin /i)[0]?.trim() ?? "";
    if (looksLikeRole(candidate) && candidate.length <= 70) return candidate;
  }
  return null;
}

function findCompanyInText(text: string, title?: string | null): string | null {
  const labelled = firstLabel(
    text,
    /(?:^|\n)\s*(?:entreprise|société|company|employeur)\s*[:\-–]\s*(.+)/i
  );
  if (labelled && !looksLikeProse(labelled) && !isSectionHeader(labelled) && labelled.length <= 60) {
    return labelled;
  }

  const intro = text.match(/^([A-ZÀ-Ü][\w&.''\-]{1,40})\s+est\s+(?:une|un|la|le)\b/m);
  if (intro?.[1]) return intro[1];

  const chez = text.match(/\schez\s+([A-ZÀ-Ü][\w&.''\- ]{1,40?}?)(?:\s*[.,\n(|]|$)/);
  if (chez?.[1]) {
    const name = chez[1].trim();
    if (name.length >= 2 && name.length <= 50 && !ROLE_HINT.test(name) && !isSectionHeader(name)) {
      return name;
    }
  }

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 6)) {
    if (title && line === title) continue;
    if (looksLikeProse(line) || ROLE_HINT.test(line) || isSectionHeader(line)) continue;
    if (/^https?:\/\//i.test(line)) continue;
    if (line.length <= 40 && /^[A-ZÀ-Ü]/.test(line) && line.split(/\s+/).length <= 4) {
      return line;
    }
  }
  return null;
}

/** Corrige titre/entreprise déjà mal mappés (placeholders, pitch, titres de section). */
export function needsJobMetadataRepair(job: {
  title: string;
  company: string;
}): boolean {
  const title = job.title.trim();
  return (
    PLACEHOLDER_COMPANY.test(job.company.trim()) ||
    PLACEHOLDER_TITLE.test(title) ||
    looksLikeProse(title) ||
    isSectionHeader(title)
  );
}

export function repairJobMetadataFromDescription(job: {
  title: string;
  company: string;
  description: string;
}): { title: string; company: string } {
  const parsed = parsePastedJob(job.description || `${job.title}\n${job.company}`);
  const brokenTitle =
    PLACEHOLDER_TITLE.test(job.title.trim()) ||
    looksLikeProse(job.title) ||
    isSectionHeader(job.title) ||
    (!ROLE_HINT.test(job.title.trim()) && ROLE_HINT.test(parsed.title));
  const title = brokenTitle ? parsed.title : job.title;
  const company = PLACEHOLDER_COMPANY.test(job.company.trim()) ? parsed.company : job.company;
  return { title, company };
}
