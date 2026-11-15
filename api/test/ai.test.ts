import Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  aiProviderErrorMessage,
  analyzeJobHeuristic,
  isRetryableProviderError,
  providerChain,
} from "../src/services/ai.js";

const KEY = "k".repeat(32);

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("GROQ_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("AI_PROVIDER", "auto");
});

describe("providerChain", () => {
  it("ordre auto Gemini → Groq → Claude, selon les clés présentes", () => {
    vi.stubEnv("GEMINI_API_KEY", KEY);
    vi.stubEnv("GROQ_API_KEY", KEY);
    vi.stubEnv("ANTHROPIC_API_KEY", KEY);
    expect(providerChain()).toEqual(["gemini", "groq", "anthropic"]);
  });

  it("ignore les clés d'exemple", () => {
    vi.stubEnv("GEMINI_API_KEY", "your-gemini-api-key");
    vi.stubEnv("GROQ_API_KEY", KEY);
    expect(providerChain()).toEqual(["groq"]);
  });

  it("force un fournisseur, ou aucun", () => {
    vi.stubEnv("GROQ_API_KEY", KEY);
    vi.stubEnv("ANTHROPIC_API_KEY", KEY);
    vi.stubEnv("AI_PROVIDER", "claude");
    expect(providerChain()).toEqual(["anthropic"]);
    vi.stubEnv("AI_PROVIDER", "gemini");
    expect(providerChain()).toEqual([]);
    vi.stubEnv("AI_PROVIDER", "none");
    expect(providerChain()).toEqual([]);
  });
});

describe("isRetryableProviderError", () => {
  it("bascule sur les erreurs typées du SDK Anthropic (429, 5xx, réseau)", () => {
    const headers = new Headers();
    expect(isRetryableProviderError(new Anthropic.RateLimitError(429, {}, "rate", headers))).toBe(
      true
    );
    expect(
      isRetryableProviderError(new Anthropic.InternalServerError(529, {}, "overloaded", headers))
    ).toBe(true);
    expect(isRetryableProviderError(new Anthropic.APIConnectionError({ message: "reset" }))).toBe(
      true
    );
    expect(isRetryableProviderError(new Anthropic.BadRequestError(400, {}, "bad", headers))).toBe(
      false
    );
  });

  it("bascule sur les messages de quota des autres fournisseurs", () => {
    expect(isRetryableProviderError(new Error("Groq 429: rate limit reached"))).toBe(true);
    expect(isRetryableProviderError(new Error("RESOURCE_EXHAUSTED"))).toBe(true);
    expect(isRetryableProviderError(new Error("JSON invalide"))).toBe(false);
  });
});

describe("aiProviderErrorMessage", () => {
  it("traduit les erreurs courantes", () => {
    expect(aiProviderErrorMessage(new Error("Your credit balance is too low"))).toMatch(/Crédits/);
    expect(aiProviderErrorMessage(new Error("429 Too Many Requests"))).toMatch(/Quota/);
    expect(aiProviderErrorMessage(new Error("model does not exist"))).toMatch(/Modèle/);
    expect(aiProviderErrorMessage(new Error("???"))).toMatch(/échoué/);
  });
});

describe("analyzeJobHeuristic", () => {
  const profile = {
    cvText: "Développeur fullstack, 5 ans en React, TypeScript et Node.js.",
    skills: ["React", "TypeScript", "Node.js"],
    targetRoles: ["Développeur Fullstack"],
    experienceYears: 5,
    preferredLocations: ["Paris"],
  };

  it("donne un meilleur score à une offre alignée sur le profil", () => {
    const aligned = analyzeJobHeuristic(profile, {
      title: "Développeur Fullstack React",
      company: "Acme",
      location: "Paris",
      salaryRaw: "55k€",
      description: "Stack : React, TypeScript, Node.js. Équipe produit à Paris.",
      techStack: ["React", "TypeScript", "Node.js"],
      seniority: null,
    });
    const unrelated = analyzeJobHeuristic(profile, {
      title: "Ingénieur COBOL",
      company: "Banque",
      location: "Lille",
      salaryRaw: null,
      description: "Maintenance COBOL, JCL et mainframe z/OS. Urgent.",
      techStack: ["COBOL", "JCL", "z/OS"],
      seniority: null,
    });

    for (const r of [aligned, unrelated]) {
      expect(r.relevanceScore).toBeGreaterThanOrEqual(0);
      expect(r.relevanceScore).toBeLessThanOrEqual(100);
    }
    expect(aligned.relevanceScore).toBeGreaterThan(unrelated.relevanceScore);
    expect(unrelated.redFlags).toContain("Salaire non précisé");
  });
});
