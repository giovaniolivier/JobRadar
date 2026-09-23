import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

export type NotificationItem = {
  id: string;
  type: "followup" | "response" | "high_score";
  title: string;
  body: string;
  href: string;
  createdAt: string;
};

notificationsRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const now = Date.now();
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000);

    const [followups, responses, highScores] = await Promise.all([
      prisma.application.findMany({
        where: {
          userId,
          status: "APPLIED",
          updatedAt: { lte: threeDaysAgo },
        },
        include: { job: { select: { id: true, title: true, company: true } } },
        orderBy: { updatedAt: "asc" },
        take: 8,
      }),
      prisma.application.findMany({
        where: {
          userId,
          status: "RESPONSE",
          updatedAt: { gte: dayAgo },
        },
        include: { job: { select: { id: true, title: true, company: true } } },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
      prisma.analysis.findMany({
        where: {
          userId,
          relevanceScore: { gte: 70 },
          createdAt: { gte: dayAgo },
        },
        include: { job: { select: { id: true, title: true, company: true } } },
        orderBy: { relevanceScore: "desc" },
        take: 8,
      }),
    ]);

    const items: NotificationItem[] = [];

    for (const app of followups) {
      items.push({
        id: `followup-${app.id}`,
        type: "followup",
        title: "Relance à faire",
        body: `${app.job.title} — ${app.job.company}`,
        href: `/pipeline`,
        createdAt: app.updatedAt.toISOString(),
      });
    }
    for (const app of responses) {
      items.push({
        id: `response-${app.id}`,
        type: "response",
        title: "Réponse reçue",
        body: `${app.job.title} — ${app.job.company}`,
        href: `/pipeline`,
        createdAt: app.updatedAt.toISOString(),
      });
    }
    for (const a of highScores) {
      items.push({
        id: `high-${a.id}`,
        type: "high_score",
        title: `Offre à fort score (${a.relevanceScore})`,
        body: `${a.job.title} — ${a.job.company}`,
        href: `/offers/${a.job.id}`,
        createdAt: a.createdAt.toISOString(),
      });
    }

    items.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

    res.json({ items: items.slice(0, 20) });
  } catch (err) {
    next(err);
  }
});
