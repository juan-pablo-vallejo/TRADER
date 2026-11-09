// Deterministic ids and clock arithmetic for the demo fixture (TASKS, Stage 4: demo fixture).
// Every demo record carries a UUIDv7 (ARCHITECTURE invariant 2) whose 48-bit time is the
// record's own client time and whose 74 random bits come from a generator seeded by the run's
// anchor, so one anchor yields one id set every run: a second run against the same database is
// recognisable as duplicates, never as new rows. The test helpers' uuidv7 stays random, because
// rows written by rolled-back tests share a database. Consumed by demo/content.ts and
// demo/run.ts.

// FNV-1a over the seed text, then mulberry32: small, dependency-free, good enough for ids that
// only need to be distinct and repeatable (nothing here is a secret).
export function seededRandom(seed: string): () => number {
  let h = 0x811c9dc5;
  for (const ch of seed) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let a = h || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A UUIDv7 at `ms` with random bits from `random`: version nibble 7, variant bits 10.
export function uuidv7At(ms: number, random: () => number): string {
  if (!Number.isInteger(ms) || ms < 0 || ms >= 2 ** 48)
    throw new Error("uuidv7At: ms out of range");
  const b = new Uint8Array(16);
  for (let i = 0; i < 10; i++) b[6 + i] = Math.floor(random() * 256);
  const t = BigInt(ms);
  for (let i = 0; i < 6; i++) b[i] = Number((t >> BigInt(8 * (5 - i))) & 0xffn);
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// The wall-clock offset of `timeZone` at a UTC instant, in milliseconds.
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const n = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(
    n("year"),
    n("month") - 1,
    n("day"),
    n("hour"),
    n("minute"),
    n("second"),
  );
  return asUtc - utcMs;
}

// The instant at which a calendar day's wall-clock time occurs in a zone (DESIGN: times render
// in the company's timezone; the demo states them that way too). Two passes settle an
// instant on either side of a DST change; no demo time falls inside a transition gap.
export function atZone(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let utc = guess - zoneOffsetMs(guess, timeZone);
  utc = guess - zoneOffsetMs(utc, timeZone);
  return new Date(utc);
}

// The calendar date (YYYY-MM-DD) of an instant in a zone.
export function dateIn(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

// `date` plus `days` calendar days, as YYYY-MM-DD (UTC arithmetic on a date-only value).
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// The default anchor: the Monday two weeks before `now`'s date in the zone, so the office sees
// recent, closed-out weeks and one week still open. ISO weekday arithmetic on the date only.
export function defaultAnchor(now: Date, timeZone: string): string {
  const today = dateIn(now, timeZone);
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sunday … 6 Saturday
  const sinceMonday = (dow + 6) % 7;
  return addDays(today, -sinceMonday - 14);
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
