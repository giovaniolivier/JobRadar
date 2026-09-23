import type { NextFunction, Request, Response } from "express";

const isProd = () => process.env.NODE_ENV === "production";

/** Behind a reverse proxy, require HTTPS in production. */
export function enforceHttps(req: Request, res: Response, next: NextFunction) {
  if (!isProd()) return next();

  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim();
  if (proto && proto !== "https") {
    const host = req.headers.host ?? "localhost";
    return res.redirect(301, `https://${host}${req.originalUrl}`);
  }
  next();
}
