import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const analysisSchema = z.object({
  relevanceScore: z.number().min(0).max(100),
  redFlags: z.array(z.string()).default([]),
  strengths: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  summary: z.string(),
  extractedSalary: z.string().nullable().optional(),
  extractedStack: z.array(z.string()).default([]),
  extractedSeniority: z.string().nullable().optional(),
});

export type AnalysisResult = z.infer<typeof analysisSchema>;

type ProfileContext = {
  cvText: string;
  skills: string[];
  targetRoles: string[];
  experienceYears: number | null;
  preferredLocations: string[];
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

function heuristicAnalysis(profile: ProfileContext, job: JobContext): AnalysisResult {
  const haystack = `${job.title} ${job.description} ${job.techStack.join(" ")}`.toLowerCase();
  const skills = profile.skills.map((s) => s.toLowerCase()).filter(Boolean);
  const matches = skills.filter((s) => haystack.includes(s));
  const scoreBase = skills.length ? Math.round((matches.length / skills.length) * 80) : 50;

  const redFlags: string[] = [];
  if (!job.salaryRaw && !/€|\$|salary|rémunération|salaire/i.test(job.description)) {
    redFlags.push("Salaire non précisé");
  }
  if (/10\+?\s*ans|15\s*ans|senior\s*\+\+|expert\s*confirmé/i.test(job.description)) {
    redFlags.push("Expérience potentiellement irréaliste demandée");
  }
  if (/urgent|immédiat|asap/i.test(job.description) && !job.salaryRaw) {
    redFlags.push("Urgence affichée sans fourchette salariale");
  }

  const salaryMatch =
    job.salaryRaw ?? job.description.match(/(\d[\d\s]{2,}\s*(?:€|k€|EUR|\$))/i)?.[1] ?? null;

  const stackFromText = Array.from(
    new Set([...job.techStack, ...matches.map((m) => m)].filter(Boolean))
  ).slice(0, 12);

  const seniority =
    job.seniority ?? (/(junior|confirmé|senior|lead|staff)/i.exec(job.description)?.[1] ?? null);

  return {
    relevanceScore: Math.min(100, scoreBase + (redFlags.length ? -5 : 10)),
    redFlags,
    strengths: matches.length
      ? matches.slice(0, 5).map((m) => `Compétence alignée : ${m}`)
      : ["Profil partiellement comparable (mode démo)"],
    gaps: skills
      .filter((s) => !matches.includes(s))
      .slice(0, 5)
      .map((s) => `Écart possible : ${s}`),
    summary: matches.length
      ? `Correspondance partielle sur ${matches.join(", ")}. Score heuristique (mode démo sans clé Anthropic).`
      : "Analyse heuristique (mode démo) : complétez votre profil et configurez ANTHROPIC_API_KEY pour une analyse Claude.",
    extractedSalary: salaryMatch,
    extractedStack: stackFromText,
    extractedSeniority: seniority,
  };
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
  "relevanceScore": number 0-100,
  "redFlags": string[],
  "strengths": string[],
  "gaps": string[],
  "summary": string (une phrase synthétique),
  "extractedSalary": string|null,
  "extractedStack": string[],
  "extractedSeniority": string|null
}

strengths = points forts du candidat pour cette offre (3 max).
gaps = écarts à combler (3 max).
Red flags typiques: salaire non précisé, expérience irréaliste, stack floue, remote "fake", culture toxique signalée dans le texte.

PROFIL:
- Rôles cibles: ${profile.targetRoles.join(", ") || "n/a"}
- Skills: ${profile.skills.join(", ") || "n/a"}
- Années d'expérience: ${profile.experienceYears ?? "n/a"}
- Lieux préférés: ${profile.preferredLocations.join(", ") || "n/a"}
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
