// Display formatting for the office: money from integer cents through
// the locale formatter; dates as calendar days. A work date is a YYYY-MM-DD string and is
// rendered from its parts: `new Date(iso)` would read it as UTC midnight, which is the day
// before in Eastern. An instant is shown in the zone the server names, never the browser's.
// Dates and money follow the person's language: `formatters` binds them to it, and a
// screen reads them from `useStrings().f`. What does not depend on a language (digits to
// cents, hundredths to hours, a phone number) is a plain function here.
import type { Catalog } from "./i18n/en";
import { localeOf, type Language } from "./i18n/language";

// A sign-in number as the server stores it, +1 and ten digits, shown as it is said aloud:
// "(401) 555-0100". Anything else is shown as it is.
export function signInPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m === null ? e164 : `(${m[1]}) ${m[2]}-${m[3]}`;
}

// Whether what was typed can be a sign-in number, so the form can say so before it asks:
// ten digits, or eleven starting with 1, however spaced. The server decides (roster.invite).
export function looksLikeSignInPhone(typed: string): boolean {
  if (typed.trim().startsWith("+") && !typed.trim().startsWith("+1")) return false;
  return /^1?[2-9]\d{9}$/.test(typed.replace(/\D/g, ""));
}

export function formatters(language: Language, t: Catalog) {
  const locale = localeOf(language);
  // Days and times are written in plain `es`, the vocabulary's Spanish ("lun, 16 nov",
  // "2:30 p. m."), which es-US does not write; money keeps es-US. A time of day reads on a
  // 12-hour clock in both languages, its parts kept on one line.
  const timeLocale = language === "es" ? "es" : locale;
  const timeOfDay = { hour: "numeric", minute: "2-digit", hourCycle: "h12" } as const;
  const whole = (time: string) => time.replace(/ /g, "\u00a0");
  // Anything but a whole `HH:MM` (a field still being typed) is shown as it is.
  const wall = (hhmm: string): string =>
    !/^\d{2}:\d{2}$/.test(hhmm)
      ? hhmm
      : whole(
          new Intl.DateTimeFormat(timeLocale, { ...timeOfDay, timeZone: "UTC" }).format(
            new Date(
              Date.UTC(2000, 0, 1, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5))),
            ),
          ),
        );
  return {
    money(cents: number, currency: string): string {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
      }).format(cents / 100);
    },

    day(iso: string): string {
      const [y, m, d] = iso.split("-").map(Number);
      if (y === undefined || m === undefined || d === undefined) return iso;
      return new Intl.DateTimeFormat(timeLocale, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(new Date(y, m - 1, d));
    },

    // The calendar day of an instant, as this browser's clock reads it: the day an
    // invoice was issued.
    dayOf(at: Date): string {
      return new Intl.DateTimeFormat(timeLocale, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(at);
    },

    // A work date with its weekday, as a plan is read: "Mon, Nov 16". From its parts.
    weekDay(iso: string): string {
      const [y, m, d] = iso.split("-").map(Number);
      if (y === undefined || m === undefined || d === undefined) return iso;
      return new Intl.DateTimeFormat(timeLocale, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(new Date(y, m - 1, d));
    },

    // A work date as a column of a week is headed: "Mon 16". From its parts.
    weekColumn(iso: string): string {
      const [y, m, d] = iso.split("-").map(Number);
      if (y === undefined || m === undefined || d === undefined) return iso;
      const weekday = new Intl.DateTimeFormat(timeLocale, { weekday: "short" }).format(
        new Date(y, m - 1, d),
      );
      return `${weekday.replace(/\.$/, "")} ${d}`;
    },

    // An instant with its day, in a named zone: an entry is often received or corrected
    // on a later day than the one it is about.
    stamp(at: Date, timeZone: string): string {
      return whole(
        new Intl.DateTimeFormat(timeLocale, {
          month: "short",
          day: "numeric",
          ...timeOfDay,
          timeZone,
        }).format(at),
      );
    },

    // The time of day alone, in a named zone, where the day is already said beside it.
    clock(at: Date, timeZone: string): string {
      return whole(
        new Intl.DateTimeFormat(timeLocale, { ...timeOfDay, timeZone }).format(at),
      );
    },

    // A schedule's wall-clock `HH:MM`, a shift's start or end, as a time of day.
    wall,

    // A shift's hours, start to end: "7:00 AM–3:30 PM".
    span(start: string, end: string): string {
      return `${wall(start)}–${wall(end)}`;
    },

    // Whole minutes from integer milliseconds, rounded down: a display, not the hours
    // figure pay is built from.
    duration(ms: number): string {
      const minutes = Math.floor(ms / 60_000);
      return t.duration(Math.floor(minutes / 60), minutes % 60);
    },
  };
}

export type Formatters = ReturnType<typeof formatters>;

// A calendar day `days` after `iso`, by calendar arithmetic in UTC so no zone or clock change
// can move it.
export function addDays(iso: string, days: number): string {
  const at = new Date(`${iso}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
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
