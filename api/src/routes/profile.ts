import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";

export const profileRouter = Router();

const updateSchema = z.object({
  cvText: z.string().optional(),
  skills: z.array(z.string()).optional(),
  targetRoles: z.array(z.string()).optional(),
  experienceYears: z.number().int().min(0).max(60).nullable().optional(),
  preferredLocations: z.array(z.string()).optional(),
  name: z.string().min(1).optional(),
});

profileRouter.get("/", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        profile: true,
      },
    });
    if (!user) throw new HttpError(404, "User not found");
    res.json(user);
  } catch (err) {
    next(err);
  }
});

profileRouter.put("/", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const body = updateSchema.parse(req.body);

    if (body.name) {
      await prisma.user.update({ where: { id: userId }, data: { name: body.name } });
    }

    const profile = await prisma.profile.upsert({
      where: { userId },
      create: {
        userId,
        cvText: body.cvText ?? "",
        skills: body.skills ?? [],
        targetRoles: body.targetRoles ?? [],
        experienceYears: body.experienceYears ?? null,
        preferredLocations: body.preferredLocations ?? [],
      },
      update: {
        ...(body.cvText !== undefined ? { cvText: body.cvText } : {}),
        ...(body.skills !== undefined ? { skills: body.skills } : {}),
        ...(body.targetRoles !== undefined ? { targetRoles: body.targetRoles } : {}),
        ...(body.experienceYears !== undefined ? { experienceYears: body.experienceYears } : {}),
        ...(body.preferredLocations !== undefined
          ? { preferredLocations: body.preferredLocations }
          : {}),
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });

    res.json({ ...user, profile });
  } catch (err) {
    next(err);
  }
});
