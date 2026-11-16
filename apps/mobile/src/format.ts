// How the crew app writes a time, a length of time and an age. Times are the company's wall
// clock, whatever zone the phone is in: it is the clock the schedule is written on.
import type { Catalog } from "./i18n/catalog";

export function timeOfDay(instant: Date, timeZone: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
}

// A schedule's `HH:MM`, written as that language writes a time of day.
export function wallTime(wall: string, language: string): string {
  const at = new Date(
    Date.UTC(2000, 0, 1, Number(wall.slice(0, 2)), Number(wall.slice(3, 5))),
  );
  return timeOfDay(at, "UTC", language);
}

// A calendar day, `YYYY-MM-DD`, as a weekday and a date.
export function dayName(day: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    timeZone: "UTC",
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date(`${day}T12:00:00Z`));
}

// Hours and minutes, rounded down to the minute: `7 h 05 min`.
export function duration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60_000));
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, "0")} min`;
}

export function age(ms: number, t: Catalog["age"]): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return t.justNow;
  if (minutes < 60) return t.minutes(minutes);
  if (minutes < 48 * 60) return t.hours(Math.floor(minutes / 60));
  return t.days(Math.floor(minutes / (24 * 60)));
}
