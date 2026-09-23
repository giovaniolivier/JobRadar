import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [profile, analyzedThisWeek, scoreAgg, awaitingResponse, highScoreRecent, topAnalyses, pipelineApps, analysisCount] =
      await Promise.all([
        prisma.profile.findUnique({
          where: { userId },
          select: { cvText: true },
        }),
        prisma.analysis.count({
          where: { userId, createdAt: { gte: weekAgo } },
        }),
        prisma.analysis.aggregate({
          where: { userId },
          _avg: { relevanceScore: true },
          _count: true,
        }),
        prisma.application.count({
          where: { userId, status: "APPLIED" },
        }),
        prisma.analysis.count({
          where: {
            userId,
            relevanceScore: { gte: 70 },
            createdAt: { gte: dayAgo },
          },
        }),
        prisma.analysis.findMany({
          where: {
            userId,
            relevanceScore: { gte: 0 },
            job: {
              OR: [
                { applications: { none: { userId } } },
                { applications: { some: { userId, status: "TO_APPLY" } } },
              ],
            },
          },
          include: {
            job: {
              include: {
                applications: { where: { userId }, take: 1 },
              },
            },
          },
          orderBy: { relevanceScore: "desc" },
          take: 5,
        }),
        prisma.application.findMany({
          where: {
            userId,
            status: { in: ["INTERVIEW", "APPLIED"] },
          },
          include: {
            job: { select: { id: true, title: true, company: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: 5,
        }),
        prisma.analysis.count({ where: { userId } }),
      ]);

    const hasCv = Boolean(profile?.cvText?.trim());
    const needsOnboarding = !hasCv && analysisCount === 0;

    const avgScore =
      scoreAgg._count > 0 && scoreAgg._avg.relevanceScore != null
        ? Math.round(scoreAgg._avg.relevanceScore)
        : null;

    let activityHint: string | null = null;
    if (highScoreRecent > 0) {
      activityHint =
        highScoreRecent === 1
          ? "1 nouvelle offre à fort score depuis hier"
          : `${highScoreRecent} nouvelles offres à fort score depuis hier`;
    } else if (analyzedThisWeek > 0) {
      activityHint = `${analyzedThisWeek} offre${analyzedThisWeek > 1 ? "s" : ""} analysée${analyzedThisWeek > 1 ? "s" : ""} cette semaine`;
    }

    const topOffers = topAnalyses.map((a) => ({
      id: a.job.id,
      title: a.job.title,
      company: a.job.company,
      location: a.job.location,
      relevanceScore: a.relevanceScore,
      redFlags: a.redFlags,
      summary: a.summary,
      applicationStatus: a.job.applications[0]?.status ?? null,
    }));

    const pipelineFocus = pipelineApps.map((app) => {
      const days = Math.max(
        0,
        Math.round((now.getTime() - app.updatedAt.getTime()) / (24 * 60 * 60 * 1000))
      );
      let hint: string;
      if (app.status === "INTERVIEW") {
        hint = days === 0 ? "Entretien — mis à jour aujourd'hui" : `Entretien — suivi il y a ${days} j`;
      } else {
        hint =
          days === 0
            ? "Candidature envoyée — en attente de réponse"
            : `Relance possible — candidaté il y a ${days} j`;
      }
      return {
        id: app.id,
        jobId: app.jobId,
        status: app.status,
        title: app.job.title,
        company: app.job.company,
        hint,
        updatedAt: app.updatedAt.toISOString(),
      };
    });

    res.json({
      needsOnboarding,
      hasCv,
      stats: {
        analyzedThisWeek,
        avgScore,
        awaitingResponse,
        activityHint,
        totalAnalyses: analysisCount,
      },
      topOffers,
      pipelineFocus,
    });
  } catch (err) {
    next(err);
  }
});
