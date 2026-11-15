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

const BREVO_API_BASE = "https://api.brevo.com/v3";
const BREVO_TIMEOUT_MS = 15_000;

export type MailTransport = "brevo-api" | "smtp";

/** Clé API v3 Brevo (≠ clé SMTP). Envoi en HTTPS (port 443), jamais bloqué par Render. */
function brevoApiKey(): string {
  const key = process.env.BREVO_API_KEY?.trim() ?? "";
  return key && !key.includes("your-") ? key : "";
}

function isSmtpTransportConfigured(): boolean {
  return Boolean(
    process.env.SMTP_URL?.trim() ||
      (process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim())
  );
}

/** Transport utilisé : l'API Brevo est prioritaire sur le SMTP quand elle est configurée. */
export function mailTransport(): MailTransport | null {
  if (brevoApiKey()) return "brevo-api";
  if (isSmtpTransportConfigured()) return "smtp";
  return null;
}

export function isMailConfigured(): boolean {
  return mailTransport() !== null;
}

/** @deprecated use isMailConfigured — conservé pour les appels existants. */
export const isSmtpConfigured = isMailConfigured;

/** Indice de diagnostic ajouté aux erreurs SMTP quand on tourne sur Render. */
function smtpBlockedPortHint(): string {
  if (!process.env.RENDER || process.env.SMTP_URL?.trim()) return "";
  const port = Number(process.env.SMTP_PORT ?? 587);
  if (!RENDER_BLOCKED_SMTP_PORTS.includes(port)) return "";
  return (
    ` — port ${port} bloqué en sortie par Render (plan gratuit) : ` +
    `définissez BREVO_API_KEY (envoi HTTPS, recommandé) ou SMTP_PORT=2525 sur le service API. ` +
    `Gmail n'expose que 465/587 et ne peut donc pas être utilisé sur le plan gratuit Render.`
  );
}

export type MailStatus = {
  configured: boolean;
  transport: MailTransport | null;
  verified: boolean | null;
  from: string;
  error: string | null;
};

export function getMailStatus(): MailStatus {
  return {
    configured: isMailConfigured(),
    transport: mailTransport(),
    verified: lastVerifyOk,
    from: isMailConfigured() ? mailFrom() : "",
    error: lastVerifyError,
  };
}

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;

  if (!isSmtpTransportConfigured()) {
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
    // 587 et 2525 : STARTTLS obligatoire (Brevo, Mailgun, Resend…).
    requireTLS: port !== 465,
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

/** « JobRadar <noreply@x.com> » → { name: "JobRadar", email: "noreply@x.com" } */
export function parseMailbox(value: string): { name?: string; email: string } {
  const email = extractEmailAddress(value);
  const name = value
    .replace(/<[^>]*>/, "")
    .trim()
    .replace(/^"|"$/g, "")
    .trim();
  return name && name.toLowerCase() !== email ? { name, email } : { email };
}

function warnMailFromMismatch(): void {
  if (mailTransport() !== "smtp") return;
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

/** Erreur HTTP renvoyée par l'API Brevo. */
export class BrevoApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "BrevoApiError";
  }
}

function isTransientMailError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  if (err instanceof BrevoApiError) return err.status === 429 || err.status >= 500;
  const e = err as { code?: string; responseCode?: number; message?: string; name?: string };
  // fetch() : coupure réseau (TypeError « fetch failed ») ou délai dépassé.
  if (e.name === "TimeoutError" || (e.name === "TypeError" && /fetch failed/i.test(e.message ?? ""))) {
    return true;
  }
  const code = (e.code ?? "").toUpperCase();
  if (["ETIMEDOUT", "ESOCKET", "ECONNECTION", "ECONNRESET", "EPIPE", "EENVELOPE"].includes(code)) {
    return true;
  }
  const rc = e.responseCode;
  if (rc === 421 || rc === 450 || rc === 451 || rc === 452) return true;
  const msg = (e.message ?? "").toLowerCase();
  return /timeout|temporar|try again|rate limit|too many/.test(msg);
}

function degradesMailStatus(err: unknown): boolean {
  if (err instanceof BrevoApiError) return [401, 403, 429].includes(err.status) || err.status >= 500;
  const code =
    err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
  return code === "EAUTH" || isTransientMailError(err);
}

function formatMailError(err: unknown): Error {
  if (err instanceof BrevoApiError) {
    if (err.status === 401) {
      return new Error(
        "Brevo a refusé la clé API (401). Vérifiez BREVO_API_KEY : c'est une clé API v3 " +
          "(Settings → SMTP & API → API Keys), pas la clé SMTP."
      );
    }
    if (err.status === 403) {
      return new Error(
        "Brevo a refusé l'envoi (403) : vérifiez que l'adresse de MAIL_FROM est un expéditeur " +
          "validé (Senders) et que l'IP n'est pas bloquée (Security → Authorised IPs)."
      );
    }
    return err;
  }
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

async function brevoRequest(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${BREVO_API_BASE}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": brevoApiKey(),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(BREVO_TIMEOUT_MS),
  });
  const raw = await res.text();
  if (!res.ok) {
    let detail = raw.slice(0, 300);
    try {
      const body = JSON.parse(raw) as { message?: string; code?: string };
      detail = [body.code, body.message].filter(Boolean).join(" — ") || detail;
    } catch {
      /* corps non JSON : on garde le texte brut */
    }
    throw new BrevoApiError(`Brevo API ${res.status}: ${detail}`, res.status);
  }
  return raw ? JSON.parse(raw) : null;
}

