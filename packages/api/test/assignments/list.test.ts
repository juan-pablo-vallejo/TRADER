// TASKS, dated worker-job assignments (V1-D07): assignment.list — the office's read over an
// inclusive range of days as written, with its filters — and assignment.mine — the caller's
// own plans and nothing of anyone else's. Rolled-back transactions throughout. The clock-in
// flag against a real push is authority.test.ts's.
import { jobAssignments, jobs } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { Tx } from "../../src/core/context";
import {
  appCallerIn,
  becomeApp,
  boundIn,
  crewDayIn,
  outcome,
  ownerDb,
  rolledBack,
} from "../helpers";

const owner = ownerDb();
afterAll(async () => {
  await owner.$client.end();
});

const HOURS = { expectedStart: "07:00", expectedEnd: "15:30" };

// Two companies' crew days, a bound admin and two bound workers in the first, a bound worker
// in the second. `put` writes a plan as the owner, before the transaction becomes trader_app.
async function office(tx: Tx) {
  const day = await crewDayIn(tx);
  const other = await crewDayIn(tx);
  const admin = await boundIn(tx, day.companyId, "admin");
  const ana = await boundIn(tx, day.companyId, "worker");
  const ben = await boundIn(tx, day.companyId, "worker");
  const stranger = await boundIn(tx, other.companyId, "worker");
  await tx
    .update(jobs)
    .set({ address: "12 Hope St, Providence" })
    .where(eq(jobs.id, day.J));
  const put = (
    companyId: string,
    userId: string,
    jobId: string,
    workDate: string,
    hours = HOURS,
  ) => tx.insert(jobAssignments).values({ companyId, userId, jobId, workDate, ...hours });
  return { day, other, admin, ana, ben, stranger, put };
}

describe("assignment.list", () => {
  it("returns the range's plans in day, start and name order, times to the minute", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, admin, ana, ben, put } = await office(tx);
      const c = day.companyId;
      await put(c, ben.id, day.J, "2026-11-17");
      await put(c, ana.id, day.J, "2026-11-17", {
        expectedStart: "12:00",
        expectedEnd: "16:00",
      });
      await put(c, ana.id, day.K, "2026-11-17", {
        expectedStart: "06:30",
        expectedEnd: "11:45",
      });
      await put(c, ana.id, day.J, "2026-11-16");
      await becomeApp(tx);
      const rows = await appCallerIn(tx, admin.who).assignment.list({
        from: "2026-11-16",
        to: "2026-11-22",
      });
      expect(
        rows.map((r) => [
          r.workDate,
          r.expectedStart,
          r.expectedEnd,
          r.worker.id,
          r.job.name,
        ]),
      ).toEqual([
        ["2026-11-16", "07:00", "15:30", ana.id, "J"],
        ["2026-11-17", "06:30", "11:45", ana.id, "K"],
        ["2026-11-17", "07:00", "15:30", ben.id, "J"],
        ["2026-11-17", "12:00", "16:00", ana.id, "J"],
      ]);
      expect(rows[0]).toMatchObject({
        worker: { id: ana.id, active: true },
        job: { id: day.J, name: "J", status: "open" },
      });
    });
  });

  it("takes both ends of the range as whole days, across a clock change and a leap day", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, admin, ana, put } = await office(tx);
      // New York leaves daylight time on 2026-11-01 and enters it on 2027-03-14: a plan on
      // such a day is on that day, at the time written, whatever the wall clock did.
      for (const date of [
        "2026-10-31",
        "2026-11-01",
        "2026-11-02",
        "2027-03-14",
        "2028-02-29",
      ]) {
        await put(day.companyId, ana.id, day.J, date, {
          expectedStart: "01:30",
          expectedEnd: "02:30",
        });
      }
      await becomeApp(tx);
      const list = appCallerIn(tx, admin.who).assignment.list;
      const days = async (from: string, to: string) =>
        (await list({ from, to })).map((r) => r.workDate);
      expect(await days("2026-11-01", "2026-11-01")).toEqual(["2026-11-01"]);
      expect(await days("2026-10-31", "2026-11-02")).toEqual([
        "2026-10-31",
        "2026-11-01",
        "2026-11-02",
      ]);
      expect(await days("2026-11-02", "2026-11-30")).toEqual(["2026-11-02"]);
      expect(await days("2027-03-14", "2027-03-14")).toEqual(["2027-03-14"]);
      expect(await days("2028-02-29", "2028-03-01")).toEqual(["2028-02-29"]);
      const [spring] = await list({ from: "2027-03-14", to: "2027-03-14" });
      expect(spring).toMatchObject({ expectedStart: "01:30", expectedEnd: "02:30" });
    });
  });

  it("filters by person and by job", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, admin, ana, ben, put } = await office(tx);
      const c = day.companyId;
      await put(c, ana.id, day.J, "2026-11-16");
      await put(c, ana.id, day.K, "2026-11-17");
      await put(c, ben.id, day.J, "2026-11-16");
      await becomeApp(tx);
      const list = appCallerIn(tx, admin.who).assignment.list;
      const week = { from: "2026-11-16", to: "2026-11-22" };
      expect(await list({ ...week, userId: ana.id })).toHaveLength(2);
      expect(await list({ ...week, jobId: day.J })).toHaveLength(2);
      expect(await list({ ...week, userId: ana.id, jobId: day.J })).toHaveLength(1);
      expect(await list({ ...week, userId: day.w1 })).toEqual([]);
    });
  });

  it("refuses a range that runs backwards or past 31 days, and a malformed day", async () => {
    await rolledBack(owner, async (tx) => {
      const { admin } = await office(tx);
      await becomeApp(tx);
      const list = appCallerIn(tx, admin.who).assignment.list;
      expect(await list({ from: "2026-12-01", to: "2026-12-31" })).toEqual([]);
      for (const bad of [
        { from: "2026-12-01", to: "2027-01-01" },
        { from: "2026-11-17", to: "2026-11-16" },
        { from: "2026-11-16", to: "2026-11-31" },
        { from: "16/11/2026", to: "2026-11-17" },
      ]) {
        expect([bad, await outcome(list(bad))]).toEqual([bad, "BAD_REQUEST"]);
      }
    });
  });

  it("shows nothing of another company and answers FORBIDDEN for its person or job", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, other, admin, ana, put } = await office(tx);
      await put(day.companyId, ana.id, day.J, "2026-11-16");
      await put(other.companyId, other.w1, other.J, "2026-11-16");
      await becomeApp(tx);
      const list = appCallerIn(tx, admin.who).assignment.list;
      const week = { from: "2026-11-16", to: "2026-11-22" };
      expect((await list(week)).map((r) => r.worker.id)).toEqual([ana.id]);
      for (const filter of [
        { userId: other.w1 },
        { jobId: other.J },
        { userId: crypto.randomUUID() },
        { jobId: crypto.randomUUID() },
      ]) {
        expect([filter, await outcome(list({ ...week, ...filter }))]).toEqual([
          filter,
          "FORBIDDEN",
        ]);
      }
    });
  });

  it("is the office's alone: a worker and a foreman are FORBIDDEN", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, ana } = await office(tx);
      await becomeApp(tx);
      const week = { from: "2026-11-16", to: "2026-11-22" };
      for (const who of [ana.who, day.who]) {
        expect(await outcome(appCallerIn(tx, who).assignment.list(week))).toBe(
          "FORBIDDEN",
        );
      }
      expect(await outcome(appCallerIn(tx, null).assignment.list(week))).toBe(
        "UNAUTHORIZED",
      );
    });
  });
});

