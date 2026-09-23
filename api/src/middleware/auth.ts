import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken, type AccessPayload } from "../lib/authTokens.js";

export type AuthedRequest = Request & { user?: AccessPayload };

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const cookieToken = req.cookies?.access_token as string | undefined;
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const token = cookieToken || bearer;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}