async function verifyTransport(timeoutMs: number): Promise<void> {
  if (mailTransport() === "brevo-api") {
    await Promise.race([
      brevoRequest("/account"),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Brevo verify timeout (${timeoutMs}ms)`)), timeoutMs)
      ),
    ]);
    return;
  }
  const tx = getTransporter()!;
  await Promise.race([
    tx.verify(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`SMTP verify timeout (${timeoutMs}ms)`)), timeoutMs)
    ),
  ]);
}

/** Vérifie la configuration e-mail (API Brevo ou SMTP). Met en cache le résultat pour /health. */
export async function verifyMail(opts?: { timeoutMs?: number }): Promise<MailStatus> {
  const transport = mailTransport();
  if (!transport) {
    lastVerifyOk = false;
    lastVerifyError = "E-mail non configuré (BREVO_API_KEY, ou SMTP_HOST/USER/PASS, ou SMTP_URL)";
    return getMailStatus();
  }

  warnMailFromMismatch();

  try {
    await verifyTransport(opts?.timeoutMs ?? 12_000);
    lastVerifyOk = true;
    lastVerifyError = null;
    console.log(`[mail] ${transport} OK — from ${mailFrom()}`);
  } catch (err) {
    lastVerifyOk = false;
    lastVerifyError =
      formatMailError(err).message + (transport === "smtp" ? smtpBlockedPortHint() : "");
    console.error(`[mail] ${transport} verify failed: ${lastVerifyError}`);
  }
  return getMailStatus();
}

/** @deprecated use verifyMail */
export const verifySmtp = verifyMail;

/**
 * Vérifie l'e-mail au démarrage (jamais bloquant pour le serveur, voir index.ts).
 * En prod, 3 tentatives (backoff) : un timeout transitoire ne doit pas fausser /health.
 */
export async function assertMailReadyForBoot(): Promise<void> {
  if (!isProd()) {
    const status = await verifyMail();
    if (!status.configured) {
      console.warn("[mail] E-mail absent — OTP/reset/notifs en mode console (devCode / logs).");
    }
    return;
  }

  const required = mailRequired();
  const timeoutsMs = required ? [8_000, 10_000, 12_000] : [12_000];

  let status = await verifyMail({ timeoutMs: timeoutsMs[0] });
  for (
    let attempt = 1;
    attempt < timeoutsMs.length && status.configured && !status.verified;
    attempt++
  ) {
    console.warn(`[mail] verify ${attempt}/${timeoutsMs.length} échoué — nouvel essai…`);
    await new Promise((r) => setTimeout(r, 2_000 * attempt));
    status = await verifyMail({ timeoutMs: timeoutsMs[attempt] });
  }

  if (!required) {
    console.warn(
      "[mail] MAIL_REQUIRED=false — démarrage sans e-mail. OTP/reset/notifs indisponibles " +
        "(les codes de connexion sont renvoyés par l’API). À réactiver pour une instance publique."
    );
    return;
  }

  if (!status.configured) {
    throw new Error(
      "Production: e-mail obligatoire. Définissez BREVO_API_KEY (recommandé) ou SMTP_HOST + " +
        "SMTP_USER + SMTP_PASS (ou SMTP_URL), ainsi que MAIL_FROM."
    );
  }
  if (!status.verified) {
    throw new Error(`Production: e-mail inaccessible — ${status.error ?? "verify failed"}`);
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

type MailPayload = { from: string; to: string; subject: string; text: string; html: string };

async function deliver(transport: MailTransport, payload: MailPayload): Promise<void> {
  if (transport === "brevo-api") {
    await brevoRequest("/smtp/email", {
      method: "POST",
      body: JSON.stringify({
        sender: parseMailbox(payload.from),
        to: [{ email: payload.to }],
        subject: payload.subject,
        textContent: payload.text,
        htmlContent: payload.html,
      }),
    });
    return;
  }
  await getTransporter()!.sendMail(payload);
}

/** Envoie l'e-mail (API Brevo ou SMTP) ; sinon log (dev). Un nouvel essai sur erreur transitoire. */
export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ delivered: boolean }> {
  const transport = mailTransport();
  if (!transport) {
    if (isProd() && mailRequired()) {
      throw new Error("E-mail non configuré en production — impossible d’envoyer l’email.");
    }
    console.log(`[dev] mail → ${opts.to} | ${opts.subject}`);
    console.log(opts.text);
    return { delivered: false };
  }

  const payload: MailPayload = {
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
      await deliver(transport, payload);
      console.log(`[mail] sent (${transport}) → ${opts.to} | ${opts.subject}`);
      lastVerifyOk = true;
      lastVerifyError = null;
      return { delivered: true };
    } catch (err) {
      lastErr = err;
      if (attempt < 2 && isTransientMailError(err)) {
        console.warn(`[mail] tentative ${attempt} échouée (transitoire), nouvel essai…`);
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      break;
    }
  }

  const formatted = formatMailError(lastErr);
  // Panne du fournisseur (réseau, quota, clé refusée) : /health le reflète et
  // LOGIN_OTP_REQUIRED=auto repasse en connexion mot de passe seul. Un destinataire
  // invalide (400 / 5xx SMTP de boîte inexistante) ne dégrade pas l'état global.
  if (degradesMailStatus(lastErr)) {
    lastVerifyOk = false;
    lastVerifyError = formatted.message;
  }
  throw formatted;
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
