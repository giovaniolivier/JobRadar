import { Router } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  assertJwtSecret,
  clearAuthCookies,
  createRawToken,
  createSession,
  hashResetToken,
  revokeAllRefreshTokens,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
  setAuthCookies,
} from "../lib/authTokens.js";
import { generateOtpCode, maskEmail, sendMail } from "../lib/mail.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";
import { extractCvText } from "../services/cvExtract.js";

export const authRouter = Router();

assertJwtSecret();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives. Réessayez dans 15 minutes." },
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives. Réessayez dans 15 minutes." },
});

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).optional(),
});

function publicUser(user: { id: string; email: string; name: string }) {
  return { id: user.id, email: user.email, name: user.name };
}

async function issueLoginOtp(user: { id: string; email: string }, remember: boolean) {
  await prisma.loginOtp.deleteMany({ where: { userId: user.id, consumedAt: null } });

  const code = generateOtpCode();
  const challengeId = createRawToken();
  await prisma.loginOtp.create({
    data: {
      userId: user.id,
      challengeHash: hashResetToken(challengeId),
      codeHash: hashResetToken(code),
      remember,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  const mail = await sendMail({
    to: user.email,
    subject: "JobRadar — code de connexion",
    text: `Votre code de vérification JobRadar est : ${code}\n\nIl expire dans 10 minutes.\nSi vous n'êtes pas à l'origine de cette connexion, ignorez cet email.`,
    html: `
      <div style="font-family:sans-serif;max-width:420px;line-height:1.5">
        <p>Votre code de vérification <strong>JobRadar</strong> :</p>
        <p style="font-size:28px;letter-spacing:6px;font-weight:700">${code}</p>
        <p style="color:#666">Il expire dans 10 minutes.</p>
        <p style="color:#666;font-size:13px">Si vous n'êtes pas à l'origine de cette connexion, ignorez cet email.</p>
      </div>
    `,
  });

  return {
    requires2fa: true as const,
    challengeId,
    emailHint: maskEmail(user.email),
    expiresInSec: Math.floor(OTP_TTL_MS / 1000),
    // Only expose the code in API when SMTP is not configured (local fallback)
    ...(!mail.delivered ? { devCode: code } : {}),
  };
}

/** Issue CSRF cookie for the SPA (call on app boot). */
authRouter.get("/csrf", (_req, res) => {
  const csrfToken = createRawToken();
  const isProd = process.env.NODE_ENV === "production";
  res.cookie("csrf_token", csrfToken, {
    httpOnly: false,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ csrfToken });
});

authRouter.get("/providers", (_req, res) => {
  res.json({
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    linkedin: Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),
  });
});

authRouter.get("/me", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new HttpError(401, "Unauthorized");
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/register", authLimiter, async (req, res, next) => {
  try {
    const body = credentialsSchema
      .extend({ remember: z.boolean().optional() })
      .parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) throw new HttpError(409, "Email already registered");

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        passwordHash,
        name: body.name ?? body.email.split("@")[0],
        profile: { create: {} },
      },
      select: { id: true, email: true, name: true },
    });

    await createSession(res, user.id, user.email, { remember: body.remember ?? true });
    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", authLimiter, async (req, res, next) => {
  try {
    const body = credentialsSchema
      .omit({ name: true })
      .extend({ remember: z.boolean().optional() })
      .parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (!user?.passwordHash) throw new HttpError(401, "Invalid credentials");

    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) throw new HttpError(401, "Invalid credentials");

    const challenge = await issueLoginOtp(user, body.remember ?? true);
    res.json(challenge);
  } catch (err) {
    next(err);
  }
});

