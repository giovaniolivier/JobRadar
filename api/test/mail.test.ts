import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateOtpCode,
  getMailStatus,
  mailTransport,
  maskEmail,
  parseMailbox,
  resetMailTransporter,
  sendMail,
  verifyMail,
} from "../src/lib/mail.js";

function clearMailEnv() {
  for (const key of [
    "BREVO_API_KEY",
    "SMTP_URL",
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_PORT",
    "MAIL_FROM",
    "RENDER",
  ]) {
    vi.stubEnv(key, "");
  }
  vi.stubEnv("NODE_ENV", "test");
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  clearMailEnv();
  resetMailTransporter();
});

describe("choix du transport", () => {
  it("aucun transport sans configuration", () => {
    expect(mailTransport()).toBeNull();
    expect(getMailStatus()).toMatchObject({ configured: false, transport: null });
  });

  it("SMTP quand SMTP_HOST/USER/PASS sont définis", () => {
    vi.stubEnv("SMTP_HOST", "smtp-relay.brevo.com");
    vi.stubEnv("SMTP_USER", "login");
    vi.stubEnv("SMTP_PASS", "secret");
    expect(mailTransport()).toBe("smtp");
  });

  it("l'API Brevo est prioritaire sur le SMTP", () => {
    vi.stubEnv("SMTP_HOST", "smtp-relay.brevo.com");
    vi.stubEnv("SMTP_USER", "login");
    vi.stubEnv("SMTP_PASS", "secret");
    vi.stubEnv("BREVO_API_KEY", "xkeysib-abc");
    expect(mailTransport()).toBe("brevo-api");
  });

  it("ignore la clé d'exemple du .env.example", () => {
    vi.stubEnv("BREVO_API_KEY", "xkeysib-your-brevo-api-key");
    expect(mailTransport()).toBeNull();
  });
});

describe("envoi via l'API Brevo", () => {
  beforeEach(() => {
    vi.stubEnv("BREVO_API_KEY", "xkeysib-abc");
    vi.stubEnv("MAIL_FROM", "JobRadar <noreply@jobradar.dev>");
  });

  it("envoie le bon payload avec la clé dans l'en-tête api-key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { messageId: "<id>" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendMail({ to: "ada@example.com", subject: "Code", text: "123456" })
    ).resolves.toEqual({ delivered: true });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.method).toBe("POST");
    expect(init.headers["api-key"]).toBe("xkeysib-abc");
    expect(JSON.parse(init.body)).toMatchObject({
      sender: { name: "JobRadar", email: "noreply@jobradar.dev" },
      to: [{ email: "ada@example.com" }],
      subject: "Code",
      textContent: "123456",
    });
  });

  it("refait un essai sur une erreur transitoire (503)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, { message: "busy" }))
      .mockResolvedValueOnce(jsonResponse(201, { messageId: "<id>" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendMail({ to: "a@b.co", subject: "s", text: "t" })).resolves.toEqual({
      delivered: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("explique une clé refusée (401) et marque l'e-mail comme non vérifié", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(401, { code: "unauthorized", message: "Key not found" }))
    );

    await expect(sendMail({ to: "a@b.co", subject: "s", text: "t" })).rejects.toThrow(
      /BREVO_API_KEY/
    );
    expect(getMailStatus().verified).toBe(false);
  });

  it("vérifie la clé avec GET /account", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { email: "x" }));
    vi.stubGlobal("fetch", fetchMock);

    const status = await verifyMail();
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.brevo.com/v3/account");
    expect(status).toMatchObject({ configured: true, transport: "brevo-api", verified: true });
  });
});

describe("utilitaires", () => {
  it("parseMailbox", () => {
    expect(parseMailbox("JobRadar <noreply@x.com>")).toEqual({
      name: "JobRadar",
      email: "noreply@x.com",
    });
    expect(parseMailbox("noreply@x.com")).toEqual({ email: "noreply@x.com" });
  });

  it("maskEmail", () => {
    expect(maskEmail("ada.lovelace@example.com")).toBe("ad***@example.com");
    expect(maskEmail("pas-un-email")).toBe("***");
  });

  it("generateOtpCode renvoie 6 chiffres", () => {
    for (let i = 0; i < 50; i++) expect(generateOtpCode()).toMatch(/^\d{6}$/);
  });
});
