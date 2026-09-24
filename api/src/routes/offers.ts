import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { paramId } from "../lib/params.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";
import { analyzeJobAgainstProfile, analyzeJobHeuristic, anthropicErrorMessage, generateCoverLetter } from "../services/ai.js";
import { notifyHighScoreAnalysis } from "../services/emailNotifications.js";
import {
  importManualJobs,
  parseJobsCsv,
  parsePastedJob,
  needsJobMetadataRepair,
  repairJobMetadataFromDescription,
  syncRemotive,
  type ManualJobInput,
} from "../services/ingestion.js";

async function findOwnedJob(id: string, userId: string) {
  return prisma.job.findFirst({ where: { id, userId } });
}

export const offersRouter = Router();

offersRouter.use(requireAuth);

function clampScore(n: number) {
  return Math.max(5, Math.min(100, Math.round(n)));
}

const jobInputSchema = z.object({
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().optional(),
  salaryRaw: z.string().optional(),
  description: z.string().min(1),
  techStack: z.array(z.string()).optional(),
  seniority: z.string().optional(),
  url: z.string().optional(),
});

/** GET /offers — liste avec filtres (score, salaire, remote, stack) */
offersRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const minScore = req.query.minScore ? Number(req.query.minScore) : undefined;
    const source = typeof req.query.source === "string" ? req.query.source : undefined;
    const location =
      typeof req.query.location === "string" ? req.query.location : undefined;
    const tech = typeof req.query.tech === "string" ? req.query.tech : undefined;
    const stack = typeof req.query.stack === "string" ? req.query.stack : tech;
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const remote =
      req.query.remote === "true" || req.query.remote === "1" || req.query.remote === "yes";
    const hasSalary =
      req.query.salary === "true" ||
      req.query.salary === "1" ||
      req.query.hasSalary === "true";

    const jobs = await prisma.job.findMany({
      where: {
        userId,
        AND: [
          ...(source ? [{ source }] : []),
          ...(location ? [{ location: { contains: location, mode: "insensitive" as const } }] : []),
          ...(remote
            ? [{ location: { contains: "remote", mode: "insensitive" as const } }]
            : []),
          ...(hasSalary ? [{ salaryRaw: { not: null } }] : []),
          ...(stack ? [{ techStack: { has: stack } }] : []),
          ...(q
            ? [
                {
                  OR: [
                    { title: { contains: q, mode: "insensitive" as const } },
                    { company: { contains: q, mode: "insensitive" as const } },
                    { description: { contains: q, mode: "insensitive" as const } },
                  ],
                },
              ]
            : []),
        ],
      },
      include: {
        analyses: { where: { userId }, take: 1 },
        applications: { where: { userId }, take: 1 },
      },
      orderBy: { fetchedAt: "desc" },
      take: 100,
    });

    const profile = await prisma.profile.findUnique({ where: { userId } });

    // Backfill heuristique pour les offres jamais scorées (seed / Remotive / import)
    // afin d’éviter des N/A en démo — sans appel LLM.
    if (profile?.cvText?.trim()) {
      const missing = jobs.filter((j) => !j.analyses[0]);
      await Promise.all(
        missing.map(async (job) => {
          const result = analyzeJobHeuristic(profile, job);
          const analysis = await prisma.analysis.upsert({
            where: { jobId_userId: { jobId: job.id, userId } },
            create: {
              jobId: job.id,
              userId,
              relevanceScore: clampScore(result.relevanceScore),
              redFlags: result.redFlags,
              strengths: result.strengths,
              gaps: result.gaps,
              summary: result.summary,
              extractedSalary: result.extractedSalary ?? null,
              extractedStack: result.extractedStack,
              extractedSeniority: result.extractedSeniority ?? null,
            },
            update: {},
          });
          job.analyses = [analysis];
        })
      );
    }

    const mapped = jobs
      .map((job) => {
        const { analyses, applications, ...rest } = job;
        let title = rest.title;
        let company = rest.company;
        if (needsJobMetadataRepair(rest)) {
          const fixed = repairJobMetadataFromDescription(rest);
          title = fixed.title;
          company = fixed.company;
          if (title !== rest.title || company !== rest.company) {
            void prisma.job
              .update({ where: { id: job.id }, data: { title, company } })
              .catch(() => undefined);
          }
        }
        const analysis = analyses[0]
          ? {
              ...analyses[0],
              relevanceScore: clampScore(analyses[0].relevanceScore),
            }
          : null;
        if (analysis && analyses[0] && analysis.relevanceScore !== analyses[0].relevanceScore) {
          void prisma.analysis
            .update({
              where: { id: analyses[0].id },
              data: { relevanceScore: analysis.relevanceScore },
            })
            .catch(() => undefined);
        }
        return {
          ...rest,
          title,
          company,
          analysis,
          application: applications[0] ?? null,
        };
      })
      .filter((job) => {
        if (minScore === undefined || Number.isNaN(minScore)) return true;
        return (job.analysis?.relevanceScore ?? -1) >= minScore;
      });

    res.json(mapped);
  } catch (err) {
    next(err);
  }
});

