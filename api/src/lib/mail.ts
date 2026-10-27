import crypto from "crypto";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

let transporter: Transporter | null | undefined;
let lastVerifyOk: boolean | null = null;
let lastVerifyError: string | null = null;

const isProd = () => process.env.NODE_ENV === "production";

/** SMTP obligatoire au boot en prod, sauf si MAIL_REQUIRED=false (déploiement sans mail). */
const mailRequired = () =>
  (process.env.MAIL_REQUIRED ?? "true").trim().toLowerCase() !== "false";

/** Ports SMTP bloqués en sortie par Render sur le plan gratuit. */
const RENDER_BLOCKED_SMTP_PORTS = [25, 465, 587];

/** Indice de diagnostic ajouté aux erreurs SMTP quand on tourne sur Render. */
function smtpBlockedPortHint(): string {
  if (!process.env.RENDER || process.env.SMTP_URL?.trim()) return "";
  const port = Number(process.env.SMTP_PORT ?? 587);
  if (!RENDER_BLOCKED_SMTP_PORTS.includes(port)) return "";
  return (
    ` — port ${port} bloqué en sortie par Render (plan gratuit) : ` +
    `définissez SMTP_PORT=2525 (Brevo/Mailgun supportent 2525 en STARTTLS).`
  );
}

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_URL?.trim() ||
      (process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim())
  );
}

export type MailStatus = {
  configured: boolean;
  verified: boolean | null;
  from: string;
  error: string | null;
};

export function getMailStatus(): MailStatus {
  return {
    configured: isSmtpConfigured(),
    verified: lastVerifyOk,
    from: isSmtpConfigured() ? mailFrom() : "",
    error: lastVerifyError,
  };
}

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;

  if (!isSmtpConfigured()) {
    transporter = null;
    return null;
  }

  if (process.env.SMTP_URL?.trim()) {
    transporter = nodemailer.createTransport(process.env.SMTP_URL.trim());
    return transporter;
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  // Gmail app passwords are often copied with spaces — strip them
  const pass = process.env.SMTP_PASS!.trim().replace(/\s+/g, "");
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(),
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: {
      user: process.env.SMTP_USER!.trim(),
      pass,
    },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

/** Reset cached transporter (tests / after config change). */
export function resetMailTransporter(): void {
  transporter = undefined;
  lastVerifyOk = null;
  lastVerifyError = null;
}

function mailFrom(): string {
  return (
    process.env.MAIL_FROM?.trim() ||
    process.env.SMTP_USER?.trim() ||
    "JobRadar <noreply@jobradar.local>"
  );
}

function extractEmailAddress(from: string): string {
  const m = /<([^>]+)>/.exec(from);
  return (m?.[1] ?? from).trim().toLowerCase();
}

function warnMailFromMismatch(): void {
  const host = (process.env.SMTP_HOST ?? "").toLowerCase();
  // Chez Brevo / Resend, le login SMTP ≠ forcément l’adresse From (sender vérifié).
  if (host.includes("brevo") || host.includes("sendinblue") || host.includes("resend")) return;

  const user = process.env.SMTP_USER?.trim().toLowerCase();
  if (!user || process.env.SMTP_URL?.trim()) return;
  const fromAddr = extractEmailAddress(mailFrom());
  if (fromAddr && fromAddr !== user && !fromAddr.endsWith(`@${user.split("@")[1] ?? ""}`)) {
    console.warn(
      `[mail] MAIL_FROM (${fromAddr}) ≠ SMTP_USER (${user}). ` +
        `Gmail exige souvent que l’expéditeur corresponde au compte authentifié.`
    );
  }
}

function isTransientSmtpError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; responseCode?: number; message?: string };
  const code = (e.code ?? "").toUpperCase();
  if (["ETIMEDOUT", "ESOCKET", "ECONNECTION", "ECONNRESET", "EPIPE", "EENVELOPE"].includes(code)) {
    return true;
  }
  const rc = e.responseCode;
  if (rc === 421 || rc === 450 || rc === 451 || rc === 452) return true;
  const msg = (e.message ?? "").toLowerCase();
  return /timeout|temporar|try again|rate limit|too many/.test(msg);
}

function formatSmtpError(err: unknown): Error {
  const code =
    err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
  if (code === "EAUTH") {
    return new Error(
      "SMTP refusé (identifiants invalides). Gmail : mot de passe d’application, pas le mot de passe du compte."
    );
  }
  if (err instanceof Error) return err;
  return new Error(String(err));
}

