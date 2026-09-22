import { Router } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/jwt.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";

export const authRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1).optional(),
});

authRouter.post("/register", async (req, res, next) => {
  try {
    const body = credentialsSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) throw new HttpError(409, "Email already registered");

    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        passwordHash,
        name: body.name ?? body.email.split("@")[0],
        profile: { create: {} },
      },
      select: { id: true, email: true, name: true },
    });

    const token = signToken({ userId: user.id, email: user.email });
    res.status(201).json({ token, user });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const body = credentialsSchema.omit({ name: true }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (!user) throw new HttpError(401, "Invalid credentials");

    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) throw new HttpError(401, "Invalid credentials");

    const token = signToken({ userId: user.id, email: user.email });
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /auth/upload-cv
 * - multipart: field "cv" (fichier .txt / .md / .csv)
 * - ou JSON: { "cvText": "..." }
 */
authRouter.post(
  "/upload-cv",
  requireAuth,
  upload.single("cv"),
  async (req: AuthedRequest, res, next) => {
    try {
      const userId = req.user!.userId;
      let cvText = "";

      if (req.file) {
        const name = (req.file.originalname || "").toLowerCase();
        if (name.endsWith(".pdf") || req.file.mimetype === "application/pdf") {
          throw new HttpError(400, "PDF non supporté pour l'instant — utilisez .txt ou collez le texte");
        }
        cvText = req.file.buffer.toString("utf8").trim();
      } else if (typeof req.body?.cvText === "string") {
        cvText = req.body.cvText.trim();
      }

      if (!cvText) {
        throw new HttpError(400, "Provide a cv file or JSON { cvText }");
      }

      const profile = await prisma.profile.upsert({
        where: { userId },
        create: { userId, cvText },
        update: { cvText },
      });

      res.json({
        ok: true,
        profile: {
          cvText: profile.cvText,
          skills: profile.skills,
          targetRoles: profile.targetRoles,
          experienceYears: profile.experienceYears,
          preferredLocations: profile.preferredLocations,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);
