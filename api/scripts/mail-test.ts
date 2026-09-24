/**
 * Test SMTP end-to-end.
 * Usage: npm run mail:test
 * Optional: MAIL_TO=you@example.com npm run mail:test
 */
/// <reference types="node" />
import "dotenv/config";
import { appOrigin, sendMail, verifySmtp } from "../src/lib/mail.js";

async function main() {
  const status = await verifySmtp();
  console.log("SMTP status:", status);

  if (!status.configured) {
    console.error("SMTP non configuré. Renseignez SMTP_* dans api/.env (voir .env.example).");
    process.exit(1);
  }
  if (!status.verified) {
    console.error("Verify échoué:", status.error);
    process.exit(1);
  }

  const to =
    process.env.MAIL_TO?.trim() ||
    process.env.SMTP_USER?.trim() ||
    extractFrom(process.env.MAIL_FROM ?? "");

  if (!to) {
    console.error("Aucun destinataire. Définissez MAIL_TO ou SMTP_USER.");
    process.exit(1);
  }

  const result = await sendMail({
    to,
    subject: "JobRadar — test SMTP",
    text: `Test OK.\nOrigin app: ${appOrigin()}\nHorodatage: ${new Date().toISOString()}`,
    html: `
      <div style="font-family:sans-serif;max-width:420px;line-height:1.5">
        <p><strong>JobRadar</strong> — test SMTP réussi.</p>
        <p style="color:#666;font-size:13px">Origin: ${appOrigin()}</p>
        <p style="color:#666;font-size:13px">${new Date().toISOString()}</p>
      </div>
    `,
  });

  console.log(result.delivered ? `Email envoyé à ${to}` : "Non délivré (mode log)");
}

function extractFrom(from: string): string {
  const m = /<([^>]+)>/.exec(from);
  return (m?.[1] ?? from).trim();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