describe("assignment.mine", () => {
  it("gives a worker their own plans and nobody else's, with the job's name and address only", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, other, ana, ben, stranger, put } = await office(tx);
      const c = day.companyId;
      await put(c, ana.id, day.J, "2026-11-16");
      await put(c, ana.id, day.K, "2026-11-17");
      // The same days, the same job: another worker's, and another company's.
      await put(c, ben.id, day.J, "2026-11-16");
      await put(other.companyId, stranger.id, other.J, "2026-11-16");
      await becomeApp(tx);
      const week = { from: "2026-11-16", to: "2026-11-22" };
      const rows = await appCallerIn(tx, ana.who).assignment.mine(week);
      expect(rows).toEqual([
        {
          id: expect.any(String),
          workDate: "2026-11-16",
          expectedStart: "07:00",
          expectedEnd: "15:30",
          job: { id: day.J, name: "J", address: "12 Hope St, Providence" },
        },
        {
          id: expect.any(String),
          workDate: "2026-11-17",
          expectedStart: "07:00",
          expectedEnd: "15:30",
          job: { id: day.K, name: "K", address: null },
        },
      ]);
      expect(await appCallerIn(tx, ben.who).assignment.mine(week)).toHaveLength(1);
      expect(await appCallerIn(tx, stranger.who).assignment.mine(week)).toHaveLength(1);
      // Nobody planned: nothing, whoever else is.
      expect(await appCallerIn(tx, day.who).assignment.mine(week)).toEqual([]);
    });
  });

  it("takes no person: naming one is BAD_REQUEST, and an admin too sees only their own", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, admin, ana, put } = await office(tx);
      await put(day.companyId, ana.id, day.J, "2026-11-16");
      await put(day.companyId, admin.id, day.K, "2026-11-16");
      await becomeApp(tx);
      const week = { from: "2026-11-16", to: "2026-11-22" };
      const mine = appCallerIn(tx, admin.who).assignment.mine;
      expect((await mine(week)).map((r) => r.job.id)).toEqual([day.K]);
      expect(
        await outcome(
          (mine as (input: unknown) => Promise<unknown>)({ ...week, userId: ana.id }),
        ),
      ).toBe("BAD_REQUEST");
      expect(await outcome(appCallerIn(tx, null).assignment.mine(week))).toBe(
        "UNAUTHORIZED",
      );
      expect(
        await outcome(
          appCallerIn(tx, ana.who).assignment.mine({
            from: "2026-11-01",
            to: "2026-12-15",
          }),
        ),
      ).toBe("BAD_REQUEST");
    });
  });
});
