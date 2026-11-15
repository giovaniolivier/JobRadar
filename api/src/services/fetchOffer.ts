/**
 * Lecture d'une offre d'emploi depuis son URL.
 *
 * Sécurité (SSRF) : l'API va chercher une URL fournie par l'utilisateur, il ne faut
 * donc jamais qu'elle atteigne le réseau interne (métadonnées cloud 169.254.169.254,
 * Postgres, localhost…). Chaque connexion passe par `safeLookup`, qui refuse les
 * adresses non publiques au moment même de la résolution DNS (pas de « DNS rebinding »
 * entre la vérification et la connexion), et chaque redirection est revérifiée.
 */
import dns from "dns";
import http from "http";
import https from "https";
import net from "net";
import type { Readable } from "stream";
import zlib from "zlib";
import { htmlToText, decodeEntities } from "../lib/html.js";

const MAX_REDIRECTS = 3;
const MAX_BYTES = 2 * 1024 * 1024;
const TOTAL_TIMEOUT_MS = 15_000;
const IDLE_TIMEOUT_MS = 10_000;
const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);
const MAX_PAGE_TEXT = 12_000;
const USER_AGENT = "Mozilla/5.0 (compatible; JobRadarBot/1.0)";

/** Erreur destinée à l'utilisateur, avec le statut HTTP à renvoyer. */
export class OfferFetchError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "OfferFetchError";
  }
}

const BLOCKED_V4 = new net.BlockList();
for (const [prefix, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  BLOCKED_V4.addSubnet(prefix, bits, "ipv4");
}

const BLOCKED_V6 = new net.BlockList();
for (const [prefix, bits] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  BLOCKED_V6.addSubnet(prefix, bits, "ipv6");
}

/** Vrai si l'adresse IP n'est pas publique (privée, locale, réservée…). */
export function isBlockedAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return BLOCKED_V4.check(ip, "ipv4");
  if (family === 6) {
    const lower = ip.toLowerCase();
    // IPv4 mappée (::ffff:127.0.0.1) : on vérifie l'IPv4 sous-jacente.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return BLOCKED_V4.check(mapped[1]!, "ipv4");
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(lower)) return true;
    return BLOCKED_V6.check(lower, "ipv6");
  }
  return true;
}

function bareHostname(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

/** Valide la forme de l'URL (protocole, port, hôte). Ne résout pas le DNS. */
export function parsePublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new OfferFetchError("Lien invalide. Copiez l'adresse complète de l'offre (https://…).", 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new OfferFetchError("Seuls les liens http:// et https:// sont acceptés.", 400);
  }
  if (url.username || url.password) {
    throw new OfferFetchError("Les liens contenant des identifiants ne sont pas acceptés.", 400);
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    throw new OfferFetchError("Ce port n'est pas autorisé.", 400);
  }
  const host = bareHostname(url);
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    (!net.isIP(host) && !host.includes("."))
  ) {
    throw new OfferFetchError("Cette adresse n'est pas accessible publiquement.", 400);
  }
  if (net.isIP(host) && isBlockedAddress(host)) {
    throw new OfferFetchError("Cette adresse n'est pas accessible publiquement.", 400);
  }
  return url;
}

/** Valide l'URL puis vérifie que toutes les adresses DNS de l'hôte sont publiques. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  const url = parsePublicUrl(raw);
  const host = bareHostname(url);
  if (net.isIP(host)) return url;
  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns.promises.lookup(host, { all: true });
  } catch {
    throw new OfferFetchError("Site introuvable. Vérifiez le lien de l'offre.", 422);
  }
  if (!addresses.length || addresses.some((a) => isBlockedAddress(a.address))) {
    throw new OfferFetchError("Cette adresse n'est pas accessible publiquement.", 400);
  }
  return url;
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number
) => void;

/** `lookup` passé à http(s).request : refuse toute résolution vers une adresse non publique. */
function safeLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "");
    const list = addresses as dns.LookupAddress[];
    if (!list.length || list.some((a) => isBlockedAddress(a.address))) {
      const blocked = new Error("blocked address") as NodeJS.ErrnoException;
      blocked.code = "EBLOCKED";
      return callback(blocked, "");
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0]!.address, list[0]!.family);
  });
}

