import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const email = "demo@jobradar.dev";
  const passwordHash = await bcrypt.hash("demo1234", 10);

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      name: "Demo User",
      profile: {
        create: {
          cvText: `Développeur full-stack avec 5 ans d'expérience.
Stack: TypeScript, React, Node.js, PostgreSQL, Prisma, Tailwind.
À l'aise avec les APIs REST, l'auth JWT et l'intégration d'IA.
Recherche un poste Confirmé/Senior en remote ou Paris.`,
          skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "Prisma", "Tailwind"],
          targetRoles: ["Full-stack Developer", "Backend Engineer"],
          experienceYears: 5,
          preferredLocations: ["Remote", "Paris"],
        },
      },
    },
    update: {
      passwordHash,
      name: "Demo User",
      profile: {
        upsert: {
          create: {
            cvText: "Développeur full-stack TypeScript/React/Node.",
            skills: ["TypeScript", "React", "Node.js"],
            targetRoles: ["Full-stack Developer"],
            experienceYears: 5,
            preferredLocations: ["Remote", "Paris"],
          },
          update: {
            skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "Prisma", "Tailwind"],
            targetRoles: ["Full-stack Developer", "Backend Engineer"],
            experienceYears: 5,
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
      salaryRaw: null,
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

  for (const job of sampleJobs) {
    await prisma.job.upsert({
      where: {
        source_externalId: { source: job.source, externalId: job.externalId },
      },
      create: job,
      update: job,
    });
  }

  console.log("Seed OK");
  console.log(`  user: ${email} / demo1234`);
  console.log(`  userId: ${user.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
