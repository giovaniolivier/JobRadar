import dns from "dns";
import { describe, expect, it, vi } from "vitest";
import {
  assertPublicUrl,
  extractJobFromHtml,
  fetchPublicPage,
  isBlockedAddress,
  parsePublicUrl,
} from "../src/services/fetchOffer.js";

describe("isBlockedAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.20.0.5",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "::",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
  ])("bloque %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(["93.184.215.14", "8.8.8.8", "2606:4700:4700::1111"])("autorise %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});

describe("parsePublicUrl", () => {
  it.each([
    ["file:///etc/passwd", /http/],
    ["ftp://example.com/", /http/],
    ["http://localhost/", /publiquement/],
    ["http://api.localhost/", /publiquement/],
    ["http://127.0.0.1/", /publiquement/],
    ["http://[::1]/", /publiquement/],
    ["http://[::ffff:127.0.0.1]/", /publiquement/],
    ["http://169.254.169.254/latest/meta-data/", /publiquement/],
    ["http://intranet/", /publiquement/],
    ["http://example.com:5432/", /port/],
    ["http://user:pass@example.com/", /identifiants/],
    ["pas une url", /invalide/],
  ])("refuse %s", (url, message) => {
    expect(() => parsePublicUrl(url)).toThrow(message);
  });

  it("accepte une URL https publique", () => {
    expect(parsePublicUrl("https://www.welcometothejungle.com/fr/jobs/1").hostname).toBe(
      "www.welcometothejungle.com"
    );
  });
});

describe("assertPublicUrl", () => {
  it("refuse un nom de domaine qui résout vers une adresse privée", async () => {
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "10.0.0.7", family: 4 },
    ] as never);
    await expect(assertPublicUrl("https://interne.example.com/")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("accepte un domaine dont toutes les adresses sont publiques", async () => {
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "93.184.215.14", family: 4 },
    ] as never);
    await expect(assertPublicUrl("https://example.com/job")).resolves.toBeInstanceOf(URL);
  });

  it("signale un site introuvable", async () => {
    vi.spyOn(dns.promises, "lookup").mockRejectedValue(
      Object.assign(new Error("nope"), { code: "ENOTFOUND" })
    );
    await expect(assertPublicUrl("https://nexiste.pas.example/")).rejects.toMatchObject({
      status: 422,
    });
  });
});

describe("fetchPublicPage", () => {
  it("bloque un DNS rebinding : adresse publique à la vérification, privée à la connexion", async () => {
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "93.184.215.14", family: 4 },
    ] as never);
    vi.spyOn(dns, "lookup").mockImplementation(((
      _host: string,
      _opts: unknown,
      cb: (err: null, addresses: dns.LookupAddress[]) => void
    ) => cb(null, [{ address: "127.0.0.1", family: 4 }])) as never);
    await expect(fetchPublicPage("http://rebind.example.com/")).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("extractJobFromHtml", () => {
  const posting = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: "Développeur·se Fullstack",
    description:
      "<p>Rejoignez l&#39;équipe.</p><ul><li>TypeScript</li><li>PostgreSQL</li></ul>",
    hiringOrganization: { "@type": "Organization", name: "Alan" },
    jobLocation: {
      "@type": "Place",
      address: { addressLocality: "Paris", addressCountry: "FR" },
    },
    jobLocationType: "TELECOMMUTE",
    baseSalary: {
      "@type": "MonetaryAmount",
      currency: "EUR",
      value: {
        "@type": "QuantitativeValue",
        minValue: 50000,
        maxValue: 65000,
        unitText: "YEAR",
      },
    },
  };

  it("lit un JobPosting JSON-LD", () => {
    const html =
      `<html><head><script type="application/ld+json">${JSON.stringify(posting)}</script>` +
      "</head><body>menu</body></html>";
    expect(extractJobFromHtml(html)).toEqual({
      title: "Développeur·se Fullstack",
      company: "Alan",
      location: "Paris, FR · Remote",
      salary: "50000–65000 EUR / year",
      description: "Rejoignez l'équipe.\n\n- TypeScript\n- PostgreSQL",
      source: "json-ld",
    });
  });

  it("trouve le JobPosting dans un @graph et ignore un JSON-LD invalide", () => {
    const html =
      '<script type="application/ld+json">{ invalide </script>' +
      `<script type="application/ld+json">${JSON.stringify({
        "@graph": [{ "@type": "WebPage" }, { ...posting, "@type": ["JobPosting"] }],
      })}</script>`;
    const offer = extractJobFromHtml(html);
    expect(offer.source).toBe("json-ld");
    expect(offer.company).toBe("Alan");
  });

  it("se rabat sur le texte de la page sans JSON-LD", () => {
    const html = `<html><head>
      <meta property="og:title" content="Product Designer - Doctolib">
      <meta property="og:site_name" content="Doctolib">
    </head><body><nav>Accueil · Offres</nav><main><h1>Product Designer</h1>
    <p>Vous concevrez nos parcours.</p></main><footer>© 2026</footer></body></html>`;
    expect(extractJobFromHtml(html)).toEqual({
      title: "Product Designer",
      company: "Doctolib",
      location: null,
      salary: null,
      description: "Product Designer\n\nVous concevrez nos parcours.",
      source: "html",
    });
  });
});
