import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const analysisSchema = z.object({
  relevanceScore: z
    .number()
    .transform((n) => Math.max(0, Math.min(100, Math.round(n)))),
  redFlags: z.array(z.string()).default([]),
  strengths: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  summary: z.string(),
  extractedSalary: z.string().nullable().optional(),
  extractedStack: z.array(z.string()).default([]),
  extractedSeniority: z.string().nullable().optional(),
  extractedTitle: z.string().nullable().optional(),
  extractedCompany: z.string().nullable().optional(),
});

export type AnalysisResult = z.infer<typeof analysisSchema>;

type ProfileContext = {
  cvText: string;
  skills: string[];
  softSkills?: string[];
  targetRoles: string[];
  experienceYears: number | null;
  preferredLocations: string[];
  salaryMin?: number | null;
  salaryMax?: number | null;
  workModes?: string[];
  targetSeniority?: string | null;
  preferredSectors?: string[];
  avoidedSectors?: string[];
};

type JobContext = {
  title: string;
  company: string;
  location: string | null;
  salaryRaw: string | null;
  description: string;
  techStack: string[];
  seniority: string | null;
};

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.includes("your-key")) {
    return null;
  }
  return new Anthropic({ apiKey });
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in model response");
  return JSON.parse(raw.slice(start, end + 1));
}

