import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { paramId } from "../lib/params.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";
import { analyzeJobAgainstProfile, generateCoverLetter } from "../services/ai.js";
import {
  importManualJobs,
  parseJobsCsv,
  parsePastedJob,
  syncRemotive,
  type ManualJobInput,
} from "../services/ingestion.js";

export const offersRouter = Router();

offersRouter.use(requireAuth);

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

    const mapped = jobs
      .map((job) => {
        const { analyses, applications, ...rest } = job;
        return {
          ...rest,
          analysis: analyses[0] ?? null,
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
offersRouter.post("/", async (req, res, next) => {
  try {
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

    const created = await importManualJobs(toImport);
    res.status(201).json({ count: created.length, offers: created });
  } catch (err) {
    next(err);
  }
});

/** Bonus: sync Remotive (ingestion externe) */
offersRouter.post("/sync", async (req, res, next) => {
  try {
    const body = z.object({ search: z.string().optional() }).parse(req.body ?? {});
    const result = await syncRemotive(body.search);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

offersRouter.get("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const id = paramId(req.params.id);
    const job = await prisma.job.findUnique({
      where: { id },
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
    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) throw new HttpError(404, "Offer not found");

    const profile = await prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new HttpError(400, "Upload your CV first (POST /auth/upload-cv)");

    const result = await analyzeJobAgainstProfile(profile, job);

    const analysis = await prisma.analysis.upsert({
      where: { jobId_userId: { jobId: job.id, userId } },
      create: {
        jobId: job.id,
        userId,
        relevanceScore: Math.round(result.relevanceScore),
        redFlags: result.redFlags,
        summary: result.summary,
        extractedSalary: result.extractedSalary ?? null,
        extractedStack: result.extractedStack,
        extractedSeniority: result.extractedSeniority ?? null,
      },
      update: {
        relevanceScore: Math.round(result.relevanceScore),
        redFlags: result.redFlags,
        summary: result.summary,
        extractedSalary: result.extractedSalary ?? null,
        extractedStack: result.extractedStack,
        extractedSeniority: result.extractedSeniority ?? null,
      },
    });

    if (result.extractedStack.length || result.extractedSalary || result.extractedSeniority) {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          ...(result.extractedStack.length ? { techStack: result.extractedStack } : {}),
          ...(result.extractedSalary ? { salaryRaw: result.extractedSalary } : {}),
          ...(result.extractedSeniority ? { seniority: result.extractedSeniority } : {}),
        },
      });
    }

    res.json(analysis);
  } catch (err) {
    next(err);
  }
});

offersRouter.post("/:id/generate-letter", async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const id = paramId(req.params.id);
    const body = z.object({ tone: z.string().optional() }).parse(req.body ?? {});
    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) throw new HttpError(404, "Offer not found");

    const profile = await prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new HttpError(400, "Upload your CV first (POST /auth/upload-cv)");

    const coverLetter = await generateCoverLetter(profile, job, body.tone);

    const application = await prisma.application.upsert({
      where: { jobId_userId: { jobId: job.id, userId } },
      create: {
        jobId: job.id,
        userId,
        status: "TO_APPLY",
        coverLetter,
      },
      update: { coverLetter },
    });

    res.json({ coverLetter, application });
  } catch (err) {
    next(err);
  }
});
