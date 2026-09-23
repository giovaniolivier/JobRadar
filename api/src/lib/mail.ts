import crypto from "crypto";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

let transporter: Transporter | null | undefined;

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_URL?.trim() ||
      (process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim())
  );
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
    auth: {
      user: process.env.SMTP_USER!.trim(),
      pass,
    },
  });
  return transporter;
}

function mailFrom(): string {
  return (
    process.env.MAIL_FROM?.trim() ||
    process.env.SMTP_USER?.trim() ||
    "JobRadar <noreply@jobradar.local>"
  );
}

/** Sends email via SMTP when configured; otherwise logs (dev fallback). */
export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ delivered: boolean }> {
  const tx = getTransporter();
  if (!tx) {
    console.log(`[dev] mail → ${opts.to} | ${opts.subject}`);
    console.log(opts.text);
    return { delivered: false };
  }

  try {
    await tx.sendMail({
      from: mailFrom(),
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html:
        opts.html ??
        `<pre style="font-family:sans-serif;font-size:16px">${opts.text.replace(/\n/g, "<br/>")}</pre>`,
    });
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
    if (code === "EAUTH") {
      throw new Error(
        "SMTP refusé par Gmail (identifiants invalides). Utilisez un mot de passe d'application, pas le mot de passe du compte."
      );
    }
    throw err;
  }
  console.log(`[mail] sent → ${opts.to} | ${opts.subject}`);
  return { delivered: true };
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
