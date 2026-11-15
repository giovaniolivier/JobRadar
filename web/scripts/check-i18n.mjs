// Vérifie que les catalogues de traduction fr et en ont exactement les mêmes clés.
// Sans dépendance : analyse le texte de src/lib/messages.ts (les clés sont en début de ligne).
// Échoue (code 1) et liste les écarts si une clé manque d'un côté.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "src", "lib", "messages.ts"), "utf8");

/** Extrait les clés "xxx": d'un bloc de locale délimité par `  <name>: {` … */
function keysOf(name) {
  const start = src.indexOf(`${name}: {`);
  if (start === -1) throw new Error(`Bloc de locale introuvable : ${name}`);
  // Fin du bloc : la première ligne `  },` au niveau d'indentation du bloc.
  const end = src.indexOf("\n  },", start);
  const body = src.slice(start, end === -1 ? undefined : end);
  const keys = new Set();
  for (const m of body.matchAll(/^\s*"([^"]+)"\s*:/gm)) keys.add(m[1]);
  return keys;
}

const fr = keysOf("fr");
const en = keysOf("en");

const missingInEn = [...fr].filter((k) => !en.has(k)).sort();
const missingInFr = [...en].filter((k) => !fr.has(k)).sort();

if (missingInEn.length || missingInFr.length) {
  console.error("❌ Traductions désynchronisées (messages.ts) :");
  if (missingInEn.length) console.error(`  Manquent en EN (${missingInEn.length}) : ${missingInEn.join(", ")}`);
  if (missingInFr.length) console.error(`  Manquent en FR (${missingInFr.length}) : ${missingInFr.join(", ")}`);
  process.exit(1);
}

console.log(`✅ Traductions synchronisées : ${fr.size} clés en FR et EN.`);
