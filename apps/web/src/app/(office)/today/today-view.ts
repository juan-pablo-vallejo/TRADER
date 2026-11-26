// How the office's Today lays out `overview.today`'s answer. Pure, and no rule of its own:
// a person's status is the shared function's (`@trader/api/contract`, crewStatus), the same
// one the phone's Crew tab names it with. This module only sorts people into the screen's
// bands and its attention rows.
import type { AppRouter } from "@trader/api";
import {
  attention as sharedAttention,
  crewStatus,
  type Attention,
} from "@trader/api/contract";
import type { inferRouterOutputs } from "@trpc/server";

export type Today = inferRouterOutputs<AppRouter>["overview"]["today"];
export type Person = Today["people"][number];

// The most rows the attention band shows before it says how many more there are.
export const ATTENTION_ROWS = 10;

// Minutes since midnight of an HH:MM wall-clock time: HH:MM text order is time order too.
const minutes = (wall: string) =>
  Number(wall.slice(0, 2)) * 60 + Number(wall.slice(3, 5));

// What needs attention: the shared rule (contract/crew.ts), the phone's admin Today's too.
export const attention = (today: Today, minute: string) => sharedAttention(today, minute);

type Bands = {
  // On the clock or on a break, in the server's order (by name).
  working: Person[];
  expected: Person[];
  done: Person[];
};

// Everyone of today under the heading their status puts them. The late are in the
// attention band above and in no band here.
export function bands(today: Today, minute: string): Bands {
  const of = (...statuses: ReturnType<typeof crewStatus>[]) =>
    today.people.filter((p) => statuses.includes(crewStatus(p, minute)));
  return { working: of("working", "break"), expected: of("expected"), done: of("done") };
}

// The shift an expected person is expected on: the earliest nobody clocked in on.
export function nextShift(person: Person): Person["shifts"][number] | null {
  return (
    person.shifts
      .filter((s) => !s.clockedIn)
      .sort((a, b) => minutes(a.start) - minutes(b.start))[0] ?? null
  );
}

// Where Fix goes: Hours on the day the session was left open, with that person's day
// panel open on it.
export const fixHref = (
  row: Extract<Attention<Person["person"]>, { kind: "open" }>,
): string =>
  `/hours?range=dates&from=${row.sinceDay}&to=${row.sinceDay}&who=${row.person.id}&day=${row.sinceDay}`;
