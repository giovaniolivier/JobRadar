import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { clearAuthCookies, revokeAllRefreshTokens } from "../lib/authTokens.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";
import { normalizeSkillLabel } from "../services/ai.js";

export const profileRouter = Router();

const workModeSchema = z.enum(["remote", "hybrid", "onsite"]);
const senioritySchema = z.enum(["junior", "confirme", "senior", "lead"]);

const MODE_LOCATION_RE =
  /^(remote|hybride?|hybrid|onsite|sur[\s-]?site|t[ée]l[ée]travail|teletravail|full\s*remote)$/i;

function isWorkModeLabel(value: string): boolean {
  return MODE_LOCATION_RE.test(value.trim());
}

function modeFromLabel(value: string): "remote" | "hybrid" | "onsite" | null {
  const v = value.trim().toLowerCase();
  if (/remote|t[ée]l[ée]travail|teletravail/.test(v)) return "remote";
  if (/hybrid|hybride/.test(v)) return "hybrid";
  if (/onsite|sur[\s-]?site/.test(v)) return "onsite";
  return null;
}

function normalizeList(values: string[] | undefined, max: number): string[] | undefined {
  if (values === undefined) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const label = normalizeSkillLabel(raw);
    const key = label.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= max) break;
  }
  return out;
}

function splitLocationsAndModes(locations: string[] | undefined, workModes: string[] | undefined) {
  if (locations === undefined && workModes === undefined) {
    return { preferredLocations: undefined as string[] | undefined, workModes: undefined as string[] | undefined };
  }
  const modes = new Set<"remote" | "hybrid" | "onsite">(
    (workModes ?? []).filter((m): m is "remote" | "hybrid" | "onsite" =>
      m === "remote" || m === "hybrid" || m === "onsite"
    )
  );
  const preferredLocations: string[] = [];
  for (const raw of locations ?? []) {
    if (isWorkModeLabel(raw)) {
      const mode = modeFromLabel(raw);
      if (mode) modes.add(mode);
      continue;
    }
    const label = normalizeSkillLabel(raw);
    if (label && !preferredLocations.some((l) => l.toLowerCase() === label.toLowerCase())) {
      preferredLocations.push(label);
    }
  }
  return {
    preferredLocations: locations !== undefined ? preferredLocations : undefined,
    workModes: workModes !== undefined || locations !== undefined ? [...modes] : undefined,
  };
}

const updateSchema = z.object({
  cvText: z.string().optional(),
  cvFileName: z.string().nullable().optional(),
  skills: z.array(z.string().min(1).max(80)).max(80).optional(),
  softSkills: z.array(z.string().min(1).max(80)).max(40).optional(),
  targetRoles: z.array(z.string().min(1).max(80)).max(20).optional(),
  experienceYears: z.number().int().min(0).max(60).nullable().optional(),
  preferredLocations: z.array(z.string().min(1).max(80)).max(20).optional(),
  salaryMin: z.number().int().min(0).max(500_000).nullable().optional(),
  salaryMax: z.number().int().min(0).max(500_000).nullable().optional(),
  workModes: z.array(workModeSchema).max(3).optional(),
  targetSeniority: senioritySchema.nullable().optional(),
  preferredSectors: z.array(z.string().min(1).max(80)).max(20).optional(),
  avoidedSectors: z.array(z.string().min(1).max(80)).max(20).optional(),
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().optional(),
});

function publicProfile(
  profile: {
    cvText: string;
    cvFileName?: string | null;
    cvImportedAt?: Date | null;
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
    updatedAt: Date;
  } | null
) {
  if (!profile) return null;
  const hasCv = Boolean(profile.cvText.trim());
  return {
    cvText: profile.cvText,
    cvFileName: profile.cvFileName ?? (hasCv ? "CV importé" : null),
    cvImportedAt: profile.cvImportedAt ?? (hasCv ? profile.updatedAt : null),
    skills: (profile.skills ?? []).map(normalizeSkillLabel),
    softSkills: (profile.softSkills ?? []).map(normalizeSkillLabel),
    targetRoles: (profile.targetRoles ?? []).map(normalizeSkillLabel),
    experienceYears: profile.experienceYears,
    preferredLocations: profile.preferredLocations,
    salaryMin: profile.salaryMin ?? null,
    salaryMax: profile.salaryMax ?? null,
    workModes: profile.workModes ?? [],
    targetSeniority: profile.targetSeniority ?? null,
    preferredSectors: profile.preferredSectors ?? [],
    avoidedSectors: profile.avoidedSectors ?? [],
    updatedAt: profile.updatedAt,
    hasCv,
  };
}