/** POST /offers — ajouter une offre (manuel / CSV / texte) */
offersRouter.post("/", async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const body = z
      .object({
        csv: z.string().optional(),
        text: z.string().optional(),
        title: z.string().optional(),
        company: z.string().optional(),
        location: z.string().optional(),
        salaryRaw: z.string().optional(),
        description: z.string().optional(),
        techStack: z.array(z.string()).optional(),
        seniority: z.string().optional(),
        url: z.string().optional(),
        offers: z.array(jobInputSchema).optional(),
        jobs: z.array(jobInputSchema).optional(),
      })
      .parse(req.body ?? {});

    let toImport: ManualJobInput[] = [...(body.offers ?? []), ...(body.jobs ?? [])];

    if (body.csv) toImport = [...toImport, ...parseJobsCsv(body.csv)];
    if (body.text) toImport = [...toImport, parsePastedJob(body.text)];

    if (body.title && body.company && body.description) {
      toImport.push({
        title: body.title,
        company: body.company,
        location: body.location,
        salaryRaw: body.salaryRaw,
        description: body.description,
        techStack: body.techStack,
        seniority: body.seniority,
        url: body.url,
      });
    }

    if (!toImport.length) {
      throw new HttpError(400, "Provide csv, text, a single offer, or offers[]");
    }

    const created = await importManualJobs(userId, toImport);
    res.status(201).json({ count: created.length, offers: created });
  } catch (err) {
    next(err);
  }
});

const MIN_OFFER_TEXT = 80;

/** POST /offers/analyze-new — créer + analyser une offre en une requête (panneau dashboard) */
offersRouter.post("/analyze-new", async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const body = z
      .object({
        description: z.string().min(1),
        title: z.string().optional(),
        company: z.string().optional(),
        url: z.string().optional(),
        location: z.string().optional(),
      })
      .parse(req.body ?? {});

    const description = body.description.trim();
    if (description.length < MIN_OFFER_TEXT) {
      throw new HttpError(
        400,
        "Collez le texte complet de l'offre pour lancer l'analyse."
      );
    }

    const profile = await prisma.profile.findUnique({ where: { userId } });
    if (!profile?.cvText?.trim()) {
      throw new HttpError(
        400,
        "Importez votre CV pour comparer les offres à votre profil."
      );
    }

    const parsed = parsePastedJob(description);
    const title = body.title?.trim() || parsed.title;
    const company = body.company?.trim() || parsed.company;
    const url = body.url?.trim() || parsed.url;

    const [job] = await importManualJobs(userId, [
      {
        title,
        company,
        description,
        url,
        location: body.location?.trim() || undefined,
      },
    ]);

    try {
      const result = await analyzeJobAgainstProfile(profile, job!);
      const score = clampScore(result.relevanceScore);

      const metaRepair = needsJobMetadataRepair(job!)
        ? repairJobMetadataFromDescription(job!)
        : { title: job!.title, company: job!.company };
      const nextTitle = result.extractedTitle?.trim() || metaRepair.title;
      const nextCompany = result.extractedCompany?.trim() || metaRepair.company;

      const analysis = await prisma.analysis.upsert({
        where: { jobId_userId: { jobId: job!.id, userId } },
        create: {
          jobId: job!.id,
          userId,
          relevanceScore: score,
          redFlags: result.redFlags,
          strengths: result.strengths ?? [],
          gaps: result.gaps ?? [],
          summary: result.summary,
          extractedSalary: result.extractedSalary ?? null,
          extractedStack: result.extractedStack,
          extractedSeniority: result.extractedSeniority ?? null,
        },
        update: {
          relevanceScore: score,
          redFlags: result.redFlags,
          strengths: result.strengths ?? [],
          gaps: result.gaps ?? [],
          summary: result.summary,
          extractedSalary: result.extractedSalary ?? null,
          extractedStack: result.extractedStack,
          extractedSeniority: result.extractedSeniority ?? null,
        },
      });

      const jobPatch: {
        techStack?: string[];
        salaryRaw?: string;
        seniority?: string;
        title?: string;
        company?: string;
      } = {};
      if (result.extractedStack.length) jobPatch.techStack = result.extractedStack;
      if (result.extractedSalary) jobPatch.salaryRaw = result.extractedSalary;
      if (result.extractedSeniority) jobPatch.seniority = result.extractedSeniority;
      if (nextTitle && nextTitle !== job!.title) jobPatch.title = nextTitle;
      if (nextCompany && nextCompany !== job!.company) jobPatch.company = nextCompany;

      if (Object.keys(jobPatch).length) {
        await prisma.job.update({ where: { id: job!.id }, data: jobPatch });
      }

      const fresh = await prisma.job.findFirstOrThrow({
        where: { id: job!.id, userId },
        include: {
          analyses: { where: { userId }, take: 1 },
          applications: { where: { userId }, take: 1 },
        },
      });
      const { analyses, applications, ...rest } = fresh;
      void notifyHighScoreAnalysis({
        userId,
        analysisId: analysis.id,
        score,
        jobTitle: rest.title,
        company: rest.company,
        jobId: rest.id,
      }).catch(() => undefined);
      res.status(201).json({
        ...rest,
        analysis: analyses[0] ?? analysis,
        application: applications[0] ?? null,
      });
    } catch (err) {
      await prisma.job.delete({ where: { id: job!.id } }).catch(() => undefined);
      if (err instanceof HttpError) throw err;
      throw new HttpError(502, anthropicErrorMessage(err));
    }
  } catch (err) {
    next(err);
  }
});

