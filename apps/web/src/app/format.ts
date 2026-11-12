// Display formatting for the office (DESIGN, Typography: money from integer cents through
// the locale formatter; dates as calendar days). A work date is a YYYY-MM-DD string and is
// rendered from its parts: `new Date(iso)` would read it as UTC midnight, which is the day
// before in Eastern. An instant is shown in the zone the server names, never the browser's.
// Consumed by the roster, assignments, approvals, ledger, closeout, materials and job
// screens.
import { strings } from "./strings";

export function money(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function day(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (y === undefined || m === undefined || d === undefined) return iso;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(y, m - 1, d));
}

// A work date with its weekday, as a plan is read: "Mon, Nov 16". From its parts, as `day`.
export function weekDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (y === undefined || m === undefined || d === undefined) return iso;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(y, m - 1, d));
}

// A calendar day `days` after `iso`, by calendar arithmetic in UTC so no zone or clock change
// can move it; and every day from `from` through `to`.
export function addDays(iso: string, days: number): string {
  const at = new Date(`${iso}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}
export function daysThrough(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to && days.length < 400; d = addDays(d, 1)) days.push(d);
  return days;
}

// "25", "25.5" or "25.50" to cents, by digits, never through a float; null when malformed.
export function cents(amount: string): number | null {
  const match = /^\s*(\d+)(?:\.(\d{1,2}))?\s*$/.exec(amount);
  if (match === null) return null;
  const whole = match[1]!;
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const value = Number(whole) * 100 + Number(fraction);
  return Number.isSafeInteger(value) && value <= 2147483647 ? value : null;
}

// Cents as the amount an office types back: "89.99". By integer arithmetic, never a float.
export function amount(value: number): string {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}

// Hours from the server's integer hundredths, as they are read and compared: "8.00",
// "0.05". By integer arithmetic, never a float; the figure is the server's and is not
// rounded here (labor/hours.ts rounds, once).
export function hours(hundredths: number): string {
  const abs = Math.abs(hundredths);
  return `${hundredths < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

// A signed figure, as an adjustment is read: "+6.50", "-0.50". The sign is always written,
// so a line is never mistaken for hours worked.
export const signedHours = (hundredths: number) =>
  `${hundredths > 0 ? "+" : ""}${hours(hundredths)}`;

// A receipt's facts as the office reads them: "2 gal Eggshell, white". The quantity is the
// database's numeric(12,3) text ("2.000" as "2", "2.500" as "2.5"), by digits, never a float.
export const quantity = (q: string) => (q.includes(".") ? q.replace(/\.?0+$/, "") : q);
export const materialFacts = (f: {
  description: string;
  quantity: string;
  unit: string;
}) => `${quantity(f.quantity)} ${f.unit} ${f.description}`;

// An instant with its day, in a named zone: an entry is often received, corrected or decided
// on a later day than the one it is about.
export function stamp(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(at);
}

// The calendar day of an instant in a named zone, as `day` prints one: for an entry that has
// a day and no time of its own (a receipt the office entered).
export function dayIn(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(at);
}

// Whole minutes from integer milliseconds, rounded down: a display, not the hours figure pay
// is built from.
export function duration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  return strings.duration(Math.floor(minutes / 60), minutes % 60);
}
