import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma.js";
import { analyzeJobHeuristic } from "../src/services/ai.js";

async function main() {
  const email = "demo@jobradar.dev";
  const passwordHash = await bcrypt.hash("demo1234", 10);

  const profileData = {
    cvText: `Développeur full-stack avec 5 ans d'expérience.
Stack: TypeScript, React, Node.js, PostgreSQL, Prisma, Tailwind.
À l'aise avec les APIs REST, l'auth JWT et l'intégration d'IA.
Communication, autonomie et travail d'équipe.
Recherche un poste Confirmé/Senior en remote ou Paris.`,
    cvFileName: "cv-demo.txt",
    cvImportedAt: new Date(),
    skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "Prisma", "Tailwind"],
    softSkills: ["Communication", "Autonomie", "Travail d'équipe"],
    targetRoles: ["Full-stack Developer", "Backend Engineer"],
    experienceYears: 5,
    preferredLocations: ["Remote", "Paris"],
    salaryMin: 50000,
    salaryMax: 70000,
    workModes: ["remote", "hybrid"],
    targetSeniority: "confirme",
    preferredSectors: ["SaaS", "Data"],
    avoidedSectors: ["Crypto"],
  };

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      name: "Demo User",
      profile: { create: profileData },
    },
    update: {
      passwordHash,
      name: "Demo User",
      profile: {
        upsert: {
          create: profileData,
          update: {
            cvText: profileData.cvText,
            cvFileName: profileData.cvFileName,
            cvImportedAt: profileData.cvImportedAt,
            skills: profileData.skills,
            softSkills: profileData.softSkills,
            targetRoles: profileData.targetRoles,
            experienceYears: profileData.experienceYears,
            preferredLocations: profileData.preferredLocations,
            salaryMin: profileData.salaryMin,
            salaryMax: profileData.salaryMax,
            workModes: profileData.workModes,
            targetSeniority: profileData.targetSeniority,
            preferredSectors: profileData.preferredSectors,
            avoidedSectors: profileData.avoidedSectors,
          },
        },
      },
    },
  });

  const sampleJobs = [
    {
      source: "manual",
      externalId: "seed-1",
      title: "Full-stack Developer (React / Node)",
      company: "NovaTech",
      location: "Remote - Europe",
      salaryRaw: "55-70k€",
      description:
        "Nous cherchons un·e développeur·se full-stack confirmé pour construire des dashboards data. Stack: React, TypeScript, Node.js, PostgreSQL. Remote friendly.",
      techStack: ["React", "TypeScript", "Node.js", "PostgreSQL"],
      seniority: "confirmé",
      url: "https://example.com/jobs/1",
    },
    {
      source: "manual",
      externalId: "seed-2",
      title: "Senior Backend Engineer",
      company: "PulseAI",
      location: "Paris / Hybrid",
      salaryRaw: null as string | null,
      description:
        "Urgent! Besoin immédiat d'un senior avec 10+ ans d'expérience en Node, Go, Kubernetes, Kafka, et IA générative. Salaire selon profil.",
      techStack: ["Node.js", "Go", "Kubernetes"],
      seniority: "senior",
      url: "https://example.com/jobs/2",
    },
    {
      source: "manual",
      externalId: "seed-3",
      title: "Frontend Engineer",
      company: "Leaf Studio",
      location: "Lyon",
      salaryRaw: "45k€",
      description:
        "Poste junior/mid React + Tailwind. Produit design-heavy. Collaboration étroite avec l'équipe produit.",
      techStack: ["React", "Tailwind", "Vite"],
      seniority: "mid",
      url: "https://example.com/jobs/3",
    },
  ];

  const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } });

  const savedJobs = [];
  for (const job of sampleJobs) {
    const saved = await prisma.job.upsert({
      where: {
        source_externalId: { source: job.source, externalId: job.externalId },
      },
      create: job,
      update: job,
    });
    savedJobs.push(saved);

    const result = analyzeJobHeuristic(profile, saved);
    await prisma.analysis.upsert({
      where: { jobId_userId: { jobId: saved.id, userId: user.id } },
      create: {
        jobId: saved.id,
        userId: user.id,
        relevanceScore: Math.round(result.relevanceScore),
        redFlags: result.redFlags,
        strengths: result.strengths,
        gaps: result.gaps,
        summary: result.summary,
        extractedSalary: result.extractedSalary ?? null,
        extractedStack: result.extractedStack,
        extractedSeniority: result.extractedSeniority ?? null,
      },
      update: {
        relevanceScore: Math.round(result.relevanceScore),
        redFlags: result.redFlags,
        strengths: result.strengths,
        gaps: result.gaps,
        summary: result.summary,
        extractedSalary: result.extractedSalary ?? null,
        extractedStack: result.extractedStack,
        extractedSeniority: result.extractedSeniority ?? null,
      },
    });
  }

  // Pipeline démo : une carte par colonne (dont une relance en retard)
  const ago = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const pipelineSeed: Array<{
    job: (typeof savedJobs)[0];
    status: "TO_APPLY" | "APPLIED" | "INTERVIEW" | "RESPONSE";
    createdAt: Date;
    history: { status: string; at: string }[];
    notes?: string;
    outcome?: string | null;
  }> = [
    {
      job: savedJobs[0]!,
      status: "TO_APPLY",
      createdAt: ago(2),
      history: [{ status: "TO_APPLY", at: ago(2).toISOString() }],
      notes: "Priorité haute — stack très alignée.",
    },
    {
      job: savedJobs[1]!,
      status: "APPLIED",
      createdAt: ago(20),
      history: [
        { status: "TO_APPLY", at: ago(20).toISOString() },
        { status: "APPLIED", at: ago(18).toISOString() },
      ],
      notes: "Candidature envoyée via le site. Relancer si silence.",
    },
    {
      job: savedJobs[2]!,
      status: "INTERVIEW",
      createdAt: ago(12),
      history: [
        { status: "TO_APPLY", at: ago(12).toISOString() },
        { status: "APPLIED", at: ago(10).toISOString() },
        { status: "INTERVIEW", at: ago(3).toISOString() },
      ],
      notes: "Entretien technique prévu — revoir Tailwind + design system.",
    },
  ];

  for (const item of pipelineSeed) {
    await prisma.application.upsert({
      where: { jobId_userId: { jobId: item.job.id, userId: user.id } },
      create: {
        jobId: item.job.id,
        userId: user.id,
        status: item.status,
        notes: item.notes,
        outcome: item.outcome ?? null,
        statusHistory: item.history,
        createdAt: item.createdAt,
      },
      update: {
        status: item.status,
        notes: item.notes,
        outcome: item.outcome ?? null,
        statusHistory: item.history,
      },
    });
  }

  console.log("Seed OK");
  console.log(`  user: ${email} / demo1234`);
  console.log(`  userId: ${user.id}`);
  console.log(`  analyses: ${sampleJobs.length} offres scorées`);
  console.log(`  applications: ${pipelineSeed.length} dans le pipeline`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
