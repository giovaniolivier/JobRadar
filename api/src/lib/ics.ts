// Génère un évènement iCalendar (.ics) minimal mais conforme (RFC 5545),
// importable dans Google Agenda, Outlook, Apple Calendar…

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Date → format iCalendar UTC : 20261120T140000Z */
function toIcsUtc(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** Échappe les caractères spéciaux d'une valeur texte iCalendar. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Replie les lignes à 75 octets (RFC 5545) avec une espace de continuation. */
function foldLine(line: string): string {
  if (Buffer.byteLength(line, "utf8") <= 75) return line;
  const out: string[] = [];
  let current = "";
  for (const ch of line) {
    if (Buffer.byteLength(current + ch, "utf8") > 74) {
      out.push(current);
      current = " " + ch;
    } else {
      current += ch;
    }
  }
  if (current) out.push(current);
  return out.join("\r\n");
}

export type IcsEvent = {
  uid: string;
  start: Date;
  durationMinutes?: number;
  summary: string;
  description?: string;
  url?: string;
  location?: string;
};

export function buildEventIcs(event: IcsEvent): string {
  const end = new Date(event.start.getTime() + (event.durationMinutes ?? 30) * 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//JobRadar//Agenda//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeText(event.uid)}`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(event.start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeText(event.summary)}`,
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.url ? [`URL:${escapeText(event.url)}`] : []),
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(event.summary)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
