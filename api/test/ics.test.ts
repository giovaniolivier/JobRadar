import { describe, expect, it } from "vitest";
import { buildEventIcs } from "../src/lib/ics.js";

describe("buildEventIcs", () => {
  const ics = buildEventIcs({
    uid: "jobradar-abc@jobradar",
    start: new Date("2026-11-20T14:00:00Z"),
    durationMinutes: 30,
    summary: "JobRadar — Entretien : Dev; Fullstack, React (Acme, Inc.)",
    description: "Ligne 1\nLigne 2",
    url: "https://acme.example/jobs/1",
  });

  it("produit une structure VCALENDAR/VEVENT valide", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("UID:jobradar-abc@jobradar");
    expect(ics).toContain("VERSION:2.0");
  });

  it("calcule DTSTART et DTEND en UTC", () => {
    expect(ics).toContain("DTSTART:20261120T140000Z");
    expect(ics).toContain("DTEND:20261120T143000Z");
  });

  it("échappe les caractères spéciaux (virgule, point-virgule, retour ligne)", () => {
    expect(ics).toContain("SUMMARY:JobRadar — Entretien : Dev\\; Fullstack\\, React (Acme\\, Inc.)");
    expect(ics).toContain("DESCRIPTION:Ligne 1\\nLigne 2");
  });

  it("inclut un rappel une heure avant", () => {
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-PT1H");
  });

  it("utilise des fins de ligne CRLF", () => {
    expect(ics.includes("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "").includes("\n")).toBe(false);
  });
});
