// Stage 3 lines 4 and 5: a job's day for its closeout and review, against Postgres. Every test runs in an owner
// transaction that is always rolled back (labor events can never be deleted), reading as
// trader_app under the day's tenant.
import { companies } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { gatherJobDay } from "../src/closeout/day";
import { readWorkerEvents } from "../src/labor/timeline";
import { deriveSessions } from "../src/labor/work-date";
import {
  asTenant,
  crewDayIn,
  eventIn,
  materialIn,
  ownerDb,
  rolledBack,
  type CrewDay,
} from "./helpers";

const owner = ownerDb();
afterAll(async () => {
  await owner.$client.end();
});

const HOUR = 3_600_000;
const NY = "America/New_York";

const gather = (
  tx: Parameters<typeof asTenant>[0],
  day: CrewDay,
  job: string,
  date: string,
) => gatherJobDay(tx, { jobId: job, workDate: date, timeZone: NY });

const summary = (d: Awaited<ReturnType<typeof gatherJobDay>>) =>
  d.sessions
    .map(({ workerId, session, corrected }) => ({
      workerId,
      corrected,
      workedMs: session.workedMs,
      voided: session.voided,
      complete: session.complete,
    }))
    .sort((a, b) => (a.workerId < b.workerId ? -1 : 1));

