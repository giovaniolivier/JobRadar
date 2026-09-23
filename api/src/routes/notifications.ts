import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

export type NotificationType = "high_score" | "followup" | "interview" | "digest";

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  jobId?: string;
  applicationId?: string;
  createdAt: string;
};

const HIGH_SCORE_MIN = 70;
const FOLLOWUP_DAYS = 7;
const MAX_ITEMS = 15;

function daysBetween(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay(); // 0 Sun
  const diff = day === 0 ? 6 : day - 1; // Monday start
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - diff);
  return x;
}

function formatInterviewWhen(at: Date, now: Date) {
  const sameDay =
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    at.getFullYear() === tomorrow.getFullYear() &&
    at.getMonth() === tomorrow.getMonth() &&
    at.getDate() === tomorrow.getDate();

  const time = at.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `aujourd’hui à ${time}`;
  if (isTomorrow) return `demain à ${time}`;
  const day = at.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
  return `${day} à ${time}`;
}

function hoursAgo(now: Date, h: number) {
  return new Date(now.getTime() - h * 60 * 60 * 1000).toISOString();
}

function daysAgo(now: Date, d: number) {
  return new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString();
}

/** Trois exemples de types différents pour peupler le centre (démo / portfolio). */
async function buildShowcaseSamples(userId: string, now: Date): Promise<NotificationItem[]> {
  const [topAnalysis, appliedApp, interviewApp] = await Promise.all([
    prisma.analysis.findFirst({
      where: { userId },
      include: { job: { select: { id: true, title: true, company: true } } },
      orderBy: [{ relevanceScore: "desc" }, { createdAt: "desc" }],
    }),
    prisma.application.findFirst({
      where: { userId, status: "APPLIED" },
      include: { job: { select: { id: true, title: true, company: true } } },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.application.findFirst({
      where: { userId, status: "INTERVIEW" },
      include: { job: { select: { id: true, title: true, company: true } } },
      orderBy: { followUpAt: "asc" },
    }),
  ]);

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(14, 0, 0, 0);

  const high: NotificationItem = topAnalysis
    ? {
        id: `demo-high-${topAnalysis.id}`,
        type: "high_score",
        title: `Nouvelle offre à ${topAnalysis.relevanceScore} — ${topAnalysis.job.title} chez ${topAnalysis.job.company}`,
        body: "Analyse à fort score de correspondance",
        href: `/offers/${topAnalysis.job.id}`,
        jobId: topAnalysis.job.id,
        createdAt: hoursAgo(now, 2),
      }
    : {
        id: "demo-high",
        type: "high_score",
        title: "Nouvelle offre à 88 — Développeur front-end chez Lumen Atelier",
        body: "Analyse à fort score de correspondance",
        href: "/offers",
        createdAt: hoursAgo(now, 2),
      };

  const followupDays = appliedApp ? Math.max(12, daysBetween(appliedApp.updatedAt, now)) : 12;
  const followup: NotificationItem = appliedApp
    ? {
        id: `demo-followup-${appliedApp.id}`,
        type: "followup",
        title: `Aucune réponse depuis ${followupDays} jours — ${appliedApp.job.company}`,
        body: appliedApp.job.title,
        href: `/pipeline?app=${appliedApp.id}`,
        applicationId: appliedApp.id,
        jobId: appliedApp.job.id,
        createdAt: daysAgo(now, 1),
      }
    : {
        id: "demo-followup",
        type: "followup",
        title: "Aucune réponse depuis 12 jours — Atlas Digital",
        body: "Lead développeur full-stack",
        href: "/pipeline",
        createdAt: daysAgo(now, 1),
      };

  const interviewWhen = interviewApp?.followUpAt
    ? formatInterviewWhen(interviewApp.followUpAt, now)
    : formatInterviewWhen(tomorrow, now);
  const interview: NotificationItem = interviewApp
    ? {
        id: `demo-interview-${interviewApp.id}`,
        type: "interview",
        title: `Entretien ${interviewWhen} — ${interviewApp.job.company}`,
        body: interviewApp.job.title,
        href: `/pipeline?app=${interviewApp.id}`,
        applicationId: interviewApp.id,
        jobId: interviewApp.job.id,
        createdAt: hoursAgo(now, 5),
      }
    : {
        id: "demo-interview",
        type: "interview",
        title: `Entretien ${formatInterviewWhen(tomorrow, now)} — Cinabre Tech`,
        body: "Ingénieur React / Node",
        href: "/pipeline",
        createdAt: hoursAgo(now, 5),
      };

  return [high, followup, interview];
}

notificationsRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const followupThreshold = new Date(now.getTime() - FOLLOWUP_DAYS * 24 * 60 * 60 * 1000);
    const interviewHorizon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const interviewPast = new Date(now.getTime() - 12 * 60 * 60 * 1000);

    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    const inApp = settings?.inAppNotifications ?? true;
    const notifyHighScore = settings?.notifyHighScore ?? true;
    const notifyFollowUp = settings?.notifyFollowUp ?? true;
    const notifyInterview = settings?.notifyInterview ?? true;
    const notifyDigest = settings?.notifyWeeklyDigest ?? false;

    if (!inApp) {
      res.json({ items: [] as NotificationItem[] });
      return;
    }

    const items: NotificationItem[] = [];

    if (notifyHighScore) {
      const highScores = await prisma.analysis.findMany({
        where: {
          userId,
          relevanceScore: { gte: HIGH_SCORE_MIN },
          createdAt: { gte: fourteenDaysAgo },
        },
        include: { job: { select: { id: true, title: true, company: true } } },
        orderBy: [{ relevanceScore: "desc" }, { createdAt: "desc" }],
        take: 8,
      });

      for (const a of highScores) {
        items.push({
          id: `high-${a.id}`,
          type: "high_score",
          title: `Nouvelle offre à ${a.relevanceScore} — ${a.job.title} chez ${a.job.company}`,
          body: "Analyse à fort score de correspondance",
          href: `/offers/${a.job.id}`,
          jobId: a.job.id,
          createdAt: a.createdAt.toISOString(),
        });
      }
    }

    if (notifyFollowUp) {
      const applied = await prisma.application.findMany({
        where: {
          userId,
          status: "APPLIED",
          OR: [
            { followUpAt: { lte: now } },
            { followUpAt: null, updatedAt: { lte: followupThreshold } },
          ],
        },
        include: { job: { select: { id: true, title: true, company: true } } },
        orderBy: { updatedAt: "asc" },
        take: 8,
      });

      for (const app of applied) {
        const days = daysBetween(app.updatedAt, now);
        const label =
          days >= 1
            ? `Aucune réponse depuis ${days} jour${days > 1 ? "s" : ""} — ${app.job.company}`
            : `Relance à prévoir — ${app.job.company}`;
        items.push({
          id: `followup-${app.id}`,
          type: "followup",
          title: label,
          body: app.job.title,
          href: `/pipeline?app=${app.id}`,
          applicationId: app.id,
          jobId: app.job.id,
          createdAt: (app.followUpAt ?? app.updatedAt).toISOString(),
        });
      }
    }

    if (notifyInterview) {
      const interviews = await prisma.application.findMany({
        where: {
          userId,
          status: "INTERVIEW",
          OR: [
            { followUpAt: { gte: interviewPast, lte: interviewHorizon } },
            { followUpAt: null, updatedAt: { gte: fourteenDaysAgo } },
          ],
        },
        include: { job: { select: { id: true, title: true, company: true } } },
        orderBy: { followUpAt: "asc" },
        take: 8,
      });

      for (const app of interviews) {
        const when = app.followUpAt
          ? formatInterviewWhen(app.followUpAt, now)
          : "à venir";
        items.push({
          id: `interview-${app.id}`,
          type: "interview",
          title: `Entretien ${when} — ${app.job.company}`,
          body: app.job.title,
          href: `/pipeline?app=${app.id}`,
          applicationId: app.id,
          jobId: app.job.id,
          createdAt: (app.followUpAt ?? app.updatedAt).toISOString(),
        });
      }
    }

    if (notifyDigest) {
      const weekStart = startOfWeek(now);
      items.push({
        id: `digest-${weekStart.toISOString().slice(0, 10)}`,
        type: "digest",
        title: "Votre résumé hebdomadaire est prêt",
        body: "Pipeline, analyses et priorités de la semaine",
        href: "/",
        createdAt: weekStart.toISOString(),
      });
    }

    const showcase = await buildShowcaseSamples(userId, now);
    const showcaseIds = new Set(showcase.map((s) => s.id));
    // Évite les doublons (ex. même analyse déjà listée)
    const extras = items.filter((i) => {
      if (showcaseIds.has(i.id)) return false;
      if (i.type === "high_score" && showcase.some((s) => s.jobId && s.jobId === i.jobId)) {
        return false;
      }
      if (
        (i.type === "followup" || i.type === "interview") &&
        showcase.some((s) => s.applicationId && s.applicationId === i.applicationId)
      ) {
        return false;
      }
      return true;
    });

    const merged = [...showcase, ...extras].sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)
    );

    res.json({ items: merged.slice(0, MAX_ITEMS) });
  } catch (err) {
    next(err);
  }
});
