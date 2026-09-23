/** Normalisation des libellés de compétences / rôles (miroir léger de l’API). */
const KNOWN: Record<string, string> = {
  js: "JavaScript",
  ts: "TypeScript",
  javascript: "JavaScript",
  typescript: "TypeScript",
  node: "Node.js",
  nodejs: "Node.js",
  "node.js": "Node.js",
  react: "React",
  next: "Next.js",
  nextjs: "Next.js",
  "next.js": "Next.js",
  vue: "Vue.js",
  angular: "Angular",
  css: "CSS",
  html: "HTML",
  postgres: "PostgreSQL",
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  mongodb: "MongoDB",
  prisma: "Prisma",
  tailwind: "Tailwind CSS",
  tailwindcss: "Tailwind CSS",
  docker: "Docker",
  kubernetes: "Kubernetes",
  aws: "AWS",
  graphql: "GraphQL",
  python: "Python",
  golang: "Go",
  go: "Go",
  fullstack: "Full-stack",
  "full-stack": "Full-stack",
  "full stack": "Full-stack",
  "dev fullstack": "Full-stack",
  "dev full stack": "Full-stack",
  "dev full-stack": "Full-stack",
  backend: "Backend",
  frontend: "Frontend",
  nestjs: "NestJS",
  express: "Express",
};

function tokenKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.js\b/g, "js")
    .replace(/[^a-z0-9+#]/g, "");
}

export function normalizeSkillLabel(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const key = tokenKey(t);
  const spaced = t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (KNOWN[key]) return KNOWN[key]!;
  if (KNOWN[spaced]) return KNOWN[spaced]!;
  if (/^[A-Z0-9.+#/-]+$/.test(t) && t.length <= 6) return t;
  return t
    .split(/(\s|-)/)
    .map((part, i) => {
      if (part === " " || part === "-") return part;
      if (i > 0 && /^(et|de|du|des|la|le|les|d'|l')$/i.test(part)) return part.toLowerCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join("");
}

export function dedupeNormalize(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const label = normalizeSkillLabel(raw);
    const key = label.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

const MODE_RE =
  /^(remote|hybride?|hybrid|onsite|sur[\s-]?site|t[ée]l[ée]travail|teletravail|full\s*remote)$/i;

export function isWorkModeLocationTag(value: string): boolean {
  return MODE_RE.test(value.trim());
}

export function workModeFromTag(value: string): "remote" | "hybrid" | "onsite" | null {
  const v = value.trim().toLowerCase();
  if (/remote|t[ée]l[ée]travail|teletravail/.test(v)) return "remote";
  if (/hybrid|hybride/.test(v)) return "hybrid";
  if (/onsite|sur[\s-]?site/.test(v)) return "onsite";
  return null;
}

export function formatSalaryDisplay(digits: string): string {
  if (!digits) return "";
  const n = Number(digits);
  if (!Number.isFinite(n)) return digits;
  return new Intl.NumberFormat("fr-FR").format(n);
}

export function parseSalaryDigits(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}