/** Verify SMTP credentials / connectivity. Caches result for /health. */
export async function verifySmtp(opts?: { timeoutMs?: number }): Promise<MailStatus> {
  const tx = getTransporter();
  if (!tx) {
    lastVerifyOk = false;
    lastVerifyError = "SMTP non configuré (SMTP_HOST/USER/PASS ou SMTP_URL)";
    return getMailStatus();
  }

  warnMailFromMismatch();

  const timeoutMs = opts?.timeoutMs ?? 12_000;
  try {
    await Promise.race([
      tx.verify(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`SMTP verify timeout (${timeoutMs}ms)`)), timeoutMs)
      ),
    ]);
    lastVerifyOk = true;
    lastVerifyError = null;
    console.log(`[mail] SMTP OK — from ${mailFrom()}`);
  } catch (err) {
    lastVerifyOk = false;
    lastVerifyError = formatSmtpError(err).message + smtpBlockedPortHint();
    console.error(`[mail] SMTP verify failed: ${lastVerifyError}`);
  }
  return getMailStatus();
}

/**
 * Production: refuse to boot without a working SMTP (OTP / reset / notifs).
 * Development: log status only.
 * En prod, 3 tentatives (backoff) : un timeout transitoire ne doit pas tuer un deploy.
 */
export async function assertMailReadyForBoot(): Promise<void> {
  if (!isProd()) {
    const status = await verifySmtp();
    if (!status.configured) {
      console.warn("[mail] SMTP absent — OTP/reset/notifs en mode console (devCode / logs).");
    }
    return;
  }

  const required = mailRequired();
  const timeoutsMs = required ? [8_000, 10_000, 12_000] : [12_000];

  let status = await verifySmtp({ timeoutMs: timeoutsMs[0] });
  for (
    let attempt = 1;
    attempt < timeoutsMs.length && status.configured && !status.verified;
    attempt++
  ) {
    console.warn(`[mail] verify ${attempt}/${timeoutsMs.length} échoué — nouvel essai…`);
    await new Promise((r) => setTimeout(r, 2_000 * attempt));
    status = await verifySmtp({ timeoutMs: timeoutsMs[attempt] });
  }

  if (!required) {
    console.warn(
      "[mail] MAIL_REQUIRED=false — démarrage sans SMTP. OTP/reset/notifs indisponibles " +
        "(les codes de connexion sont renvoyés par l’API). À réactiver pour une instance publique."
    );
    return;
  }

  if (!status.configured) {
    throw new Error(
      "Production: SMTP obligatoire. Définissez SMTP_HOST + SMTP_USER + SMTP_PASS (ou SMTP_URL) et MAIL_FROM."
    );
  }
  if (!status.verified) {
    throw new Error(`Production: SMTP inaccessible — ${status.error ?? "verify failed"}`);
  }

  const origin = (process.env.APP_ORIGIN ?? process.env.CORS_ORIGIN ?? "").trim();
  if (!origin || /localhost|127\.0\.0\.1/i.test(origin)) {
    console.warn(
      "[mail] APP_ORIGIN pointe vers localhost en production — les liens des emails (reset, notifs) seront incorrects."
    );
  }
}

/** Public web origin for links inside emails. */
export function appOrigin(): string {
  return (process.env.APP_ORIGIN ?? process.env.CORS_ORIGIN ?? "http://localhost:5173").replace(
    /\/$/,
    ""
  );
}

/** Sends email via SMTP when configured; otherwise logs (dev fallback). Retries once on transient errors. */
export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ delivered: boolean }> {
  const tx = getTransporter();
  if (!tx) {
    if (isProd() && mailRequired()) {
      throw new Error("SMTP non configuré en production — impossible d’envoyer l’email.");
    }
    console.log(`[dev] mail → ${opts.to} | ${opts.subject}`);
    console.log(opts.text);
    return { delivered: false };
  }

  const payload = {
    from: mailFrom(),
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html:
      opts.html ??
      `<pre style="font-family:sans-serif;font-size:16px">${opts.text.replace(/\n/g, "<br/>")}</pre>`,
  };

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await tx.sendMail(payload);
      console.log(`[mail] sent → ${opts.to} | ${opts.subject}`);
      lastVerifyOk = true;
      lastVerifyError = null;
      return { delivered: true };
    } catch (err) {
      lastErr = err;
      if (attempt < 2 && isTransientSmtpError(err)) {
        console.warn(`[mail] tentative ${attempt} échouée (transitoire), nouvel essai…`);
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      break;
    }
  }

  throw formatSmtpError(lastErr);
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

export function generateOtpCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}
