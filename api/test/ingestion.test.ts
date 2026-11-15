import { describe, expect, it } from "vitest";
import { htmlToText, stripHtml } from "../src/lib/html.js";
import {
  needsJobMetadataRepair,
  normalizeUrl,
  parseJobsCsv,
  parsePastedJob,
  repairJobMetadataFromDescription,
} from "../src/services/ingestion.js";

describe("parsePastedJob", () => {
  it("lit le format explicite « Titre | Entreprise »", () => {
    const job = parsePastedJob(
      "Développeur React | Acme\nhttps://acme.io/jobs/1\nNous cherchons un développeur React."
    );
    expect(job.title).toBe("Développeur React");
    expect(job.company).toBe("Acme");
    expect(job.url).toBe("https://acme.io/jobs/1");
  });

  it("lit les libellés « Poste : » et « Entreprise : »", () => {
    const job = parsePastedJob(
      "Poste : Développeur Backend Node.js\nEntreprise : Qonto\nMissions : concevoir des API."
    );
    expect(job.title).toBe("Développeur Backend Node.js");
    expect(job.company).toBe("Qonto");
  });

  it("ne garde jamais un pitch d'entreprise comme titre", () => {
    const job = parsePastedJob(
      "Startfast est une startup qui révolutionne la logistique urbaine en France.\n" +
        "Nous recrutons un Développeur Fullstack pour renforcer l'équipe produit."
    );
    expect(job.title).not.toMatch(/est une startup/);
    expect(job.title).toMatch(/Développeur Fullstack/);
    expect(job.company).toBe("Startfast");
  });

  it("met des valeurs par défaut quand rien n'est détectable", () => {
    const job = parsePastedJob("bonjour\nmerci");
    expect(job.title).toBe("Offre à analyser");
    expect(job.description).toBe("bonjour\nmerci");
  });
});

describe("parseJobsCsv", () => {
  it("lit les colonnes attendues et découpe la stack", () => {
    const rows = parseJobsCsv(
      "title,company,description,tech,salary\n" +
        'Dev Go,Doctolib,"Backend en Go",go|postgres;kafka,55k\n' +
        "Sans entreprise,,Desc,,\n"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: "Dev Go",
      company: "Doctolib",
      salaryRaw: "55k",
      techStack: ["go", "postgres", "kafka"],
    });
  });

  it("accepte les en-têtes en majuscules", () => {
    const rows = parseJobsCsv("Title,Company,Description\nPM,Alan,Produit santé\n");
    expect(rows[0]).toMatchObject({ title: "PM", company: "Alan" });
  });
});

describe("réparation des métadonnées", () => {
  it("détecte les placeholders et les titres de section", () => {
    expect(needsJobMetadataRepair({ title: "Offre à analyser", company: "Acme" })).toBe(true);
    expect(needsJobMetadataRepair({ title: "Développeur", company: "Entreprise inconnue" })).toBe(
      true
    );
    expect(needsJobMetadataRepair({ title: "Missions", company: "Acme" })).toBe(true);
    expect(needsJobMetadataRepair({ title: "Développeur React", company: "Acme" })).toBe(false);
  });

  it("répare depuis la description", () => {
    const fixed = repairJobMetadataFromDescription({
      title: "Offre à analyser",
      company: "Entreprise inconnue",
      description: "Poste : Data Engineer\nEntreprise : Back Market\nStack : Python, Airflow",
    });
    expect(fixed).toEqual({ title: "Data Engineer", company: "Back Market" });
  });
});

describe("normalizeUrl", () => {
  it("considère équivalentes des variantes du même lien", () => {
    const base = normalizeUrl("https://Jobs.example.com/offer/42");
    expect(normalizeUrl("https://jobs.example.com/offer/42/")).toBe(base);
    expect(normalizeUrl("https://jobs.example.com/offer/42#section")).toBe(base);
    expect(normalizeUrl("https://jobs.example.com/offer/42?utm_source=remotive&utm_medium=rss")).toBe(
      base
    );
  });

  it("distingue deux offres différentes", () => {
    expect(normalizeUrl("https://example.com/offer/1")).not.toBe(
      normalizeUrl("https://example.com/offer/2")
    );
  });

  it("garde les paramètres significatifs et ignore une chaîne vide", () => {
    expect(normalizeUrl("https://example.com/jobs?id=99")).toBe("https://example.com/jobs?id=99");
    expect(normalizeUrl("   ")).toBeNull();
  });
});

describe("html", () => {
  it("stripHtml retire balises et scripts, et décode les entités", () => {
    expect(
      stripHtml(
        "<p>Salaire&nbsp;: 50&#160;k&euro; &amp; &lt;télétravail&gt;</p><script>x()</script>"
      )
    ).toBe("Salaire : 50 k€ & <télétravail>");
  });

  it("htmlToText garde les paragraphes et les puces", () => {
    expect(
      htmlToText("<h2>Missions</h2><ul><li>Coder</li><li>Tester</li></ul><p>Fin&#x21;</p>")
    ).toBe("Missions\n\n- Coder\n- Tester\n\nFin!");
  });
});
