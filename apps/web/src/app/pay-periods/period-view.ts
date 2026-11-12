// What the pay-periods screen works out from `payPeriod.list`'s answer (PRD, Labor: the
// office closes a pay period; DESIGN, Pay-period close). Pure, and never a rule of its own:
// which dates a new period may take, and whether a period may close, are the server's
// (pay-periods/periods.ts, close.ts) — this module only says in advance what the server will
// answer, so the form is prefilled and a button that would be refused is a sentence instead.
// Consumed by pay-periods-screen.tsx.
import type { AppRouter } from "@trader/api";
import type { inferRouterOutputs } from "@trpc/server";

import { addDays } from "../format";

export type Calendar = inferRouterOutputs<AppRouter>["payPeriod"]["list"];
export type Period = Calendar["periods"][number];

// The longest period the server opens (labor/ledger.ts).
export const MAX_PERIOD_DAYS = 31;

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;

// Forward, and at most the bound.
export function boundsOk(startsOn: string, endsOn: string): boolean {
  const days = dayNumber(endsOn) - dayNumber(startsOn);
  return days >= 0 && days < MAX_PERIOD_DAYS;
}

// The latest period, the one a new period follows: `periods` is newest first.
export const latestOf = (calendar: Calendar): Period | undefined => calendar.periods[0];

// The dates a new period starts with in the form: the day after the latest ends, for as many
// days as the latest ran. `fixedStart` when the server will accept no other start. With no
// period yet, nothing is assumed.
export function nextBounds(calendar: Calendar): {
  startsOn: string;
  endsOn: string;
  fixedStart: boolean;
} {
  const latest = latestOf(calendar);
  if (latest === undefined) return { startsOn: "", endsOn: "", fixedStart: false };
  const startsOn = addDays(latest.endsOn, 1);
  const length = dayNumber(latest.endsOn) - dayNumber(latest.startsOn);
  return { startsOn, endsOn: addDays(startsOn, length), fixedStart: true };
}

// The earliest period still open: the next to close, and the one that carries adjustments.
export const nextToClose = (calendar: Calendar): Period | undefined =>
  [...calendar.periods].reverse().find((p) => p.closed === null);

export type CloseState =
  | { state: "closed" }
  | { state: "ready" }
  // Periods close in order: `first` is the one to close before this.
  | { state: "earlier_open"; first: Period }
  // Its last day is today or later in the company's zone.
  | { state: "not_ended" };

export function closeState(period: Period, calendar: Calendar): CloseState {
  if (period.closed !== null) return { state: "closed" };
  const first = nextToClose(calendar);
  if (first !== undefined && first.id !== period.id) {
    return { state: "earlier_open", first };
  }
  if (period.endsOn >= calendar.today) return { state: "not_ended" };
  return { state: "ready" };
}

// Which of an open period's dates the office may change: none unless it is the latest; the
// start only when no period precedes it.
export function editable(
  period: Period,
  calendar: Calendar,
): { start: boolean; end: boolean } {
  const latest = latestOf(calendar);
  if (period.closed !== null || latest?.id !== period.id) {
    return { start: false, end: false };
  }
  return { start: calendar.periods.length === 1, end: true };
}