function charsetOf(contentType: string): string {
  return /charset=["']?([\w-]+)/i.exec(contentType)?.[1]?.toLowerCase() ?? "utf-8";
}

function decodeBody(buf: Buffer, contentType: string): string {
  try {
    return new TextDecoder(charsetOf(contentType)).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

type RawResponse = { status: number; location?: string; contentType: string; body: string };

function requestOnce(url: URL, signal: AbortSignal): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      {
        method: "GET",
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8",
          "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
          "accept-encoding": "gzip, deflate, br",
        },
        lookup: safeLookup as unknown as typeof dns.lookup,
        timeout: IDLE_TIMEOUT_MS,
        signal,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers["content-type"] ?? "");
        if (status >= 300 && status < 400) {
          res.resume();
          resolve({ status, location: res.headers.location, contentType, body: "" });
          return;
        }
        if (status >= 400) {
          res.resume();
          reject(
            new OfferFetchError(
              status === 401 || status === 403 || status === 429
                ? "Ce site bloque la lecture automatique des offres. Collez le texte de l'offre."
                : `Le site a répondu ${status}. Vérifiez le lien ou collez le texte de l'offre.`,
              422
            )
          );
          return;
        }
        if (contentType && !/text\/html|application\/xhtml|text\/plain/i.test(contentType)) {
          res.resume();
          reject(
            new OfferFetchError(
              "Ce lien ne pointe pas vers une page web (PDF, image…). Collez le texte de l'offre.",
              422
            )
          );
          return;
        }

        const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
        let stream: Readable = res;
        if (encoding === "gzip" || encoding === "x-gzip") stream = res.pipe(zlib.createGunzip());
        else if (encoding === "deflate") stream = res.pipe(zlib.createInflate());
        else if (encoding === "br") stream = res.pipe(zlib.createBrotliDecompress());

        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            req.destroy();
            reject(new OfferFetchError("Page trop volumineuse. Collez le texte de l'offre.", 422));
            return;
          }
          chunks.push(chunk);
        });
        stream.on("end", () =>
          resolve({ status, contentType, body: decodeBody(Buffer.concat(chunks), contentType) })
        );
        stream.on("error", reject);
      }
    );
    req.on("timeout", () =>
      req.destroy(new OfferFetchError("Le site met trop de temps à répondre.", 504))
    );
    req.on("error", reject);
    req.end();
  });
}

function toFriendlyError(err: unknown): OfferFetchError {
  if (err instanceof OfferFetchError) return err;
  const e = err as { code?: string; name?: string };
  if (e?.code === "EBLOCKED") {
    return new OfferFetchError("Cette adresse n'est pas accessible publiquement.", 400);
  }
  if (e?.code === "ENOTFOUND" || e?.code === "EAI_AGAIN") {
    return new OfferFetchError("Site introuvable. Vérifiez le lien de l'offre.", 422);
  }
  if (e?.name === "AbortError" || e?.name === "TimeoutError") {
    return new OfferFetchError("Le site met trop de temps à répondre.", 504);
  }
  return new OfferFetchError(
    "Impossible de lire cette page. Collez le texte de l'offre à la place.",
    502
  );
}

/** Télécharge la page (redirections revérifiées) et renvoie son HTML. */
export async function fetchPublicPage(raw: string): Promise<{ url: URL; html: string }> {
  const signal = AbortSignal.timeout(TOTAL_TIMEOUT_MS);
  let url = await assertPublicUrl(raw);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await requestOnce(url, signal);
      if (res.status >= 300 && res.status < 400) {
        if (!res.location || hop === MAX_REDIRECTS) {
          throw new OfferFetchError("Trop de redirections. Collez le texte de l'offre.", 422);
        }
        url = await assertPublicUrl(new URL(res.location, url).toString());
        continue;
      }
      return { url, html: res.body };
    }
  } catch (err) {
    throw toFriendlyError(err);
  }
  throw new OfferFetchError("Trop de redirections. Collez le texte de l'offre.", 422);
}

// ── Extraction ──────────────────────────────────────────────────────────────

