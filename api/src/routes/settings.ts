import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";

export const settingsRouter = Router();

const themeSchema = z.enum(["light", "dark", "system"]);
const digestSchema = z.enum(["daily", "weekly"]);
const localeSchema = z.enum(["fr", "en"]);
const dateFormatSchema = z.enum(["fr-FR", "en-GB", "en-US"]);
const currencySchema = z.enum(["EUR", "USD", "GBP", "CHF"]);

const updateSchema = z.object({
  emailNotifications: z.boolean().optional(),
  inAppNotifications: z.boolean().optional(),
  notifyHighScore: z.boolean().optional(),
  notifyFollowUp: z.boolean().optional(),
  notifyInterview: z.boolean().optional(),
  notifyWeeklyDigest: z.boolean().optional(),
  digestFrequency: digestSchema.optional(),
  theme: themeSchema.optional(),
  locale: localeSchema.optional(),
  dateFormat: dateFormatSchema.optional(),
  currency: currencySchema.optional(),
});

const defaults = {
  emailNotifications: true,
  inAppNotifications: true,
  notifyHighScore: true,
  notifyFollowUp: true,
  notifyInterview: true,
  notifyWeeklyDigest: false,
  digestFrequency: "weekly",
  theme: "system",
  locale: "fr",
  dateFormat: "fr-FR",
  currency: "EUR",
} as const;

function publicSettings(row: {
  emailNotifications: boolean;
  inAppNotifications: boolean;
  notifyHighScore: boolean;
  notifyFollowUp: boolean;
  notifyInterview: boolean;
  notifyWeeklyDigest: boolean;
  digestFrequency: string;
  theme: string;
  locale: string;
  dateFormat: string;
  currency: string;
  updatedAt: Date;
}) {
  return {
    emailNotifications: row.emailNotifications,
    inAppNotifications: row.inAppNotifications,
    notifyHighScore: row.notifyHighScore,
    notifyFollowUp: row.notifyFollowUp,
    notifyInterview: row.notifyInterview,
    notifyWeeklyDigest: row.notifyWeeklyDigest,
    digestFrequency: row.digestFrequency,
    theme: row.theme,
    locale: row.locale,
    dateFormat: row.dateFormat,
    currency: row.currency,
    updatedAt: row.updatedAt,
  };
}

async function getOrCreateSettings(userId: string) {
  return prisma.userSettings.upsert({
    where: { userId },
    create: { userId, ...defaults },
    update: {},
  });
}

settingsRouter.get("/", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const settings = await getOrCreateSettings(req.user!.userId);
    res.json(publicSettings(settings));
  } catch (err) {
    next(err);
  }
});

settingsRouter.put("/", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const body = updateSchema.parse(req.body);

    const settings = await prisma.userSettings.upsert({
      where: { userId },
      create: { userId, ...defaults, ...body },
      update: { ...body },
    });

    res.json(publicSettings(settings));
  } catch (err) {
    next(err);
  }
});

settingsRouter.get("/export", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        profile: true,
        settings: true,
        analyses: {
          orderBy: { createdAt: "desc" },
          include: {
            job: {
              select: {
                id: true,
                title: true,
                company: true,
                location: true,
                salaryRaw: true,
                url: true,
                source: true,
                techStack: true,
                seniority: true,
                fetchedAt: true,
              },
            },
          },
        },
        applications: {
          orderBy: { updatedAt: "desc" },
          include: {
            job: {
              select: {
                id: true,
                title: true,
                company: true,
                location: true,
                url: true,
              },
            },
          },
        },
      },
    });
    if (!user) throw new HttpError(404, "User not found");

    const payload = {
      exportedAt: new Date().toISOString(),
      format: "jobradar-export-v1",
      account: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
      },
      profile: user.profile,
      settings: user.settings,
      analyses: user.analyses.map((a) => ({
        id: a.id,
        relevanceScore: a.relevanceScore,
        redFlags: a.redFlags,
        strengths: a.strengths,
        gaps: a.gaps,
        summary: a.summary,
        extractedSalary: a.extractedSalary,
        extractedStack: a.extractedStack,
        extractedSeniority: a.extractedSeniority,
        createdAt: a.createdAt,
        job: a.job,
      })),
      applications: user.applications.map((app) => ({
        id: app.id,
        status: app.status,
        outcome: app.outcome,
        notes: app.notes,
        coverLetter: app.coverLetter,
        statusHistory: app.statusHistory,
        followUpAt: app.followUpAt,
        createdAt: app.createdAt,
        updatedAt: app.updatedAt,
        job: app.job,
      })),
    };

    const filename = `jobradar-export-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    next(err);
  }
});
