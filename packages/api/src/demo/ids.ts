// Deterministic ids, and the default anchor week, for the demo fixture.
// Every demo record carries a UUIDv7 (docs/ARCHITECTURE.md, invariant 2) whose 48-bit time is the
// record's own client time and whose 74 random bits come from a generator seeded by the run's
// anchor, so one anchor yields one id set every run: a second run against the same database is
// recognisable as duplicates, never as new rows. The test helpers' uuidv7 stays random, because
// rows written by rolled-back tests share a database.
import { addDays, dayIn, mondayOf } from "../contract/calendar";

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

// The default anchor: the Monday two weeks before `now`'s date in the zone, so the office sees
// two recent recorded weeks and the week it is opened in.
export function defaultAnchor(now: Date, timeZone: string): string {
  return addDays(mondayOf(dayIn(now, timeZone)), -14);
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
