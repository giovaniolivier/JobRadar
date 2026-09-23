import { Router } from "express";
import { z } from "zod";
import { ApplicationStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { paramId } from "../lib/params.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";
import {
  needsJobMetadataRepair,
  repairJobMetadataFromDescription,
} from "../services/ingestion.js";
import { analyzeJobHeuristic } from "../services/ai.js";

export const applicationsRouter = Router();

applicationsRouter.use(requireAuth);

type StatusEvent = { status: ApplicationStatus; at: string };

function parseHistory(raw: unknown): StatusEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is StatusEvent =>
      e != null &&
      typeof e === "object" &&
      typeof (e as StatusEvent).status === "string" &&
      typeof (e as StatusEvent).at === "string"
  );
}

function appendStatus(
  history: StatusEvent[],
  status: ApplicationStatus,
  at = new Date()
): StatusEvent[] {
  const last = history[history.length - 1];
  if (last?.status === status) return history;
  return [...history, { status, at: at.toISOString() }];
}

function mapApplication(app: {
  job: { analyses: unknown[] } & Record<string, unknown>;
  statusHistory?: unknown;
  [key: string]: unknown;
}) {
  const { analyses, ...jobRest } = app.job;
  return {
    ...app,
    statusHistory: parseHistory(app.statusHistory),
    job: {
      ...jobRest,
      analysis: (analyses[0] as unknown) ?? null,
    },
  };
}

function clampScore(n: number) {
  return Math.max(5, Math.min(100, Math.round(n)));
}

/** Répare titre/entreprise et recalcule le score si l’analyse date d’un mauvais mapping. */
async function hydrateApplicationJob(
  app: {
    job: {
      id: string;
      title: string;
      company: string;
      description: string;
      location: string | null;
      salaryRaw: string | null;
      techStack: string[];
      seniority: string | null;
      analyses: Array<{
        id: string;
        relevanceScore: number;
        summary: string;
        gaps?: string[];
        strengths?: string[];
      }>;
    };
  },
  userId: string,
  profile: {
    cvText: string;
    skills: string[];
    targetRoles: string[];
    experienceYears: number | null;
    preferredLocations: string[];
  } | null
) {
  let repaired = false;
  if (needsJobMetadataRepair(app.job)) {
    const fixed = repairJobMetadataFromDescription(app.job);
    if (fixed.title !== app.job.title || fixed.company !== app.job.company) {
      const updated = await prisma.job.update({
        where: { id: app.job.id },
        data: { title: fixed.title, company: fixed.company },
      });
      app.job.title = updated.title;
      app.job.company = updated.company;
      repaired = true;
    }
  }

  const analysis = app.job.analyses[0];
  const staleCopy =
    analysis != null &&
    (/écart possible\s*:/i.test(analysis.summary ?? "") ||
      analysis.gaps?.some((g) => /écart possible\s*:/i.test(g)) === true ||
      /mode démo|heuristique \(mode/i.test(analysis.summary ?? "") ||
      analysis.strengths?.some((s) => /mode démo/i.test(s)) === true);

  // Score ≤ 5, mapping réparé, ou libellés mécaniques d’ancienne heuristique → recalcul
  const shouldRescore =
    Boolean(profile?.cvText?.trim()) &&
    (repaired || staleCopy || (analysis != null && analysis.relevanceScore <= 5));

  if (shouldRescore && profile) {
    const result = analyzeJobHeuristic(profile, app.job);
    const score = clampScore(result.relevanceScore);
    const saved = await prisma.analysis.upsert({
      where: { jobId_userId: { jobId: app.job.id, userId } },
      create: {
        jobId: app.job.id,
        userId,
        relevanceScore: score,
        redFlags: result.redFlags,
        strengths: result.strengths,
        gaps: result.gaps,
        summary: result.summary,
        extractedSalary: result.extractedSalary ?? null,
        extractedStack: result.extractedStack,
        extractedSeniority: result.extractedSeniority ?? null,
      },
      update: {
        relevanceScore: score,
        redFlags: result.redFlags,
        strengths: result.strengths,
        gaps: result.gaps,
        summary: result.summary,
        extractedSalary: result.extractedSalary ?? null,
        extractedStack: result.extractedStack,
        extractedSeniority: result.extractedSeniority ?? null,
      },
    });
    app.job.analyses[0] = saved as (typeof app.job.analyses)[0];
  } else if (analysis && (analysis.relevanceScore < 5 || analysis.relevanceScore > 100)) {
    const clamped = clampScore(analysis.relevanceScore);
    const updated = await prisma.analysis.update({
      where: { id: analysis.id },
      data: { relevanceScore: clamped },
    });
    app.job.analyses[0] = updated as (typeof app.job.analyses)[0];
  }
}

applicationsRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const status =
      typeof req.query.status === "string" &&
      Object.values(ApplicationStatus).includes(req.query.status as ApplicationStatus)
        ? (req.query.status as ApplicationStatus)
        : undefined;

    const [applications, profile] = await Promise.all([
      prisma.application.findMany({
        where: { userId, ...(status ? { status } : {}) },
        include: {
          job: {
            include: {
              analyses: { where: { userId }, take: 1 },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.profile.findUnique({ where: { userId } }),
    ]);

    await Promise.all(applications.map((app) => hydrateApplicationJob(app, userId, profile)));

    res.json(applications.map((app) => mapApplication(app)));
  } catch (err) {
    next(err);
  }
});

applicationsRouter.get("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const [application, profile] = await Promise.all([
      prisma.application.findFirst({
        where: { id: paramId(req.params.id), userId },
        include: {
          job: {
            include: {
              analyses: { where: { userId }, take: 1 },
            },
          },
        },
      }),
      prisma.profile.findUnique({ where: { userId } }),
    ]);
    if (!application) throw new HttpError(404, "Application not found");
    await hydrateApplicationJob(application, userId, profile);
    res.json(mapApplication(application));
  } catch (err) {
    next(err);
  }
});