function normalizeToken(s: string): string {
  let t = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.js\b/g, "js")
    .replace(/[^a-z0-9+#]/g, "");
  if (t === "next" || t === "nextjs") return "nextjs";
  if (t === "node" || t === "nodejs") return "nodejs";
  if (t === "react" || t === "reactjs") return "react";
  if (t === "vue" || t === "vuejs") return "vue";
  if (t === "postgres" || t === "postgresql") return "postgresql";
  if (t === "ts" || t === "typescript") return "typescript";
  if (t === "js" || t === "javascript") return "javascript";
  if (t === "k8s" || t === "kubernetes") return "kubernetes";
  return t;
}

function displayTech(raw: string): string {
  const t = raw.trim();
  const known: Record<string, string> = {
    js: "JavaScript",
    ts: "TypeScript",
    javascript: "JavaScript",
    typescript: "TypeScript",
    node: "Node.js",
    nodejs: "Node.js",
    "node.js": "Node.js",
    react: "React",
    next: "Next.js",
    nextjs: "Next.js",
    "next.js": "Next.js",
    vue: "Vue.js",
    angular: "Angular",
    css: "CSS",
    html: "HTML",
    postgres: "PostgreSQL",
    postgresql: "PostgreSQL",
    mysql: "MySQL",
    mongodb: "MongoDB",
    prisma: "Prisma",
    tailwind: "Tailwind CSS",
    tailwindcss: "Tailwind CSS",
    docker: "Docker",
    kubernetes: "Kubernetes",
    aws: "AWS",
    graphql: "GraphQL",
    python: "Python",
    golang: "Go",
    go: "Go",
    fullstack: "Full-stack",
    "full-stack": "Full-stack",
    "full stack": "Full-stack",
    "dev fullstack": "Full-stack",
    "dev full stack": "Full-stack",
    "dev full-stack": "Full-stack",
    backend: "Backend",
    frontend: "Frontend",
    nestjs: "NestJS",
    express: "Express",
  };
  const key = normalizeToken(t);
  const spacedKey = t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (known[key]) return known[key]!;
  if (known[spacedKey]) return known[spacedKey]!;
  if (/^[A-Z0-9.+#/-]+$/.test(t) && t.length <= 6) return t; // CSS, HTML, CI/CD
  // Title-case multi-word labels (rôles, soft skills libres)
  return t
    .split(/(\s|-)/)
    .map((part, i) => {
      if (part === " " || part === "-") return part;
      if (i > 0 && /^(et|de|du|des|la|le|les|d'|l')$/i.test(part)) return part.toLowerCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join("");
}

/** Normalise un libellé de compétence / rôle pour l’affichage et le stockage. */
export function normalizeSkillLabel(raw: string): string {
  return displayTech(raw);
}

function extractJobTechs(job: JobContext): string[] {
  const fromStack = job.techStack.map((t) => t.trim()).filter(Boolean);
  const fromText = Array.from(
    (job.description + " " + job.title).matchAll(
      /\b(TypeScript|JavaScript|Python|Java|Go|Rust|PHP|Ruby|Swift|Kotlin|React(?:\.js)?|Next\.js|Nextjs|Vue(?:\.js)?|Angular|Node(?:\.js)?|Nodejs|NestJS|Express|Django|Flask|Spring|PostgreSQL|Postgres|MySQL|MongoDB|Redis|Prisma|GraphQL|REST|Docker|Kubernetes|AWS|GCP|Azure|Tailwind(?:\s*CSS)?|CSS|HTML|Sass|Webpack|Vite|CI\/CD)\b/gi
    )
  ).map((m) => m[1]!);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...fromStack, ...fromText]) {
    const key = normalizeToken(raw);
    if (!key || key.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push(displayTech(raw));
  }
  return out.slice(0, 14);
}

const SOFT_SKILL_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "Communication", re: /\bcommunication\b/i },
  { label: "Leadership", re: /\bleadership|encadrement|management\b/i },
  { label: "Travail d'équipe", re: /\btravail\s+d['’]équipe|team\s*work|collaboratif\b/i },
  { label: "Autonomie", re: /\bautonom(e|ie)\b/i },
  { label: "Rigoureux", re: /\brigour(eux|euse)|rigueur\b/i },
  { label: "Créativité", re: /\bcréativit[ée]|creativity\b/i },
  { label: "Résolution de problèmes", re: /\br[ée]solution\s+de\s+probl[èe]mes|problem[- ]solving\b/i },
  { label: "Pédagogie", re: /\bp[ée]dagogie|mentorat|mentoring\b/i },
  { label: "Organisation", re: /\borganisation|organis[ée]\b/i },
  { label: "Adaptabilité", re: /\badaptabilit[ée]|flexible\b/i },
];

/** Extraction heuristique des compétences techniques et soft skills depuis un CV texte. */
export function extractSkillsFromCv(cvText: string): { skills: string[]; softSkills: string[] } {
  const bag = cvText.slice(0, 12000);
  const techMatches = Array.from(
    bag.matchAll(
      /\b(TypeScript|JavaScript|Python|Java|Go|Rust|PHP|Ruby|Swift|Kotlin|React(?:\.js)?|Next\.js|Nextjs|Vue(?:\.js)?|Angular|Node(?:\.js)?|Nodejs|NestJS|Express|Django|Flask|Spring|PostgreSQL|Postgres|MySQL|MongoDB|Redis|Prisma|GraphQL|Docker|Kubernetes|AWS|GCP|Azure|Tailwind(?:\s*CSS)?|CSS|HTML|Sass|Webpack|Vite|CI\/CD|Figma|Agile|Scrum)\b/gi
    )
  ).map((m) => m[1]!);

  const seen = new Set<string>();
  const skills: string[] = [];
  for (const raw of techMatches) {
    const key = normalizeToken(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    skills.push(displayTech(raw));
  }

  const softSkills = SOFT_SKILL_PATTERNS.filter((p) => p.re.test(bag)).map((p) => p.label);
  return { skills: skills.slice(0, 24), softSkills: softSkills.slice(0, 12) };
}

function parseSalaryK(raw: string | null): number | null {
  if (!raw?.trim()) return null;
  const nums = [...raw.matchAll(/(\d[\d\s]{0,5})\s*k/gi)].map((m) =>
    Number(m[1]!.replace(/\s/g, ""))
  );
  if (nums.length) return Math.max(...nums) * 1000;
  const plain = [...raw.matchAll(/(\d[\d\s]{2,})\s*(?:€|EUR)/gi)].map((m) =>
    Number(m[1]!.replace(/\s/g, ""))
  );
  if (plain.length) return Math.max(...plain);
  return null;
}

function detectJobWorkMode(job: JobContext): "remote" | "hybrid" | "onsite" {
  const loc = `${job.location ?? ""} ${job.description}`.toLowerCase();
  if (/hybrid|hybride/.test(loc)) return "hybrid";
  if (/remote|télétravail|teletravail|full\s*remote|anywhere/.test(loc)) return "remote";
  return "onsite";
}

function profileHasTech(profile: ProfileContext, tech: string): boolean {
  const needle = normalizeToken(tech);
  if (!needle) return false;
  const bag = [
    ...profile.skills,
    ...(profile.softSkills ?? []),
    ...profile.targetRoles,
    profile.cvText.slice(0, 8000),
  ]
    .join(" ")
    .toLowerCase();
  const bagNorm = normalizeToken(bag);
  if (bag.includes(needle) || bagNorm.includes(needle)) return true;
  if (needle === "nodejs" && /node/.test(bag)) return true;
  if (needle === "nextjs" && /next/.test(bag)) return true;
  if (needle === "react" && /react/.test(bag)) return true;
  if (needle === "typescript" && /\bts\b|typescript/.test(bag)) return true;
  if (needle === "javascript" && /\bjs\b|javascript/.test(bag)) return true;
  if (needle === "postgresql" && /postgres/.test(bag)) return true;
  return false;
}

function heuristicAnalysis(profile: ProfileContext, job: JobContext): AnalysisResult {
  const jobTechs = extractJobTechs(job);
  const matchedTechs = jobTechs.filter((t) => profileHasTech(profile, t));
  const missingTechs = jobTechs.filter((t) => !profileHasTech(profile, t));

  let scoreBase = jobTechs.length
    ? Math.round((matchedTechs.length / jobTechs.length) * 85)
    : profile.skills.length
      ? 45
      : 40;

  const redFlags: string[] = [];
  if (!job.salaryRaw?.trim()) {
    redFlags.push("Salaire non précisé");
  }
  if (/10\+?\s*ans|15\s*ans|senior\s*\+\+|expert\s*confirmé/i.test(job.description)) {
    redFlags.push("Expérience potentiellement irréaliste demandée");
  }
  if (/urgent|immédiat|asap/i.test(job.description) && !job.salaryRaw?.trim()) {
    redFlags.push("Urgence affichée sans fourchette salariale");
  }

  const salaryMatch =
    job.salaryRaw ?? job.description.match(/(\d[\d\s]{2,}\s*(?:€|k€|EUR|\$))/i)?.[1] ?? null;

  const seniority =
    job.seniority ?? (/(junior|confirmé|senior|lead|staff)/i.exec(job.description)?.[1] ?? null);

  const jobSalary = parseSalaryK(job.salaryRaw);
  if (jobSalary != null && profile.salaryMin != null && jobSalary < profile.salaryMin * 0.85) {
    scoreBase = Math.max(5, scoreBase - 12);
    redFlags.push("Salaire probablement sous votre fourchette");
  }

  const modes = profile.workModes ?? [];
  if (modes.length) {
    const jobMode = detectJobWorkMode(job);
    if (!modes.includes(jobMode)) {
      scoreBase = Math.max(5, scoreBase - 8);
    } else {
      scoreBase = Math.min(100, scoreBase + 4);
    }
  }

  if (profile.targetSeniority && seniority) {
    const want = normalizeToken(profile.targetSeniority);
    const got = normalizeToken(seniority.replace(/é/g, "e"));
    if (want && got && want !== got && !(want === "confirme" && /mid|confirm/.test(got))) {
      scoreBase = Math.max(5, scoreBase - 6);
    }
  }

  const locs = (profile.preferredLocations ?? []).filter(
    (l) => !/^(remote|hybride?|hybrid|onsite|sur[\s-]?site|t[ée]l[ée]travail|teletravail|full\s*remote)$/i.test(l.trim())
  );
  if (locs.length && job.location) {
    const locBag = normalizeToken(job.location);
    const hit = locs.some((l) => {
      const n = normalizeToken(l);
      return n && (locBag.includes(n) || n.includes(locBag.slice(0, 6)));
    });
    if (hit) scoreBase = Math.min(100, scoreBase + 3);
  }

  const avoided = profile.avoidedSectors ?? [];
  if (avoided.length) {
    const hay = `${job.company} ${job.description}`.toLowerCase();
    if (avoided.some((s) => s.trim() && hay.includes(s.toLowerCase()))) {
      scoreBase = Math.max(5, scoreBase - 10);
      redFlags.push("Secteur potentiellement à éviter selon vos préférences");
    }
  }

  const preferred = profile.preferredSectors ?? [];
  if (preferred.length) {
    const hay = `${job.company} ${job.description}`.toLowerCase();
    if (preferred.some((s) => s.trim() && hay.includes(s.toLowerCase()))) {
      scoreBase = Math.min(100, scoreBase + 5);
    }
  }

  const strengths: string[] = matchedTechs
    .slice(0, 4)
    .map((t) => `${t} déjà présent dans votre profil`);

  if (
    !strengths.length &&
    profile.targetRoles.some((r) =>
      job.title.toLowerCase().includes(r.toLowerCase().split(/\s+/)[0] ?? "")
    )
  ) {
    strengths.push(`Intitulé proche de vos rôles cibles (${profile.targetRoles[0]})`);
  }
  if (!strengths.length && profile.experienceYears && profile.experienceYears >= 3) {
    strengths.push(
      `${profile.experienceYears} ans d'expérience — base solide pour ce type de poste`
    );
  }
  if (!strengths.length) {
    strengths.push("Peu d'alignement technique direct détecté sur cette offre");
  }

  const gaps: string[] = missingTechs
    .slice(0, 4)
    .map((t) => `${t} non mentionné dans votre CV`);

  if (!gaps.length && matchedTechs.length && matchedTechs.length === jobTechs.length) {
    if (seniority && /senior|lead|staff/i.test(seniority) && (profile.experienceYears ?? 0) < 5) {
      gaps.push("Seniorité demandée potentiellement au-dessus de votre expérience affichée");
    }
  }

  const coverage =
    jobTechs.length === 0
      ? "stack peu explicite"
      : `${matchedTechs.length}/${jobTechs.length} techno${jobTechs.length > 1 ? "s" : ""} de l'offre couverte${matchedTechs.length > 1 ? "s" : ""}`;

  const raw = scoreBase + (redFlags.length ? -8 : 5) - missingTechs.length * 3;
  return {
    relevanceScore: Math.max(5, Math.min(100, raw)),
    redFlags,
    strengths: strengths.slice(0, 3),
    gaps: gaps.slice(0, 3),
    summary: `Correspondance ${coverage}${matchedTechs.length ? ` (${matchedTechs.slice(0, 3).join(", ")})` : ""}.`,
    extractedSalary: salaryMatch,
    extractedStack: jobTechs.length ? jobTechs : matchedTechs,
    extractedSeniority: seniority,
    extractedTitle: null,
    extractedCompany: null,
  };
}

/** Score rapide sans appel LLM — démo, seed et backfill liste. */
export function analyzeJobHeuristic(
  profile: ProfileContext,
  job: JobContext
): AnalysisResult {
  return heuristicAnalysis(profile, job);
}

export async function analyzeJobAgainstProfile(
  profile: ProfileContext,
  job: JobContext
): Promise<AnalysisResult> {
  const client = getClient();
  if (!client) return heuristicAnalysis(profile, job);

  const prompt = `Tu es un assistant de recrutement. Analyse cette offre par rapport au profil candidat.
Réponds UNIQUEMENT avec un JSON valide (pas de markdown) de la forme:
{
  "relevanceScore": number 0-100 (jamais négatif),
  "redFlags": string[],
  "strengths": string[],
  "gaps": string[],
  "summary": string (une phrase synthétique en français),
  "extractedSalary": string|null,
  "extractedStack": string[],
  "extractedSeniority": string|null,
  "extractedTitle": string|null (intitulé de poste court, pas un pitch entreprise),
  "extractedCompany": string|null (nom de l'entreprise uniquement)
}

Règles de rédaction (important) :
- strengths (3 max) : constats concrets, ex. "React déjà maîtrisé selon votre CV", "Expérience Node.js alignée avec le stack".
- gaps (3 max) : ce que L'OFFRE exige et que le candidat n'a pas (ou peu), ex. "Next.js non mentionné dans votre CV", "Pas d'expérience Kubernetes visible".
- Ne jamais écrire de libellés génériques du type "Écart possible : X" ou "Compétence alignée : X".
- Ne jamais mentionner "mode démo", "heuristique" ou "ANTHROPIC" dans summary/strengths/gaps.
- relevanceScore doit refléter la couverture réelle des exigences de l'offre (beaucoup d'écarts → score bas).
- Red flags typiques: salaire non précisé, expérience irréaliste, stack floue, remote "fake", culture toxique signalée dans le texte.

PROFIL:
- Rôles cibles: ${profile.targetRoles.join(", ") || "n/a"}
- Skills: ${profile.skills.join(", ") || "n/a"}
- Soft skills: ${(profile.softSkills ?? []).join(", ") || "n/a"}
- Années d'expérience: ${profile.experienceYears ?? "n/a"}
- Lieux préférés: ${profile.preferredLocations.join(", ") || "n/a"}
- Salaire souhaité: ${profile.salaryMin ?? "?"}-${profile.salaryMax ?? "?"} €
- Modes: ${(profile.workModes ?? []).join(", ") || "n/a"}
- Séniorité visée: ${profile.targetSeniority ?? "n/a"}
- Secteurs préférés: ${(profile.preferredSectors ?? []).join(", ") || "n/a"}
- Secteurs à éviter: ${(profile.avoidedSectors ?? []).join(", ") || "n/a"}
- CV:
${profile.cvText.slice(0, 6000)}

OFFRE:
- Titre: ${job.title}
- Entreprise: ${job.company}
- Lieu: ${job.location ?? "n/a"}
- Salaire brut champ: ${job.salaryRaw ?? "n/a"}
- Seniority champ: ${job.seniority ?? "n/a"}
- Tech stack champ: ${job.techStack.join(", ") || "n/a"}
- Description:
${job.description.slice(0, 8000)}`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n");

  return analysisSchema.parse(extractJson(text));
}

export async function generateCoverLetter(
  profile: ProfileContext,
  job: JobContext,
  companyToneHint?: string
): Promise<string> {
  const client = getClient();
  if (!client) {
    return `Madame, Monsieur,

Je vous contacte concernant le poste de ${job.title} chez ${job.company}.
Mon profil (${profile.targetRoles.join(", ") || "développeur"}) et mes compétences (${profile.skills.slice(0, 6).join(", ") || "à préciser"}) correspondent aux besoins de l'offre.

[Mode démo — configurez ANTHROPIC_API_KEY pour une lettre générée par Claude]

Cordialement`;
  }

  const prompt = `Rédige une lettre de motivation courte (180-280 mots) en français, professionnelle,
adaptée au ton de l'entreprise${companyToneHint ? ` (indice: ${companyToneHint})` : ""}.
Pas de markdown, texte brut uniquement.

PROFIL / CV (extrait):
${profile.cvText.slice(0, 5000)}
Skills: ${profile.skills.join(", ")}

OFFRE: ${job.title} chez ${job.company}
${job.description.slice(0, 4000)}`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  });

  return message.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n")
    .trim();
}
