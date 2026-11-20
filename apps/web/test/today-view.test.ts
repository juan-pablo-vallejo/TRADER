// The office's Today: which rows need attention and in what order, and who stands under
// which heading. A status is the shared function's; this holds the layout.
import { describe, expect, it } from "vitest";

import {
  attention,
  ATTENTION_ROWS,
  bands,
  fixHref,
  nextShift,
  type Person,
  type Today,
} from "../src/app/(office)/today/today-view";

const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const J = id(901);
const K = id(902);
const off = { status: "off" } as const;
const person = (
  n: number,
  name: string,
  shifts: [string, string, boolean][],
  clock: Person["clock"] = off,
): Person => ({
  person: {
    id: id(n),
    name,
    phone: n % 2 === 0 ? null : `+1401555${String(n).padStart(4, "0")}`,
  },
  shifts: shifts.map(([jobId, start, clockedIn], i) => ({
    id: id(n * 10 + i),
    jobId,
    start,
    end: "15:30",
    clockedIn,
  })),
  clock,
  workedMs: 0,
  workedJobIds: [],
});
const on = (
  jobId: string,
  status: "working" | "paused" = "working",
): Person["clock"] => ({
  status,
  jobId,
  since: new Date("2026-11-16T12:00:00Z"),
  sinceDay: "2026-11-16",
});
const today = (people: Person[], earlier: Today["earlier"] = []): Today => ({
  timezone: "America/New_York",
  today: "2026-11-16",
  asOf: new Date("2026-11-16T14:00:00Z"),
  people,
  earlier,
  jobs: [],
  money: { owed: [], overdue: [], drafts: 0, completeJobsNotInvoiced: 0 },
});
const left = (n: number, name: string, sinceDay: string): Today["earlier"][number] => ({
  person: { id: id(n), name, phone: null },
  jobId: K,
  since: new Date(`${sinceDay}T21:00:00Z`),
  sinceDay,
  state: "working",
});

describe("what needs attention", () => {
  it("is open sessions first, oldest first, then the late by how long ago", () => {
    const rows = attention(
      today(
        [
          person(1, "Late since nine", [[J, "09:00", false]]),
          person(2, "Late since seven", [[J, "07:00", false]]),
          person(3, "Working", [[J, "07:00", true]], on(J)),
          person(4, "Expected", [[J, "13:00", false]]),
          person(5, "Done", [[J, "07:00", true]]),
        ],
        [left(6, "Forgot Friday", "2026-11-13"), left(7, "Forgot Sunday", "2026-11-15")],
      ),
      "10:00",
    );
    expect(rows.map((r) => [r.kind, r.person.name])).toEqual([
      ["open", "Forgot Friday"],
      ["open", "Forgot Sunday"],
      ["late", "Late since seven"],
      ["late", "Late since nine"],
    ]);
    // The late row names the shift they are late for.
    expect(rows[2]).toMatchObject({ jobId: J, start: "07:00" });
  });

  it("admits nobody without an action: on the clock, expected and done are not here", () => {
    expect(
      attention(
        today([
          person(1, "Working", [[J, "07:00", false]], on(J)),
          person(2, "Expected", [[J, "10:10", false]]),
          person(3, "Done", [[J, "07:00", true]]),
        ]),
        "10:00",
      ),
    ).toEqual([]);
  });

  it("becomes late on the minute, with no new answer from the server", () => {
    const day = today([person(1, "Ana", [[J, "07:00", false]])]);
    expect(attention(day, "07:14")).toEqual([]);
    expect(attention(day, "07:15").map((r) => r.kind)).toEqual(["late"]);
  });

  it("sends Fix to Hours on the day the session was left open, with its panel", () => {
    const [row] = attention(today([], [left(6, "Forgot", "2026-11-13")]), "10:00");
    if (row?.kind !== "open") throw new Error("an open session is the row");
    expect(fixHref(row)).toBe(
      `/hours?range=dates&from=2026-11-13&to=2026-11-13&who=${id(6)}&day=2026-11-13`,
    );
  });

  it("shows ten rows at most", () => {
    expect(ATTENTION_ROWS).toBe(10);
    const many = Array.from({ length: 14 }, (_, n) =>
      person(n + 1, `Late ${n}`, [[J, "07:00", false]]),
    );
    expect(attention(today(many), "10:00")).toHaveLength(14);
  });
});

describe("who stands under which heading", () => {
  it("puts working and on a break together, then expected, then done; the late in none", () => {
    const sorted = bands(
      today([
        person(1, "Working", [[J, "07:00", true]], on(J)),
        person(2, "On a break", [[J, "07:00", true]], on(J, "paused")),
        person(3, "Expected", [[K, "13:00", false]]),
        person(4, "Late", [[J, "07:00", false]]),
        person(5, "Done", [[J, "07:00", true]]),
      ]),
      "10:00",
    );
    expect(sorted.working.map((p) => p.person.name)).toEqual(["Working", "On a break"]);
    expect(sorted.expected.map((p) => p.person.name)).toEqual(["Expected"]);
    expect(sorted.done.map((p) => p.person.name)).toEqual(["Done"]);
  });

  it("names the shift an expected person is expected on: the earliest still waiting", () => {
    expect(
      nextShift(
        person(1, "Ana", [
          [J, "13:00", false],
          [K, "07:00", true],
          [K, "11:00", false],
        ]),
      ),
    ).toMatchObject({ jobId: K, start: "11:00" });
    expect(nextShift(person(1, "Ana", [[J, "07:00", true]]))).toBeNull();
  });
});
