// Wall time in a named zone, to the minute, and back (DESIGN, Typography: times through the
// platform formatter in the company's timezone). A `datetime-local` control reads and writes
// "YYYY-MM-DDTHH:MM" with no zone and the browser would take it as its own; the office enters
// a repaired time as the company's clock read it, so the conversion is done here, on `Intl`
// alone. Consumed by the ledger screen's repair editors.

const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (f === undefined) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

// The zone's clock at an instant, seconds dropped: what the control shows for it.
export function instantToWall(at: Date, timeZone: string): string {
  const part: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(at)) part[p.type] = p.value;
  return `${part.year}-${part.month}-${part.day}T${part.hour}:${part.minute}`;
}

const asUtc = (wall: string): number | null => {
  const m = WALL.exec(wall);
  if (m === null) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  return Date.UTC(y, mo - 1, d, h, mi);
};

// The instant the zone's clock read `wall`. Null when it never did: a malformed string, a day
// that does not exist, or the hour a spring-forward change skips. When it read it twice — the
// hour a fall-back change repeats — the earlier instant. The zone's offset is read a day
// either side of the guess, which brackets any one change.
export function wallToInstant(wall: string, timeZone: string): Date | null {
  const guess = asUtc(wall);
  if (guess === null) return null;
  const DAY = 86_400_000;
  const found: number[] = [];
  for (const near of [guess - DAY, guess + DAY]) {
    const offset = asUtc(instantToWall(new Date(near), timeZone))! - near;
    const at = guess - offset;
    if (instantToWall(new Date(at), timeZone) === wall) found.push(at);
  }
  return found.length === 0 ? null : new Date(Math.min(...found));
}
