import { Router } from "express";
import { z } from "zod";
import { ApplicationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { paramId } from "../lib/params.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";

export const applicationsRouter = Router();

applicationsRouter.use(requireAuth);

applicationsRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const status =
      typeof req.query.status === "string" &&
      Object.values(ApplicationStatus).includes(req.query.status as ApplicationStatus)
        ? (req.query.status as ApplicationStatus)
        : undefined;

    const applications = await prisma.application.findMany({
      where: { userId, ...(status ? { status } : {}) },
      include: {
        job: {
          include: {
            analyses: { where: { userId }, take: 1 },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    res.json(
      applications.map((app) => {
        const { analyses, ...jobRest } = app.job;
        return {
          ...app,
          job: {
            ...jobRest,
            analysis: analyses[0] ?? null,
          },
        };
      })
    );
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

    const application = await prisma.application.upsert({
      where: { jobId_userId: { jobId: body.jobId, userId } },
      create: {
        jobId: body.jobId,
        userId,
        status: body.status ?? "TO_APPLY",
        notes: body.notes,
        coverLetter: body.coverLetter,
      },
      update: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.coverLetter !== undefined ? { coverLetter: body.coverLetter } : {}),
      },
      include: { job: true },
    });

    res.status(201).json(application);
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
      })
      .parse(req.body);

    const existing = await prisma.application.findFirst({
      where: { id: paramId(req.params.id), userId },
    });
    if (!existing) throw new HttpError(404, "Application not found");

    const application = await prisma.application.update({
      where: { id: existing.id },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.coverLetter !== undefined ? { coverLetter: body.coverLetter } : {}),
      },
      include: { job: true },
    });

    res.json(application);
  } catch (err) {
    next(err);
  }
});