describe("gatherJobDay", () => {
  it("keeps each worker's sessions on the job and day, with each ledger's newest stamp", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const { w1, w2, J, K } = d;
      await eventIn(tx, d, {
        worker: w1,
        job: J,
        type: "started",
        client: "2026-10-05T12:00:00Z",
      });
      await eventIn(tx, d, {
        worker: w1,
        job: J,
        type: "ended",
        client: "2026-10-05T16:00:00Z",
      });
      await eventIn(tx, d, {
        worker: w1,
        job: K,
        type: "started",
        client: "2026-10-05T17:00:00Z",
      });
      await eventIn(tx, d, {
        worker: w1,
        job: K,
        type: "ended",
        client: "2026-10-05T20:00:00Z",
      });
      await eventIn(tx, d, {
        worker: w2,
        job: J,
        type: "started",
        client: "2026-10-05T13:00:00Z",
      });
      await eventIn(tx, d, {
        worker: w2,
        job: J,
        type: "ended",
        client: "2026-10-05T21:00:00Z",
      });
      await asTenant(tx, d.companyId);

      const day = await gather(tx, d, J, "2026-10-05");
      expect(summary(day)).toEqual(
        [
          {
            workerId: w1,
            corrected: false,
            workedMs: 4 * HOUR,
            voided: false,
            complete: true,
          },
          {
            workerId: w2,
            corrected: false,
            workedMs: 8 * HOUR,
            voided: false,
            complete: true,
          },
        ].sort((a, b) => (a.workerId < b.workerId ? -1 : 1)),
      );
      // The mark is the worker's whole ledger, K included.
      expect(
        Object.fromEntries(
          day.workers.map((w) => [w.workerId, w.ledgerThrough.toISOString()]),
        ),
      ).toEqual({ [w1]: "2026-10-05T20:00:00.000Z", [w2]: "2026-10-05T21:00:00.000Z" });
      expect(day.workers.map((w) => w.workerId)).toEqual([w1, w2].sort());

      const k = await gather(tx, d, K, "2026-10-05");
      expect(summary(k)).toEqual([
        {
          workerId: w1,
          corrected: false,
          workedMs: 3 * HOUR,
          voided: false,
          complete: true,
        },
      ]);
      expect(await gather(tx, d, J, "2026-10-06")).toEqual({
        sessions: [],
        workers: [],
        materials: [],
      });
    });
  });

  it("follows a corrected start onto and off the job (effective job, decision D5)", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const { w1, w2, J, K } = d;
      // w1 started on K, corrected to J.
      const r1 = await eventIn(tx, d, {
        worker: w1,
        job: K,
        type: "started",
        client: "2026-10-05T12:00:00Z",
      });
      await eventIn(tx, d, {
        worker: w1,
        job: J,
        type: "started",
        client: "2026-10-05T12:00:00Z",
        server: "2026-10-05T12:30:00Z",
        corrects: r1,
      });
      await eventIn(tx, d, {
        worker: w1,
        job: J,
        type: "ended",
        client: "2026-10-05T16:00:00Z",
      });
      // w2 started on J, corrected to K.
      const r2 = await eventIn(tx, d, {
        worker: w2,
        job: J,
        type: "started",
        client: "2026-10-05T12:00:00Z",
      });
      await eventIn(tx, d, {
        worker: w2,
        job: K,
        type: "started",
        client: "2026-10-05T12:00:00Z",
        server: "2026-10-05T12:30:00Z",
        corrects: r2,
      });
      await eventIn(tx, d, {
        worker: w2,
        job: K,
        type: "ended",
        client: "2026-10-05T16:00:00Z",
      });
      await asTenant(tx, d.companyId);

      // Each moved session's start in effect is a correction.
      expect(
        summary(await gather(tx, d, J, "2026-10-05")).map((s) => [
          s.workerId,
          s.corrected,
        ]),
      ).toEqual([[w1, true]]);
      expect(
        summary(await gather(tx, d, K, "2026-10-05")).map((s) => [
          s.workerId,
          s.corrected,
        ]),
      ).toEqual([[w2, true]]);
    });
  });

  it("keeps a voided session with zero hours, and shows a voided open one as open", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const { w1, w2, J } = d;
      const root = await eventIn(tx, d, {
        worker: w1,
        job: J,
        type: "started",
        client: "2026-10-05T12:00:00Z",
      });
      await eventIn(tx, d, {
        worker: w1,
        job: J,
        type: "ended",
        client: "2026-10-05T16:00:00Z",
      });
      await eventIn(tx, d, {
        worker: w1,
        job: J,
        type: "voided",
        client: "2026-10-05T17:00:00Z",
        voids: root,
      });
      const open = await eventIn(tx, d, {
        worker: w2,
        job: J,
        type: "started",
        client: "2026-10-05T13:00:00Z",
      });
      await eventIn(tx, d, {
        worker: w2,
        job: J,
        type: "voided",
        client: "2026-10-05T14:00:00Z",
        voids: open,
      });
      await asTenant(tx, d.companyId);

      const byWorker = Object.fromEntries(
        summary(await gather(tx, d, J, "2026-10-05")).map((s) => [s.workerId, s]),
      );
      // A void is not a correction: no source in effect is one.
      expect(byWorker[w1]).toMatchObject({
        corrected: false,
        workedMs: 0,
        voided: true,
        complete: true,
      });
      expect(byWorker[w2]).toMatchObject({ voided: true, complete: false });
    });
  });

  it("puts a session wholly on its start's date in the zone: overnight and 23:30", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const { w1, w2, J } = d;
      // 22:00–02:00 New York (EDT), starting on the 5th.
      await eventIn(tx, d, {
        worker: w1,
        job: J,
        type: "started",
        client: "2026-10-06T02:00:00Z",
      });
      await eventIn(tx, d, {
        worker: w1,
        job: J,
        type: "ended",
        client: "2026-10-06T06:00:00Z",
      });
      // 23:30 New York on the 5th is already the 6th in UTC.
      await eventIn(tx, d, {
        worker: w2,
        job: J,
        type: "started",
        client: "2026-10-06T03:30:00Z",
      });
      await eventIn(tx, d, {
        worker: w2,
        job: J,
        type: "ended",
        client: "2026-10-06T04:00:00Z",
      });
      await asTenant(tx, d.companyId);

      const fifth = summary(await gather(tx, d, J, "2026-10-05"));
      expect(Object.fromEntries(fifth.map((s) => [s.workerId, s.workedMs]))).toEqual({
        [w1]: 4 * HOUR,
        [w2]: 0.5 * HOUR,
      });
      expect((await gather(tx, d, J, "2026-10-06")).sessions).toEqual([]);
    });
  });

  it("dates through the zone's rules across the end of daylight saving", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const { w1, J } = d;
      // 23:30 EST on 2026-11-01, the day daylight saving ends; EDT's offset would say the 2nd.
      await eventIn(tx, d, {
        worker: w1,
        job: J,
        type: "started",
        client: "2026-11-02T04:30:00Z",
      });
      await eventIn(tx, d, {
        worker: w1,
        job: J,
        type: "ended",
        client: "2026-11-02T05:00:00Z",
      });
      await asTenant(tx, d.companyId);
      expect((await gather(tx, d, J, "2026-11-01")).sessions).toHaveLength(1);
      expect((await gather(tx, d, J, "2026-11-02")).sessions).toHaveLength(0);
    });
  });

  it("places a skewed start at its receipt (decision D1)", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const { w1, J } = d;
      await eventIn(tx, d, {
        worker: w1,
        job: J,
        type: "started",
        client: "2026-10-05T14:00:00Z",
        server: "2026-10-08T14:00:00Z",
        skewed: true,
      });
      await eventIn(tx, d, {
        worker: w1,
        job: J,
        type: "ended",
        client: "2026-10-08T15:00:00Z",
      });
      await asTenant(tx, d.companyId);
      expect((await gather(tx, d, J, "2026-10-05")).sessions).toHaveLength(0);
      expect((await gather(tx, d, J, "2026-10-08")).sessions).toHaveLength(1);
    });
  });

  it("takes the job's materials logged on the day in the zone", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      // 23:59 New York on the 5th: in. 00:01 on the 6th: out. Another job's: out.
      const late = await materialIn(tx, d, d.J, "2026-10-06T03:59:00Z");
      const morning = await materialIn(tx, d, d.J, "2026-10-05T11:00:00Z");
      await materialIn(tx, d, d.J, "2026-10-06T04:01:00Z");
      await materialIn(tx, d, d.K, "2026-10-05T12:00:00Z");
      await asTenant(tx, d.companyId);
      const day = await gather(tx, d, d.J, "2026-10-05");
      expect(day.materials.map((m) => m.id)).toEqual([late, morning].sort());
      // The facts the foreman sees, and no cost.
      expect(Object.keys(day.materials[0]!).sort()).toEqual(
        ["description", "id", "loggedAt", "loggedByUserId", "quantity", "unit"].sort(),
      );
      expect(day.materials[0]).toMatchObject({
        description: "Eggshell, white",
        quantity: "2.000",
        unit: "gal",
        loggedByUserId: d.w1,
      });
    });
  });

  it("is reproduced from the ledger through each mark in the stored zone, whatever came later", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const { w1, J } = d;
      // 22:00–02:00 New York, on the 5th there but the 6th in UTC.
      await eventIn(tx, d, {
        worker: w1,
        job: J,
        type: "started",
        client: "2026-10-06T02:00:00Z",
      });
      const end = await eventIn(tx, d, {
        worker: w1,
        job: J,
        type: "ended",
        client: "2026-10-06T06:00:00Z",
      });
      await asTenant(tx, d.companyId);
      const at = await gather(tx, d, J, "2026-10-05");
      const [mark] = at.workers;

      // After submission: a later correction lands, and the company changes its zone.
      await tx.execute(sql`reset role`);
      await eventIn(tx, d, {
        worker: w1,
        job: J,
        type: "ended",
        client: "2026-10-06T08:00:00Z",
        server: "2026-10-07T12:00:00Z",
        corrects: end,
      });
      await tx
        .update(companies)
        .set({ timezone: "UTC" })
        .where(eq(companies.id, d.companyId));
      await asTenant(tx, d.companyId);

      const reviewed = (timeZone: string) =>
        readWorkerEvents(tx, w1).then((events) =>
          deriveSessions(
            events.filter((e) => e.serverTimestamp <= mark!.ledgerThrough),
            timeZone,
          ).filter((s) => s.jobId === J && s.workDate === "2026-10-05"),
        );
      expect(await reviewed(NY)).toEqual(at.sessions.map((s) => s.session));
      // The current ledger and the company's current zone each tell a different story.
      expect((await gather(tx, d, J, "2026-10-05")).sessions[0]?.session.workedMs).toBe(
        6 * HOUR,
      );
      expect(await reviewed("UTC")).toEqual([]);
    });
  });
});
