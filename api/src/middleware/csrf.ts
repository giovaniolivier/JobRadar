import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const CSRF_EXEMPT_PREFIXES = [
  "/auth/login",
  "/auth/verify-2fa",
  "/auth/resend-2fa",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/google",
  "/auth/linkedin",
  "/health",
];

/** Double-submit CSRF: cookie csrf_token must match header X-CSRF-Token */
export function csrfProtect(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();

  const path = req.path;
  if (CSRF_EXEMPT_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    return next();
  }

  const cookie = req.cookies?.csrf_token as string | undefined;
  const header = req.headers["x-csrf-token"];
  const headerValue = Array.isArray(header) ? header[0] : header;

  if (!cookie || !headerValue || cookie !== headerValue) {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }

  next();
}