/** Bonus: sync Remotive (ingestion externe) — scoped à l’utilisateur */
offersRouter.post("/sync", async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const body = z.object({ search: z.string().optional() }).parse(req.body ?? {});
    const result = await syncRemotive(userId, body.search);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

offersRouter.get("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const id = paramId(req.params.id);
    const job = await prisma.job.findFirst({
      where: { id, userId },
      include: {
        analyses: { where: { userId }, take: 1 },
        applications: { where: { userId }, take: 1 },
      },
    });
    if (!job) throw new HttpError(404, "Offer not found");

    const { analyses, applications, ...rest } = job;
    res.json({
      ...rest,
      analysis: analyses[0] ?? null,
      application: applications[0] ?? null,
    });
  } catch (err) {
    next(err);
  }
});

offersRouter.post("/:id/analyze", async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const id = paramId(req.params.id);
    const job = await findOwnedJob(id, userId);
    if (!job) throw new HttpError(404, "Offer not found");

    const profile = await prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new HttpError(400, "Upload your CV first (POST /auth/upload-cv)");

    const result = await analyzeJobAgainstProfile(profile, job);
    const score = clampScore(result.relevanceScore);

    const metaRepair = needsJobMetadataRepair(job)
      ? repairJobMetadataFromDescription(job)
      : { title: job.title, company: job.company };
    const nextTitle = result.extractedTitle?.trim() || metaRepair.title;
    const nextCompany = result.extractedCompany?.trim() || metaRepair.company;

    const analysis = await prisma.analysis.upsert({
      where: { jobId_userId: { jobId: job.id, userId } },
      create: {
        jobId: job.id,
        userId,
        relevanceScore: score,
        redFlags: result.redFlags,
        strengths: result.strengths ?? [],
        gaps: result.gaps ?? [],
        summary: result.summary,
        extractedSalary: result.extractedSalary ?? null,
        extractedStack: result.extractedStack,
        extractedSeniority: result.extractedSeniority ?? null,
      },
      update: {
        relevanceScore: score,
        redFlags: result.redFlags,
        strengths: result.strengths ?? [],
        gaps: result.gaps ?? [],
        summary: result.summary,
        extractedSalary: result.extractedSalary ?? null,
        extractedStack: result.extractedStack,
        extractedSeniority: result.extractedSeniority ?? null,
      },
    });

    if (result.extractedStack.length || result.extractedSalary || result.extractedSeniority || nextTitle !== job.title || nextCompany !== job.company) {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          ...(result.extractedStack.length ? { techStack: result.extractedStack } : {}),
          ...(result.extractedSalary ? { salaryRaw: result.extractedSalary } : {}),
          ...(result.extractedSeniority ? { seniority: result.extractedSeniority } : {}),
          ...(nextTitle !== job.title ? { title: nextTitle } : {}),
          ...(nextCompany !== job.company ? { company: nextCompany } : {}),
        },
      });
    }

    void notifyHighScoreAnalysis({
      userId,
      analysisId: analysis.id,
      score,
      jobTitle: nextTitle || job.title,
      company: nextCompany || job.company,
      jobId: job.id,
    }).catch(() => undefined);

    res.json(analysis);
  } catch (err) {
    next(err);
  }
});

offersRouter.post("/:id/generate-letter", async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const id = paramId(req.params.id);
    const body = z
      .object({
        tone: z.enum(["formal", "neutral", "direct"]).optional(),
        length: z.enum(["short", "standard", "detailed"]).optional(),
        highlight: z.string().max(500).optional(),
        /** Si false, renvoie la lettre sans l’écrire sur la candidature (brouillon local). */
        save: z.boolean().optional().default(true),
      })
      .parse(req.body ?? {});

    const job = await findOwnedJob(id, userId);
    if (!job) throw new HttpError(404, "Offer not found");

    const profile = await prisma.profile.findUnique({ where: { userId } });
    if (!profile?.cvText?.trim()) {
      throw new HttpError(400, "Importez votre CV pour générer une lettre");
    }

    const { coverLetter, demo } = await generateCoverLetter(profile, job, {
      tone: body.tone,
      length: body.length,
      highlight: body.highlight,
    });

    let application = null;
    if (body.save) {
      application = await prisma.application.upsert({
        where: { jobId_userId: { jobId: job.id, userId } },
        create: {
          jobId: job.id,
          userId,
          status: "TO_APPLY",
          coverLetter,
          statusHistory: [{ status: "TO_APPLY", at: new Date().toISOString() }],
        },
        update: { coverLetter },
      });
    }

    res.json({ coverLetter, demo, application });
  } catch (err) {
    next(err);
  }
});