profileRouter.get("/", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        profile: true,
      },
    });
    if (!user) throw new HttpError(404, "User not found");

    // Backfill date d'import pour les CV existants sans cvImportedAt
    if (user.profile?.cvText?.trim()) {
      await prisma.$executeRaw`
        UPDATE "Profile"
        SET
          "cvImportedAt" = COALESCE("cvImportedAt", "updatedAt"),
          "cvFileName" = COALESCE("cvFileName", 'CV importé')
        WHERE "userId" = ${userId}
          AND TRIM("cvText") <> ''
          AND ("cvImportedAt" IS NULL OR "cvFileName" IS NULL)
      `;
      user.profile = await prisma.profile.findUnique({ where: { userId } });
    }

    const { passwordHash, ...rest } = user;
    res.json({
      ...rest,
      hasPassword: Boolean(passwordHash),
      profile: publicProfile(user.profile),
    });
  } catch (err) {
    next(err);
  }
});

profileRouter.put("/", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const body = updateSchema.parse(req.body);

    if (
      body.salaryMin != null &&
      body.salaryMax != null &&
      body.salaryMin > body.salaryMax
    ) {
      throw new HttpError(400, "La fourchette salariale est invalide (min > max)");
    }

    const userData: { name?: string; email?: string } = {};
    if (body.name) userData.name = body.name.trim();
    if (body.email) {
      const email = body.email.trim().toLowerCase();
      const taken = await prisma.user.findFirst({
        where: { email, NOT: { id: userId } },
        select: { id: true },
      });
      if (taken) throw new HttpError(409, "Cet email est déjà utilisé");
      userData.email = email;
    }
    if (Object.keys(userData).length) {
      await prisma.user.update({ where: { id: userId }, data: userData });
    }

    const skills = normalizeList(body.skills, 80);
    const softSkills = normalizeList(body.softSkills, 40);
    const targetRoles = normalizeList(body.targetRoles, 20);
    const preferredSectors = normalizeList(body.preferredSectors, 20);
    const avoidedSectors = normalizeList(body.avoidedSectors, 20);
    const { preferredLocations, workModes } = splitLocationsAndModes(
      body.preferredLocations,
      body.workModes
    );

    const profile = await prisma.profile.upsert({
      where: { userId },
      create: {
        userId,
        cvText: body.cvText ?? "",
        cvFileName: body.cvFileName ?? null,
        cvImportedAt: body.cvText?.trim() ? new Date() : null,
        skills: skills ?? [],
        softSkills: softSkills ?? [],
        targetRoles: targetRoles ?? [],
        experienceYears: body.experienceYears ?? null,
        preferredLocations: preferredLocations ?? [],
        salaryMin: body.salaryMin ?? null,
        salaryMax: body.salaryMax ?? null,
        workModes: workModes ?? [],
        targetSeniority: body.targetSeniority ?? null,
        preferredSectors: preferredSectors ?? [],
        avoidedSectors: avoidedSectors ?? [],
      },
      update: {
        ...(body.cvText !== undefined
          ? {
              cvText: body.cvText,
              cvImportedAt: body.cvText.trim() ? new Date() : null,
              ...(body.cvFileName !== undefined ? { cvFileName: body.cvFileName } : {}),
            }
          : {}),
        ...(body.cvFileName !== undefined && body.cvText === undefined
          ? { cvFileName: body.cvFileName }
          : {}),
        ...(skills !== undefined ? { skills } : {}),
        ...(softSkills !== undefined ? { softSkills } : {}),
        ...(targetRoles !== undefined ? { targetRoles } : {}),
        ...(body.experienceYears !== undefined ? { experienceYears: body.experienceYears } : {}),
        ...(preferredLocations !== undefined ? { preferredLocations } : {}),
        ...(body.salaryMin !== undefined ? { salaryMin: body.salaryMin } : {}),
        ...(body.salaryMax !== undefined ? { salaryMax: body.salaryMax } : {}),
        ...(workModes !== undefined ? { workModes } : {}),
        ...(body.targetSeniority !== undefined ? { targetSeniority: body.targetSeniority } : {}),
        ...(preferredSectors !== undefined ? { preferredSectors } : {}),
        ...(avoidedSectors !== undefined ? { avoidedSectors } : {}),
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, passwordHash: true },
    });
    if (!user) throw new HttpError(404, "User not found");

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      hasPassword: Boolean(user.passwordHash),
      profile: publicProfile(profile),
    });
  } catch (err) {
    next(err);
  }
});

profileRouter.delete("/", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const body = z
      .object({
        confirm: z.literal("SUPPRIMER"),
        password: z.string().optional(),
      })
      .parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new HttpError(404, "User not found");

    if (user.passwordHash) {
      if (!body.password) throw new HttpError(400, "Mot de passe requis");
      const ok = await bcrypt.compare(body.password, user.passwordHash);
      if (!ok) throw new HttpError(401, "Mot de passe incorrect");
    }

    await revokeAllRefreshTokens(userId);
    await prisma.user.delete({ where: { id: userId } });
    clearAuthCookies(res);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
