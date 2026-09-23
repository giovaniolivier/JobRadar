import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { Response } from "express";
import { prisma } from "./prisma.js";

const isProd = () => process.env.NODE_ENV === "production";

export function assertJwtSecret(): string {
  const value = process.env.JWT_SECRET?.trim() ?? "";
  const weak =
    !value ||
    value.length < 32 ||
    /change-me|your-key|example|jobradar-dev|replace-with|dev-only-insecure|^secret$/i.test(
      value
    );

  if (isProd() && weak) {
    throw new Error(
      "JWT_SECRET must be a long unique secret in production (min 32 chars, not an example value)."
    );
  }
  if (weak) {
    console.warn(
      "[security] JWT_SECRET is weak or missing. Set a long random secret before production."
    );
  }
  if (!value) {
    // Dev fallback so local still boots — never use in prod (asserted above)
    return "dev-only-insecure-jwt-secret-min-32-chars!!";
  }
  return value;
}

export type AccessPayload = {
  userId: string;
  email: string;
  typ: "access";
};

export function signAccessToken(userId: string, email: string): string {
  return jwt.sign({ userId, email, typ: "access" } satisfies AccessPayload, assertJwtSecret(), {
    expiresIn: "15m",
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  const payload = jwt.verify(token, assertJwtSecret()) as AccessPayload;
  if (payload.typ !== "access") throw new Error("Invalid token type");
  return payload;
}

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function createRawToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const raw = createRawToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(raw),
      expiresAt,
    },
  });
  return raw;
}

export async function rotateRefreshToken(raw: string): Promise<{
  userId: string;
  email: string;
  refreshToken: string;
} | null> {
  const tokenHash = hashToken(raw);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!existing || existing.expiresAt < new Date()) {
    if (existing) {
      await prisma.refreshToken.delete({ where: { id: existing.id } }).catch(() => undefined);
    }
    return null;
  }

  await prisma.refreshToken.delete({ where: { id: existing.id } });
  const refreshToken = await issueRefreshToken(existing.userId);
  return {
    userId: existing.user.id,
    email: existing.user.email,
    refreshToken,
  };
}

export async function revokeRefreshToken(raw: string | undefined) {
  if (!raw) return;
  await prisma.refreshToken.deleteMany({ where: { tokenHash: hashToken(raw) } });
}

export async function revokeAllRefreshTokens(userId: string) {
  await prisma.refreshToken.deleteMany({ where: { userId } });
}

const cookieBase = () => ({
  httpOnly: true,
  secure: isProd(),
  sameSite: (isProd() ? "none" : "lax") as "none" | "lax",
  path: "/",
});

export function setAuthCookies(
  res: Response,
  opts: {
    accessToken: string;
    refreshToken: string;
    csrfToken: string;
    refreshMaxAgeMs?: number;
  }
) {
  res.cookie("access_token", opts.accessToken, {
    ...cookieBase(),
    maxAge: 15 * 60 * 1000,
  });
  res.cookie("refresh_token", opts.refreshToken, {
    ...cookieBase(),
    maxAge: opts.refreshMaxAgeMs ?? 7 * 24 * 60 * 60 * 1000,
  });
  res.cookie("csrf_token", opts.csrfToken, {
    httpOnly: false,
    secure: isProd(),
    sameSite: (isProd() ? "none" : "lax") as "none" | "lax",
    path: "/",
    maxAge: opts.refreshMaxAgeMs ?? 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response) {
  const base = cookieBase();
  res.clearCookie("access_token", base);
  res.clearCookie("refresh_token", base);
  res.clearCookie("csrf_token", {
    httpOnly: false,
    secure: isProd(),
    sameSite: base.sameSite,
    path: "/",
  });
}

export async function createSession(
  res: Response,
  userId: string,
  email: string,
  opts?: { remember?: boolean }
) {
  const remember = opts?.remember ?? true;
  const accessToken = signAccessToken(userId, email);
  const refreshToken = await issueRefreshToken(userId);
  const csrfToken = createRawToken();
  setAuthCookies(res, {
    accessToken,
    refreshToken,
    csrfToken,
    refreshMaxAgeMs: remember ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
  });
  return { csrfToken };
}

export function hashResetToken(raw: string): string {
  return hashToken(raw);
}
