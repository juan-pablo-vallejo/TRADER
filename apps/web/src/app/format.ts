// Display formatting for the office (DESIGN, Typography: money from integer cents through
// the locale formatter; dates as calendar days). A work date is a YYYY-MM-DD string and is
// rendered from its parts: `new Date(iso)` would read it as UTC midnight, which is the day
// before in Eastern. Consumed by the roster screen.
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

// "25", "25.5" or "25.50" to cents, by digits, never through a float; null when malformed.
export function cents(amount: string): number | null {
  const match = /^\s*(\d+)(?:\.(\d{1,2}))?\s*$/.exec(amount);
  if (match === null) return null;
  const whole = match[1]!;
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const value = Number(whole) * 100 + Number(fraction);
  return Number.isSafeInteger(value) && value <= 2147483647 ? value : null;
}
