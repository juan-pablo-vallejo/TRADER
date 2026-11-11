// TASKS:45: roster.setPayRate and roster.payRates — effective-dated, insert-only: a second rate
// for the same day is `rate_exists` and the history never changes; the rate in force is the
// newest on or before today in the company's zone; admin only.
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  appCaller,
  appDb,
  member,
  outcome,
  ownerDb,
  world,
  type World,
} from "../helpers";

const owner = ownerDb();
const app = appDb();
let w: World;

beforeEach(async () => {
  w = await world(owner);
});
afterEach(async () => {
  await w.cleanup();
});
afterAll(async () => {
  await app.$client.end();
  await owner.$client.end();
});

const roster = (who: unknown) => appCaller(app, who).roster;

// Today and tomorrow as work dates in the fixture company's zone (world: America/New_York).
const dayInNewYork = (offsetDays: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );

describe("roster.setPayRate and roster.payRates", () => {
  it("adds rates, defaults to USD, and the newest on or before today is in force", async () => {
    const admin = await member(owner, w, "a", "admin");
    const r = roster(admin.who);
    const first = await r.setPayRate({
      userId: w.a.boundId,
      effectiveFrom: "2020-01-01",
      hourlyRateCents: 2500,
    });
    expect(first).toMatchObject({
      result: "added",
      rate: { effectiveFrom: "2020-01-01", hourlyRateCents: 2500, currency: "USD" },
    });
    await r.setPayRate({
      userId: w.a.boundId,
      effectiveFrom: "2021-06-15",
      hourlyRateCents: 2800,
    });
    const today = dayInNewYork(0);
    await r.setPayRate({
      userId: w.a.boundId,
      effectiveFrom: today,
      hourlyRateCents: 3000,
    });
    await r.setPayRate({
      userId: w.a.boundId,
      effectiveFrom: dayInNewYork(1),
      hourlyRateCents: 9900,
    });
    const rows = await r.list();
    expect(rows.find((u) => u.id === w.a.boundId)?.currentRate).toMatchObject({
      effectiveFrom: today,
      hourlyRateCents: 3000,
      currency: "USD",
    });
    expect(rows.find((u) => u.id === w.a.inviteId)?.currentRate).toBeNull();
    expect(
      (await r.payRates({ userId: w.a.boundId })).map((x) => x.hourlyRateCents),
    ).toEqual([9900, 3000, 2800, 2500]);
  });

  it("never edits history: a second rate for the same day is rate_exists", async () => {
    const admin = await member(owner, w, "a", "admin");
    const r = roster(admin.who);
    const added = await r.setPayRate({
      userId: w.a.boundId,
      effectiveFrom: "2022-03-01",
      hourlyRateCents: 2000,
    });
    if (added.result !== "added") throw new Error("unreachable");
    expect(
      await r.setPayRate({
        userId: w.a.boundId,
        effectiveFrom: "2022-03-01",
        hourlyRateCents: 2100,
      }),
    ).toEqual({ result: "rejected", code: "rate_exists", standing: added.rate });
    const dates = ["2022-04-01", "2022-05-01", "2022-06-01"];
    for (const effectiveFrom of dates) {
      await r.setPayRate({ userId: w.a.boundId, effectiveFrom, hourlyRateCents: 2200 });
    }
    const history = await r.payRates({ userId: w.a.boundId });
    expect(history).toHaveLength(4);
    expect(history.find((x) => x.effectiveFrom === "2022-03-01")).toEqual(added.rate);
  });

  it("refuses a bad currency, a negative rate, a non-integer or a bad date", async () => {
    const admin = await member(owner, w, "a", "admin");
    for (const input of [
      { effectiveFrom: "2022-01-01", hourlyRateCents: 100, currency: "usd" },
      { effectiveFrom: "2022-01-01", hourlyRateCents: -1 },
      { effectiveFrom: "2022-01-01", hourlyRateCents: 10.5 },
      { effectiveFrom: "2022-13-01", hourlyRateCents: 100 },
      { effectiveFrom: "2022-01-01T00:00:00Z", hourlyRateCents: 100 },
    ]) {
      expect(
        await outcome(roster(admin.who).setPayRate({ userId: w.a.boundId, ...input })),
      ).toBe("BAD_REQUEST");
    }
  });

  it("prices a deactivated user, refuses a missing or foreign one, and is admin only", async () => {
    const admin = await member(owner, w, "a", "admin");
    const off = await member(owner, w, "a", "worker", { deactivated: true });
    expect(
      await roster(admin.who).setPayRate({
        userId: off.id,
        effectiveFrom: "2022-01-01",
        hourlyRateCents: 1,
      }),
    ).toMatchObject({ result: "added" });
    for (const userId of [w.b.boundId, crypto.randomUUID()]) {
      expect(
        await outcome(
          roster(admin.who).setPayRate({
            userId,
            effectiveFrom: "2022-01-01",
            hourlyRateCents: 1,
          }),
        ),
      ).toBe("FORBIDDEN");
      expect(await outcome(roster(admin.who).payRates({ userId }))).toBe("FORBIDDEN");
    }
    const worker = await member(owner, w, "a", "worker");
    expect(
      await outcome(
        roster(worker.who).setPayRate({
          userId: worker.id,
          effectiveFrom: "2022-01-01",
          hourlyRateCents: 1,
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(await outcome(roster(worker.who).payRates({ userId: worker.id }))).toBe(
      "FORBIDDEN",
    );
    expect(await outcome(roster(null).payRates({ userId: worker.id }))).toBe(
      "UNAUTHORIZED",
    );
  });
});
