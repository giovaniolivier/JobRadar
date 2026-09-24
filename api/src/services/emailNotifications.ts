import { prisma } from "../lib/prisma.js";
import { appOrigin, isSmtpConfigured, sendMail } from "../lib/mail.js";

const HIGH_SCORE_MIN = 70;
const FOLLOWUP_DAYS = 7;
const APP_ORIGIN = () => appOrigin();

function daysBetween(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1;
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - diff);
  return x;
}

async function alreadySent(userId: string, key: string): Promise<boolean> {
  const row = await prisma.emailDispatchLog.findUnique({
    where: { userId_key: { userId, key } },
  });
  return Boolean(row);
}

async function markSent(userId: string, key: string) {
  await prisma.emailDispatchLog.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key },
    update: { sentAt: new Date() },
  });
}

async function sendOnce(opts: {
  userId: string;
  key: string;
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  if (await alreadySent(opts.userId, opts.key)) return false;
  const { delivered } = await sendMail({
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
  });
  // En prod avec SMTP : on marque seulement si délivré.
  // En dev sans SMTP : on marque aussi pour éviter le spam console à chaque tick.
  if (delivered || !isSmtpConfigured()) {
    await markSent(opts.userId, opts.key);
  }
  return delivered || !isSmtpConfigured();
}

/** Après une analyse : email immédiat si score élevé et prefs OK. */
export async function notifyHighScoreAnalysis(opts: {
  userId: string;
  analysisId: string;
  score: number;
  jobTitle: string;
  company: string;
  jobId: string;
}): Promise<void> {
  if (opts.score < HIGH_SCORE_MIN) return;

  const [user, settings] = await Promise.all([
    prisma.user.findUnique({ where: { id: opts.userId }, select: { email: true } }),
    prisma.userSettings.findUnique({ where: { userId: opts.userId } }),
  ]);
  if (!user?.email) return;
  if (settings && settings.emailNotifications === false) return;
  if (settings && settings.notifyHighScore === false) return;

  const href = `${APP_ORIGIN()}/offers/${opts.jobId}`;
  await sendOnce({
    userId: opts.userId,
    key: `high:${opts.analysisId}`,
    to: user.email,
    subject: `Offre à ${opts.score} — ${opts.jobTitle} chez ${opts.company}`,
    text: [
      `Bonjour,`,
      ``,
      `JobRadar a trouvé une offre bien alignée avec votre profil :`,
      `${opts.jobTitle} chez ${opts.company} — score ${opts.score}/100.`,
      ``,
      `Voir l’offre : ${href}`,
      ``,
      `Vous pouvez désactiver ces emails dans Paramètres → Notifications.`,
    ].join("\n"),
  });
}

/** Balayage périodique : relances, entretiens, digest hebdo. */
export async function dispatchPendingNotificationEmails(): Promise<{ sent: number }> {
  const now = new Date();
  const followupThreshold = new Date(now.getTime() - FOLLOWUP_DAYS * 24 * 60 * 60 * 1000);
  const interviewHorizon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const interviewPast = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  let sent = 0;

  const users = await prisma.user.findMany({
    where: {
      settings: {
        is: {
          emailNotifications: true,
        },
      },
    },
    include: { settings: true },
  });

  // Utilisateurs sans settings (défaut = emails on)
  const usersWithoutSettings = await prisma.user.findMany({
    where: { settings: null },
    include: { settings: true },
  });

  const all = [...users, ...usersWithoutSettings];
  const seen = new Set<string>();

  for (const user of all) {
    if (seen.has(user.id)) continue;
    seen.add(user.id);

    const s = user.settings;
    const emailOn = s?.emailNotifications ?? true;
    if (!emailOn) continue;

    if (s?.notifyFollowUp ?? true) {
      const applied = await prisma.application.findMany({
        where: {
          userId: user.id,
          status: "APPLIED",
          OR: [
            { followUpAt: { lte: now } },
            { followUpAt: null, updatedAt: { lte: followupThreshold } },
          ],
        },
        include: { job: { select: { id: true, title: true, company: true } } },
        take: 5,
      });

      for (const app of applied) {
        const days = daysBetween(app.updatedAt, now);
        const ok = await sendOnce({
          userId: user.id,
          key: `followup:${app.id}`,
          to: user.email,
          subject: `Relance — ${app.job.company} (${days} j sans réponse)`,
          text: [
            `Bonjour,`,
            ``,
            `Aucune réponse depuis ${days} jour${days > 1 ? "s" : ""} pour :`,
            `${app.job.title} chez ${app.job.company}.`,
            ``,
            `Ouvrir le suivi : ${APP_ORIGIN()}/pipeline?app=${app.id}`,
            ``,
            `Paramètres → Notifications pour désactiver.`,
          ].join("\n"),
        });
        if (ok) sent += 1;
      }
    }

    if (s?.notifyInterview ?? true) {
      const interviews = await prisma.application.findMany({
        where: {
          userId: user.id,
          status: "INTERVIEW",
          followUpAt: { gte: interviewPast, lte: interviewHorizon },
        },
        include: { job: { select: { id: true, title: true, company: true } } },
        take: 5,
      });

      for (const app of interviews) {
        const dayKey = (app.followUpAt ?? now).toISOString().slice(0, 10);
        const when = app.followUpAt
          ? app.followUpAt.toLocaleString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "à venir";
        const ok = await sendOnce({
          userId: user.id,
          key: `interview:${app.id}:${dayKey}`,
          to: user.email,
          subject: `Entretien ${when} — ${app.job.company}`,
          text: [
            `Bonjour,`,
            ``,
            `Rappel d’entretien : ${app.job.title} chez ${app.job.company}`,
            `Quand : ${when}`,
            ``,
            `Ouvrir : ${APP_ORIGIN()}/pipeline?app=${app.id}`,
          ].join("\n"),
        });
        if (ok) sent += 1;
      }
    }

    if (s?.notifyWeeklyDigest ?? false) {
      const weekStart = startOfWeek(now);
      const last = s?.lastDigestEmailAt;
      if (!last || last < weekStart) {
        const [appCount, analysisCount] = await Promise.all([
          prisma.application.count({ where: { userId: user.id } }),
          prisma.analysis.count({
            where: { userId: user.id, createdAt: { gte: weekStart } },
          }),
        ]);
        const key = `digest:${weekStart.toISOString().slice(0, 10)}`;
        const ok = await sendOnce({
          userId: user.id,
          key,
          to: user.email,
          subject: "Votre résumé JobRadar de la semaine",
          text: [
            `Bonjour,`,
            ``,
            `Résumé depuis le ${weekStart.toLocaleDateString("fr-FR")} :`,
            `• ${analysisCount} analyse${analysisCount > 1 ? "s" : ""} cette semaine`,
            `• ${appCount} candidature${appCount > 1 ? "s" : ""} au total dans votre pipeline`,
            ``,
            `Tableau de bord : ${APP_ORIGIN()}/dashboard`,
          ].join("\n"),
        });
        if (ok) {
          sent += 1;
          await prisma.userSettings.upsert({
            where: { userId: user.id },
            create: {
              userId: user.id,
              notifyWeeklyDigest: true,
              lastDigestEmailAt: now,
            },
            update: { lastDigestEmailAt: now },
          });
        }
      }
    }
  }

  return { sent };
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Démarre le poller (toutes les 15 min). Idempotent. */
export function startEmailNotificationScheduler() {
  if (timer) return;
  const tick = () => {
    void dispatchPendingNotificationEmails().catch((err) => {
      console.error("[email-notifications]", err);
    });
  };
  // Premier passage après 45s (laisse l’API démarrer)
  setTimeout(tick, 45_000);
  timer = setInterval(tick, 15 * 60 * 1000);
  console.log("[email-notifications] scheduler started (15 min)");
}