export type ExtractedOffer = {
  title: string | null;
  company: string | null;
  location: string | null;
  salary: string | null;
  description: string;
  source: "json-ld" | "html";
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

function isObject(v: Json | undefined): v is JsonObject {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function str(v: Json | undefined): string | null {
  if (typeof v === "string") return decodeEntities(v).trim() || null;
  if (typeof v === "number") return String(v);
  return null;
}

function hasType(node: JsonObject, type: string): boolean {
  const t = node["@type"];
  return t === type || (Array.isArray(t) && t.includes(type));
}

function findJobPosting(node: Json | undefined, depth = 0): JsonObject | null {
  if (!node || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findJobPosting(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isObject(node)) return null;
  if (hasType(node, "JobPosting")) return node;
  return findJobPosting(node["@graph"], depth + 1) ?? findJobPosting(node.mainEntity, depth + 1);
}

function nameOf(v: Json | undefined): string | null {
  if (Array.isArray(v)) return nameOf(v[0]);
  if (isObject(v)) return str(v.name);
  return str(v);
}

function locationOf(posting: JsonObject): string | null {
  const parts: string[] = [];
  const locations = Array.isArray(posting.jobLocation) ? posting.jobLocation : [posting.jobLocation];
  for (const loc of locations) {
    if (!isObject(loc)) continue;
    const address = loc.address;
    if (isObject(address)) {
      const place = [address.addressLocality, address.addressRegion, address.addressCountry]
        .map((p) => (isObject(p) ? str(p.name) : str(p)))
        .filter((p): p is string => Boolean(p));
      if (place.length) parts.push([...new Set(place)].join(", "));
    } else if (str(address)) {
      parts.push(str(address)!);
    }
  }
  const remote = /telecommute/i.test(JSON.stringify(posting.jobLocationType ?? ""));
  if (remote) parts.push("Remote");
  return parts.length ? [...new Set(parts)].slice(0, 3).join(" · ") : null;
}

function salaryOf(posting: JsonObject): string | null {
  const base = posting.baseSalary ?? posting.estimatedSalary;
  const salary = Array.isArray(base) ? base[0] : base;
  if (!isObject(salary)) return str(salary);
  const currency = str(salary.currency) ?? "";
  const value = salary.value;
  if (isObject(value)) {
    const min = str(value.minValue);
    const max = str(value.maxValue);
    const single = str(value.value);
    const unit = str(value.unitText);
    const amount = min && max ? `${min}–${max}` : (single ?? min ?? max);
    if (!amount) return null;
    return [amount, currency, unit ? `/ ${unit.toLowerCase()}` : ""].filter(Boolean).join(" ");
  }
  const amount = str(value);
  return amount ? `${amount} ${currency}`.trim() : null;
}

function metaContent(html: string, key: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']|` +
      `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`,
    "i"
  );
  const m = re.exec(html);
  const value = m?.[1] ?? m?.[2];
  return value ? decodeEntities(value).trim() || null : null;
}

function mainHtml(html: string): string {
  const pick = (tag: string) => new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(html)?.[1];
  const body = pick("main") ?? pick("article") ?? pick("body") ?? html;
  return body.replace(/<(nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, " ");
}

/** Extrait l'offre d'une page : JSON-LD schema.org `JobPosting` d'abord, texte de la page sinon. */
export function extractJobFromHtml(html: string): ExtractedOffer {
  const scripts = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const [, raw] of scripts) {
    let data: Json;
    try {
      data = JSON.parse(raw!.trim()) as Json;
    } catch {
      continue;
    }
    const posting = findJobPosting(data);
    if (!posting) continue;
    const description = htmlToText(String(str(posting.description) ?? ""));
    if (!description) continue;
    return {
      title: str(posting.title) ?? str(posting.name),
      company: nameOf(posting.hiringOrganization),
      location: locationOf(posting),
      salary: salaryOf(posting),
      description,
      source: "json-ld",
    };
  }

  const rawTitle =
    metaContent(html, "og:title") ??
    (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
      ? decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)![1]!).trim()
      : null);
  const company = metaContent(html, "og:site_name");
  const title =
    rawTitle && company ? rawTitle.replace(new RegExp(`\\s*[|\\-–—]\\s*${escapeRegExp(company)}\\s*$`, "i"), "") : rawTitle;
  return {
    title: title || null,
    company,
    location: null,
    salary: null,
    // Texte de page brut : on coupe pour ne pas envoyer toute une page (menus, pied
    // de page…) à l'IA. Le JSON-LD, lui, ne contient que l'offre et reste entier.
    description: htmlToText(mainHtml(html)).slice(0, MAX_PAGE_TEXT),
    source: "html",
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Lit l'offre derrière `url`. Lève une `OfferFetchError` au message affichable. */
export async function fetchOfferFromUrl(raw: string, minLength: number) {
  const { url, html } = await fetchPublicPage(raw);
  const offer = extractJobFromHtml(html);
  if (offer.description.length < minLength) {
    throw new OfferFetchError(
      "Impossible de trouver le texte de l'offre sur cette page (site protégé ou contenu chargé " +
        "en JavaScript). Collez le texte de l'offre.",
      422
    );
  }
  return { ...offer, url: url.toString() };
}
