import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.js";
import { profileRouter } from "./routes/profile.js";
import { settingsRouter } from "./routes/settings.js";
import { offersRouter } from "./routes/offers.js";
import { applicationsRouter } from "./routes/applications.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { notificationsRouter } from "./routes/notifications.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { csrfProtect } from "./middleware/csrf.js";
import { enforceHttps } from "./middleware/https.js";
import { assertJwtSecret } from "./lib/authTokens.js";
import { assertMailReadyForBoot, getMailStatus } from "./lib/mail.js";
import {
  dispatchPendingNotificationEmails,
  startEmailNotificationScheduler,
} from "./services/emailNotifications.js";

assertJwtSecret();

const app = express();
const port = Number(process.env.PORT ?? 4000);
const origin = process.env.CORS_ORIGIN ?? "http://localhost:5173";

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(enforceHttps);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false,
  })
);
app.use(
  cors({
    origin,
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// Déclencheur machine pour les e-mails de notification (relances, score, digest).
// Sur Render gratuit le service s'endort : un cron externe appelle cette route pour
// garantir l'envoi. Placée AVANT le CSRF (appel machine, pas de session navigateur)
// et protégée par un secret partagé. Sans CRON_SECRET défini, la route est désactivée.
app.post("/internal/dispatch-emails", async (req, res) => {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const auth = req.header("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : String(req.query.token ?? "");
  if (token !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const result = await dispatchPendingNotificationEmails();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron] dispatch-emails", err);
    res.status(500).json({ error: "dispatch failed" });
  }
});

app.use(csrfProtect);

app.get("/health", (_req, res) => {
  const mail = getMailStatus();
  // Liveness : 200 tant que le process tourne. Une panne SMTP (Brevo) ne doit pas
  // faire redémarrer l'instance ni bloquer un deploy — l'état mail est dans le body.
  res.json({
    ok: true,
    service: "jobradar-api",
    mail: {
      configured: mail.configured,
      transport: mail.transport ?? undefined,
      verified: mail.verified,
      from: mail.from || undefined,
      error: mail.error ?? undefined,
    },
  });
});

// Readiness e-mail uniquement : 503 si SMTP est configuré mais injoignable.
app.get("/health/mail", (_req, res) => {
  const mail = getMailStatus();
  const mailOk = !mail.configured || mail.verified !== false;
  res.status(mailOk ? 200 : 503).json({
    ok: mailOk,
    service: "jobradar-api",
    mail: {
      configured: mail.configured,
      transport: mail.transport ?? undefined,
      verified: mail.verified,
      from: mail.from || undefined,
      error: mail.error ?? undefined,
    },
  });
});

app.use("/auth", authRouter);
app.use("/profile", profileRouter);
app.use("/settings", settingsRouter);
app.use("/dashboard", dashboardRouter);
app.use("/notifications", notificationsRouter);
app.use("/offers", offersRouter);
app.use("/applications", applicationsRouter);

app.use(errorHandler);

async function boot() {
  // Bind the port before any third-party call: Render detects the open port
  // immediately, so a slow SMTP verify can't look like "No open ports detected".
  app.listen(port, () => {
    console.log(`JobRadar API listening on http://localhost:${port}`);
  });

  // SMTP n'est jamais bloquant : une panne d'e-mail (port sortant filtré par
  // l'hébergeur, identifiants invalides…) ne doit pas empêcher l'API de servir
  // (session, offres, profil…). L'état est exposé sur /health et /health/mail.
  void assertMailReadyForBoot()
    .then(() => {
      const mail = getMailStatus();
      console.log(`[mail] vérification terminée — opérationnel: ${mail.verified}`);
    })
    .catch((err) => {
      console.error(`[mail] ${err instanceof Error ? err.message : String(err)}`);
      console.error(
        "[mail] L'API continue de servir, mais l'envoi d'e-mails échouera " +
          "(les codes de connexion OTP ne partiront pas). Voir /health et configurer SMTP_*."
      );
    });

  startEmailNotificationScheduler();
}

boot().catch((err) => {
  console.error("[boot]", err instanceof Error ? err.message : err);
  process.exit(1);
});