applicationsRouter.post("/", async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const body = z
      .object({
        jobId: z.string().min(1),
        status: z.nativeEnum(ApplicationStatus).optional(),
        notes: z.string().optional(),
        coverLetter: z.string().optional(),
      })
      .parse(req.body);

    const job = await prisma.job.findUnique({ where: { id: body.jobId } });
    if (!job) throw new HttpError(404, "Job not found");

    const status = body.status ?? "TO_APPLY";
    const now = new Date();

    const existing = await prisma.application.findUnique({
      where: { jobId_userId: { jobId: body.jobId, userId } },
    });

    let application;
    if (existing) {
      const history = appendStatus(parseHistory(existing.statusHistory), status, now);
      application = await prisma.application.update({
        where: { id: existing.id },
        data: {
          status,
          statusHistory: history as unknown as Prisma.InputJsonValue,
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          ...(body.coverLetter !== undefined ? { coverLetter: body.coverLetter } : {}),
        },
        include: {
          job: { include: { analyses: { where: { userId }, take: 1 } } },
        },
      });
    } else {
      application = await prisma.application.create({
        data: {
          jobId: body.jobId,
          userId,
          status,
          notes: body.notes,
          coverLetter: body.coverLetter,
          statusHistory: [{ status, at: now.toISOString() }] as unknown as Prisma.InputJsonValue,
        },
        include: {
          job: { include: { analyses: { where: { userId }, take: 1 } } },
        },
      });
    }

    res.status(201).json(mapApplication(application));
  } catch (err) {
    next(err);
  }
});

applicationsRouter.patch("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const body = z
      .object({
        status: z.nativeEnum(ApplicationStatus).optional(),
        notes: z.string().nullable().optional(),
        coverLetter: z.string().nullable().optional(),
        outcome: z.enum(["accepted", "rejected"]).nullable().optional(),
        followUpAt: z.string().datetime().nullable().optional(),
      })
      .parse(req.body);

    const existing = await prisma.application.findFirst({
      where: { id: paramId(req.params.id), userId },
    });
    if (!existing) throw new HttpError(404, "Application not found");

    const now = new Date();
    let history = parseHistory(existing.statusHistory);
    if (history.length === 0) {
      history = [{ status: existing.status, at: existing.createdAt.toISOString() }];
    }
    if (body.status && body.status !== existing.status) {
      history = appendStatus(history, body.status, now);
    }

    const application = await prisma.application.update({
      where: { id: existing.id },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.coverLetter !== undefined ? { coverLetter: body.coverLetter } : {}),
        ...(body.outcome !== undefined ? { outcome: body.outcome } : {}),
        ...(body.followUpAt !== undefined
          ? { followUpAt: body.followUpAt ? new Date(body.followUpAt) : null }
          : {}),
        statusHistory: history as unknown as Prisma.InputJsonValue,
      },
      include: {
        job: { include: { analyses: { where: { userId }, take: 1 } } },
      },
    });

    res.json(mapApplication(application));
  } catch (err) {
    next(err);
  }
});
