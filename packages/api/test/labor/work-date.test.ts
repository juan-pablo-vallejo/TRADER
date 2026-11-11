// work_date and durations across zones, midnight and daylight-saving changes, pure.
import { describe, expect, it } from "vitest";

import { deriveSessions, workDate } from "../../src/labor/work-date";
import { builder, HOUR } from "./events";

const NY = "America/New_York";
const utc = (iso: string) => new Date(`${iso}Z`);

// The local wall-clock hour in New York, to prove each DST case sits where the test says.
const nyHour = (d: Date) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: NY,
    hour: "numeric",
    hourCycle: "h23",
  }).format(d);

describe("workDate", () => {
  it("is the date in the company's zone, not UTC", () => {
    // 23:30 EDT on 5 October is already 6 October in UTC.
    expect(workDate(utc("2026-10-06T03:30:00"), NY)).toBe("2026-10-05");
    expect(workDate(utc("2026-10-06T03:30:00"), "UTC")).toBe("2026-10-06");
  });

  it("is exactly YYYY-MM-DD", () => {
    expect(workDate(utc("2026-01-02T15:00:00"), NY)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(workDate(utc("2026-01-02T15:00:00"), NY)).toBe("2026-01-02");
  });

  it("throws on an unknown zone", () => {
    expect(() => workDate(utc("2026-01-02T15:00:00"), "Not/AZone")).toThrow(RangeError);
  });
});

describe("deriveSessions", () => {
  it("gives a session crossing midnight wholly to its start date", () => {
    const ev = builder();
    // 22:00 EDT 5 October to 02:00 EDT 6 October.
    const [s] = deriveSessions(
      [
        ev("started", utc("2026-10-06T02:00:00")),
        ev("ended", utc("2026-10-06T06:00:00")),
      ],
      NY,
    );
    expect(s).toMatchObject({ workDate: "2026-10-05", workedMs: 4 * HOUR });
  });

  it("counts real hours across spring-forward", () => {
    // 2026-03-08: 01:59 EST is followed by 03:00 EDT.
    expect(nyHour(utc("2026-03-08T06:59:00"))).toBe("01");
    expect(nyHour(utc("2026-03-08T07:00:00"))).toBe("03");
    const ev = builder();
    // 22:00 EST 7 March to 06:00 EDT 8 March: eight hours on the wall, seven worked.
    const [s] = deriveSessions(
      [
        ev("started", utc("2026-03-08T03:00:00")),
        ev("ended", utc("2026-03-08T10:00:00")),
      ],
      NY,
    );
    expect(s).toMatchObject({ workDate: "2026-03-07", workedMs: 7 * HOUR });
  });

  it("counts real hours across fall-back", () => {
    // 2026-11-01: 01:59 EDT is followed by 01:00 EST.
    expect(nyHour(utc("2026-11-01T05:59:00"))).toBe("01");
    expect(nyHour(utc("2026-11-01T06:00:00"))).toBe("01");
    const ev = builder();
    // 00:30 EDT to 06:30 EST on 1 November: six hours on the wall, seven worked.
    const [s] = deriveSessions(
      [
        ev("started", utc("2026-11-01T04:30:00")),
        ev("ended", utc("2026-11-01T11:30:00")),
      ],
      NY,
    );
    expect(s).toMatchObject({ workDate: "2026-11-01", workedMs: 7 * HOUR });
  });

  it("dates a session starting just before midnight on the fall-back night by its start", () => {
    const ev = builder();
    // 23:30 EDT 31 October to 01:30 EST 1 November: three hours.
    const [s] = deriveSessions(
      [
        ev("started", utc("2026-11-01T03:30:00")),
        ev("ended", utc("2026-11-01T06:30:00")),
      ],
      NY,
    );
    expect(s).toMatchObject({ workDate: "2026-10-31", workedMs: 3 * HOUR });
  });

  it("dates a skewed start by its receipt", () => {
    const ev = builder();
    // The phone says 23:00 EDT on 4 October; the server received it at 09:00 EDT on 5 October.
    const start = ev("started", utc("2026-10-05T03:00:00"), {
      server: utc("2026-10-05T13:00:00"),
      skewed: true,
    });
    const [s] = deriveSessions([start, ev("ended", utc("2026-10-05T21:00:00"))], NY);
    expect(s).toMatchObject({ workDate: "2026-10-05", workedMs: 8 * HOUR });
  });

  it("dates every session of a day independently", () => {
    const ev = builder();
    const sessions = deriveSessions(
      [
        ev("started", utc("2026-10-05T12:00:00")),
        ev("ended", utc("2026-10-05T16:00:00")),
        ev("started", utc("2026-10-06T02:00:00")),
        ev("ended", utc("2026-10-06T05:00:00")),
      ],
      NY,
    );
    expect(sessions.map((s) => s.workDate)).toEqual(["2026-10-05", "2026-10-05"]);
  });
});