authRouter.post("/verify-2fa", otpLimiter, async (req, res, next) => {
  try {
    const body = z
      .object({
        challengeId: z.string().min(20),
        code: z.string().regex(/^\d{6}$/, "Code à 6 chiffres requis"),
      })
      .parse(req.body);

    const challengeHash = hashResetToken(body.challengeId);
    const row = await prisma.loginOtp.findUnique({
      where: { challengeHash },
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    if (!row || row.consumedAt || row.expiresAt < new Date()) {
      throw new HttpError(400, "Code expiré ou invalide. Reconnectez-vous.");
    }
    if (row.attempts >= OTP_MAX_ATTEMPTS) {
      throw new HttpError(429, "Trop de tentatives. Reconnectez-vous pour un nouveau code.");
    }

    const codeOk = row.codeHash === hashResetToken(body.code);
    if (!codeOk) {
      await prisma.loginOtp.update({
        where: { id: row.id },
        data: { attempts: { increment: 1 } },
      });
      throw new HttpError(401, "Code incorrect");
    }

    await prisma.loginOtp.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    });

    await createSession(res, row.user.id, row.user.email, { remember: row.remember });
    res.json({ user: publicUser(row.user) });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/resend-2fa", otpLimiter, async (req, res, next) => {
  try {
    const body = z.object({ challengeId: z.string().min(20) }).parse(req.body);
    const challengeHash = hashResetToken(body.challengeId);
    const row = await prisma.loginOtp.findUnique({
      where: { challengeHash },
      include: { user: { select: { id: true, email: true } } },
    });

    if (!row || row.consumedAt) {
      throw new HttpError(400, "Session de vérification invalide. Reconnectez-vous.");
    }

    const challenge = await issueLoginOtp(row.user, row.remember);
    res.json(challenge);
  } catch (err) {
    next(err);
  }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const raw = req.cookies?.refresh_token as string | undefined;
    if (!raw) throw new HttpError(401, "Unauthorized");

    const rotated = await rotateRefreshToken(raw);
    if (!rotated) throw new HttpError(401, "Unauthorized");

    const accessToken = signAccessToken(rotated.userId, rotated.email);
    const csrfToken = createRawToken();
    setAuthCookies(res, {
      accessToken,
      refreshToken: rotated.refreshToken,
      csrfToken,
      refreshMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await revokeRefreshToken(req.cookies?.refresh_token);
    clearAuthCookies(res);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/forgot-password", authLimiter, async (req, res, next) => {
  try {
    const body = z.object({ email: z.string().email() }).parse(req.body);
    const email = body.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new HttpError(404, "Aucun compte n'est associé à cet email.");
    }
    if (!user.passwordHash) {
      throw new HttpError(
        400,
        "Ce compte n'a pas de mot de passe. Connectez-vous avec Google ou LinkedIn."
      );
    }

    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    const raw = createRawToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashResetToken(raw),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const webOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173";
    const resetUrl = `${webOrigin}/reset-password?token=${encodeURIComponent(raw)}`;

    const mail = await sendMail({
      to: email,
      subject: "JobRadar — réinitialisation du mot de passe",
      text: `Bonjour,\n\nPour définir un nouveau mot de passe JobRadar, ouvrez ce lien (valide 1 heure) :\n${resetUrl}\n\nSi vous n'avez pas demandé cette réinitialisation, ignorez cet email.`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;line-height:1.5;color:#111">
          <p>Bonjour,</p>
          <p>Vous avez demandé à réinitialiser votre mot de passe <strong>JobRadar</strong>.</p>
          <p style="margin:24px 0">
            <a href="${resetUrl}"
               style="display:inline-block;background:#e8a838;color:#111;text-decoration:none;padding:12px 20px;font-weight:600;border-radius:4px">
              Choisir un nouveau mot de passe
            </a>
          </p>
          <p style="color:#666;font-size:13px">Ce lien expire dans 1 heure.</p>
          <p style="color:#666;font-size:13px">Si le bouton ne fonctionne pas, copiez cette URL :<br/>${resetUrl}</p>
          <p style="color:#666;font-size:13px">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
        </div>
      `,
    });

    res.json({
      ok: true,
      message: "Un email de réinitialisation a été envoyé. Vérifiez aussi vos spams.",
      ...(!mail.delivered ? { devResetUrl: resetUrl } : {}),
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/reset-password", authLimiter, async (req, res, next) => {
  try {
    const body = z
      .object({
        token: z.string().min(20),
        password: z.string().min(8),
      })
      .parse(req.body);

    const tokenHash = hashResetToken(body.token);
    const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw new HttpError(400, "Lien de réinitialisation invalide ou expiré");
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: row.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      }),
    ]);
    await revokeAllRefreshTokens(row.userId);
    clearAuthCookies(res);

    res.json({ ok: true, message: "Mot de passe mis à jour. Vous pouvez vous connecter." });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/change-password", requireAuth, authLimiter, async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const body = z
      .object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8, "Le mot de passe doit faire au moins 8 caractères"),
      })
      .parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) {
      throw new HttpError(400, "Ce compte n’a pas de mot de passe (connexion sociale)");
    }

    const ok = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!ok) throw new HttpError(401, "Mot de passe actuel incorrect");

    const passwordHash = await bcrypt.hash(body.newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await revokeAllRefreshTokens(userId);
    await createSession(res, userId, user.email, { remember: true });

    res.json({ ok: true, message: "Mot de passe mis à jour" });
  } catch (err) {
    next(err);
  }
});

authRouter.post(
  "/upload-cv",
  requireAuth,
  upload.single("cv"),
  async (req: AuthedRequest, res, next) => {
    try {
      const userId = req.user!.userId;
      let cvText = "";
      let cvFileName: string | null = null;

      if (req.file) {
        cvText = await extractCvText(
          req.file.buffer,
          req.file.originalname || "cv.txt",
          req.file.mimetype
        );
        cvFileName = req.file.originalname || "cv.txt";
      } else if (typeof req.body?.cvText === "string") {
        cvText = req.body.cvText.trim();
        cvFileName =
          typeof req.body?.cvFileName === "string" && req.body.cvFileName.trim()
            ? req.body.cvFileName.trim().slice(0, 180)
            : "cv-colle.txt";
      }

      if (!cvText || cvText.length < 40) {
        throw new HttpError(400, "Provide a cv file or JSON { cvText } (min. 40 caractères)");
      }

      const { extractSkillsFromCv, normalizeSkillLabel } = await import("../services/ai.js");
      const extracted = extractSkillsFromCv(cvText);

      const existing = await prisma.profile.findUnique({ where: { userId } });
      const mergeSkills = (current: string[], incoming: string[]) => {
        const seen = new Set(current.map((s) => normalizeSkillLabel(s).toLowerCase()));
        const out = current.map(normalizeSkillLabel);
        for (const s of incoming) {
          const label = normalizeSkillLabel(s);
          const key = label.toLowerCase();
          if (!key || seen.has(key)) continue;
          seen.add(key);
          out.push(label);
        }
        return out.slice(0, 60);
      };

      const skills = mergeSkills(existing?.skills ?? [], extracted.skills);
      const softSkills = mergeSkills(existing?.softSkills ?? [], extracted.softSkills);

      const profile = await prisma.profile.upsert({
        where: { userId },
        create: {
          userId,
          cvText,
          cvFileName,
          cvImportedAt: new Date(),
          skills,
          softSkills,
        },
        update: {
          cvText,
          cvFileName,
          cvImportedAt: new Date(),
          skills,
          softSkills,
        },
      });

      res.json({
        ok: true,
        message: "CV mis à jour — les nouvelles analyses utiliseront cette version",
        profile: {
          cvText: profile.cvText,
          cvFileName: profile.cvFileName,
          cvImportedAt: profile.cvImportedAt,
          skills: profile.skills,
          softSkills: profile.softSkills,
          targetRoles: profile.targetRoles,
          experienceYears: profile.experienceYears,
          preferredLocations: profile.preferredLocations,
          salaryMin: profile.salaryMin,
          salaryMax: profile.salaryMax,
          workModes: profile.workModes,
          targetSeniority: profile.targetSeniority,
          preferredSectors: profile.preferredSectors,
          avoidedSectors: profile.avoidedSectors,
          hasCv: true,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ——— OAuth Google ———
authRouter.get("/google", (_req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:4000/auth/google/callback";
  if (!clientId) {
    return res.status(501).json({
      error: "Google OAuth non configuré. Définissez GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET.",
    });
  }
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");
  res.redirect(url.toString());
});

authRouter.get("/google/callback", async (req, res, next) => {
  try {
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:4000/auth/google/callback";
    const webOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173";

    if (!code || !clientId || !clientSecret) {
      return res.redirect(`${webOrigin}/login?oauth=error`);
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) return res.redirect(`${webOrigin}/login?oauth=error`);

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = (await profileRes.json()) as {
      id?: string;
      email?: string;
      name?: string;
    };
    if (!profile.email || !profile.id) return res.redirect(`${webOrigin}/login?oauth=error`);

    const email = profile.email.toLowerCase();
    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId: profile.id }, { email }] },
    });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: profile.name || email.split("@")[0],
          googleId: profile.id,
          profile: { create: {} },
        },
      });
    } else if (!user.googleId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId: profile.id },
      });
    }

    await createSession(res, user.id, user.email);
    res.redirect(`${webOrigin}/continue`);
  } catch (err) {
    next(err);
  }
});

// ——— OAuth LinkedIn ———
authRouter.get("/linkedin", (_req, res) => {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const redirectUri =
    process.env.LINKEDIN_REDIRECT_URI ?? "http://localhost:4000/auth/linkedin/callback";
  if (!clientId) {
    return res.status(501).json({
      error: "LinkedIn OAuth non configuré. Définissez LINKEDIN_CLIENT_ID et LINKEDIN_CLIENT_SECRET.",
    });
  }
  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "openid profile email");
  res.redirect(url.toString());
});

authRouter.get("/linkedin/callback", async (req, res, next) => {
  try {
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    const redirectUri =
      process.env.LINKEDIN_REDIRECT_URI ?? "http://localhost:4000/auth/linkedin/callback";
    const webOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173";

    if (!code || !clientId || !clientSecret) {
      return res.redirect(`${webOrigin}/login?oauth=error`);
    }

    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });
    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) return res.redirect(`${webOrigin}/login?oauth=error`);

    const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = (await profileRes.json()) as {
      sub?: string;
      email?: string;
      name?: string;
    };
    if (!profile.email || !profile.sub) return res.redirect(`${webOrigin}/login?oauth=error`);

    const email = profile.email.toLowerCase();
    let user = await prisma.user.findFirst({
      where: { OR: [{ linkedinId: profile.sub }, { email }] },
    });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: profile.name || email.split("@")[0],
          linkedinId: profile.sub,
          profile: { create: {} },
        },
      });
    } else if (!user.linkedinId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { linkedinId: profile.sub },
      });
    }

    await createSession(res, user.id, user.email);
    res.redirect(`${webOrigin}/continue`);
  } catch (err) {
    next(err);
  }
});
