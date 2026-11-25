// A job's location as one field: what the office pastes, read into a pair of coordinates.
// Pure. It takes a pair as a map shows it ("41.8240, -71.4128"), or a maps address that
// carries one: Google's place and view addresses and their `q`, `ll` and `query`
// parameters, and Apple's `ll`, `q` and `coordinate`. A short link carries no coordinates
// at all (it is only a redirect), so it is refused by name, and the screen says how to
// copy the pair instead: nothing here ever follows a link, the office's browser loads no
// other host.
import { MAX_JOBSITE_RADIUS_M } from "@trader/api/contract";

export type ParsedLocation =
  | { ok: true; lat: number; lng: number }
  // `short_link`: an address that hides the coordinates behind a redirect.
  // `unreadable`: neither a pair nor an address that carries one.
  // `out_of_range`: numbers that are no place on Earth.
  | { ok: false; problem: "empty" | "short_link" | "unreadable" | "out_of_range" };

const NUMBER = String.raw`-?\d{1,3}(?:\.\d+)?`;
const PAIR = new RegExp(
  String.raw`^\s*\(?\s*(${NUMBER})\s*[,;\s]\s*(${NUMBER})\s*\)?\s*$`,
);

// Hosts that only redirect: the pair is not in the address.
const SHORT = /(^|\.)(goo\.gl|g\.co|maps\.app\.goo\.gl|apple\.co|bit\.ly|tinyurl\.com)$/i;

function pair(lat: string, lng: string): ParsedLocation {
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b))
    return { ok: false, problem: "unreadable" };
  if (Math.abs(a) > 90 || Math.abs(b) > 180)
    return { ok: false, problem: "out_of_range" };
  return { ok: true, lat: a, lng: b };
}

export function parseLocation(text: string): ParsedLocation {
  const typed = text.trim();
  if (typed === "") return { ok: false, problem: "empty" };
  const plain = PAIR.exec(typed);
  if (plain !== null) return pair(plain[1]!, plain[2]!);

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(typed) ? typed : `https://${typed}`);
  } catch {
    return { ok: false, problem: "unreadable" };
  }
  if (!url.hostname.includes(".")) return { ok: false, problem: "unreadable" };
  if (SHORT.test(url.hostname)) return { ok: false, problem: "short_link" };

  const whole = `${url.pathname}${url.search}${url.hash}`;
  // The place itself, where the address names one: more exact than the view's center.
  const place = new RegExp(`!3d(${NUMBER})!4d(${NUMBER})`).exec(whole);
  if (place !== null) return pair(place[1]!, place[2]!);
  for (const name of [
    "q",
    "ll",
    "query",
    "coordinate",
    "center",
    "destination",
    "daddr",
    "sll",
  ]) {
    const value = url.searchParams.get(name);
    const found = value === null ? null : PAIR.exec(value.replace(/^loc:/i, ""));
    if (found !== null) return pair(found[1]!, found[2]!);
  }
  // The view's center: `/@41.8240,-71.4128,17z`.
  const view = new RegExp(`@(${NUMBER}),(${NUMBER})`).exec(whole);
  if (view !== null) return pair(view[1]!, view[2]!);
  return { ok: false, problem: "unreadable" };
}

// A stored location as the field shows it: the pair, as it would be pasted.
export const locationText = (location: { lat: number; lng: number } | null): string =>
  location === null ? "" : `${location.lat}, ${location.lng}`;

// The radius as typed: a whole number of meters from 1 to the contract's ceiling, or null.
export function parseRadius(text: string): number | null {
  const typed = text.trim();
  if (!/^\d{1,6}$/.test(typed)) return null;
  const meters = Number(typed);
  return meters >= 1 && meters <= MAX_JOBSITE_RADIUS_M ? meters : null;
}
