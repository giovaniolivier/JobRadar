/**
 * Smoke checks that don't require a working DATABASE_URL.
 * Run: node scripts/smoke.mjs
 */
const API = process.env.API_URL ?? "http://localhost:4000";

async function main() {
  const health = await fetch(`${API}/health`);
  if (!health.ok) throw new Error(`health failed: ${health.status}`);
  const body = await health.json();
  console.log("OK /health", body);

  const remotive = await fetch("https://remotive.com/api/remote-jobs?limit=1");
  if (!remotive.ok) throw new Error(`remotive failed: ${remotive.status}`);
  const data = await remotive.json();
  console.log("OK remotive jobs sample:", data.jobs?.[0]?.title ?? "(none)");

  console.log("Smoke (no-DB) passed. Configure DATABASE_URL then: npm run db:push && npm run db:seed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
