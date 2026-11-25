// Calendar days and a zone's wall clock: the one home of every rule about them, for the server,
// the office and the phone. A day is "YYYY-MM-DD"; a minute is "HH:MM" on a 24-hour clock.
// Day arithmetic is done in UTC on the date alone, so no zone or clock change can move it;
// a zone is read through the platform's own rules, never a fixed offset, which is wrong on
// either side of a daylight-saving change. Parts are read by type, so no locale's format can
// change the shape. Pure. Part of the client-safe contract.

const DAY_MS = 86_400_000;
const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
const WALL_SHAPE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const utcOf = (day: string) =>
  Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
const dayOfUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// A real calendar day: "2026-13-40" has the shape and is no day.
export function isDay(value: string): boolean {
  if (!DAY_SHAPE.test(value)) return false;
  const ms = utcOf(value);
  return !Number.isNaN(ms) && dayOfUtc(ms) === value;
}

// The day `n` calendar days after `day` (before it when `n` is negative).
export const addDays = (day: string, n: number): string =>
  dayOfUtc(utcOf(day) + n * DAY_MS);

// How many days `to` is after `from`.
export const daysBetween = (from: string, to: string): number =>
  Math.round((utcOf(to) - utcOf(from)) / DAY_MS);

// 0 for Sunday through 6 for Saturday.
export const weekdayOf = (day: string): number => new Date(utcOf(day)).getUTCDay();

export const isMonday = (day: string): boolean => weekdayOf(day) === 1;

// The Monday of the week `day` is in: a week runs Monday to Sunday.
export const mondayOf = (day: string): string =>
  addDays(day, -((weekdayOf(day) + 6) % 7));

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (f === undefined) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      calendar: "gregory",
      numberingSystem: "latn",
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

// An instant as a day and a minute on a zone's wall clock. An unknown zone throws RangeError.
export function wallClock(
  instant: Date,
  timeZone: string,
): { day: string; minute: string } {
  const part: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(instant)) part[p.type] = p.value;
  for (const type of ["year", "month", "day", "hour", "minute"])
    if (part[type] === undefined) throw new Error(`no ${type} in the formatted time`);
  return {
    day: `${part.year!.padStart(4, "0")}-${part.month}-${part.day}`,
    minute: `${part.hour!.padStart(2, "0")}:${part.minute}`,
  };
}

// The calendar day of an instant in a zone: a work date.
export const dayIn = (instant: Date, timeZone: string): string =>
  wallClock(instant, timeZone).day;

// The minute of an instant on a zone's wall clock.
export const minuteIn = (instant: Date, timeZone: string): string =>
  wallClock(instant, timeZone).minute;

const asUtc = (day: string, minute: string) =>
  utcOf(day) + (+minute.slice(0, 2) * 60 + +minute.slice(3, 5)) * 60_000;

// The instant a zone's clock read `minute` on `day`. Null when it never did: the hour a
// spring-forward change skips. When it read it twice, in the hour a fall-back change
// repeats, the earlier instant. The zone's offset is read a day either side of the guess,
// which brackets any one change.
export function instantAt(day: string, minute: string, timeZone: string): Date | null {
  const guess = asUtc(day, minute);
  const found: number[] = [];
  for (const near of [guess - DAY_MS, guess + DAY_MS]) {
    const seen = wallClock(new Date(near), timeZone);
    const at = guess - (asUtc(seen.day, seen.minute) - near);
    const back = wallClock(new Date(at), timeZone);
    if (back.day === day && back.minute === minute) found.push(at);
  }
  return found.length === 0 ? null : new Date(Math.min(...found));
}

// The same, never null: a minute the clock skipped lands that many minutes after the change,
// as a clock set forward reads it. For a time a person did not type (a reminder, the demo).
export function instantNear(day: string, minute: string, timeZone: string): Date {
  const exact = instantAt(day, minute, timeZone);
  if (exact !== null) return exact;
  const before = asUtc(day, minute) - DAY_MS;
  const seen = wallClock(new Date(before), timeZone);
  return new Date(asUtc(day, minute) - (asUtc(seen.day, seen.minute) - before));
}

// "YYYY-MM-DDTHH:MM", what a `datetime-local` control reads and writes, and back.
export const instantToWall = (at: Date, timeZone: string): string => {
  const { day, minute } = wallClock(at, timeZone);
  return `${day}T${minute}`;
};
export function wallToInstant(wall: string, timeZone: string): Date | null {
  const m = WALL_SHAPE.exec(wall);
  if (m === null) return null;
  const day = `${m[1]}-${m[2]}-${m[3]}`;
  const minute = `${m[4]}:${m[5]}`;
  if (!isDay(day) || +m[4]! > 23 || +m[5]! > 59) return null;
  return instantAt(day, minute, timeZone);
}
