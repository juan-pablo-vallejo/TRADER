// Stage 3 line 5: closeout.review through the application's router. Calls run inside an owner
// transaction that is always rolled back (helpers.ts, "Rolled-back calls"); the lock tests
// commit only deletable fixtures and hold the review open on its own connection.
import {
  approvals,
  companies,
  crews,
  dayCloseouts,
  jobs,
  materials,
  users,
} from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { loadWorkerTimeline } from "../src/labor/timeline";
import {
  appCallerIn,
  asTenant,
  becomeApp,
  boundIn,
  committedCrewDay,
  crewDayIn,
  eventIn,
  holding,
  lockTimeout,
  materialIn,
  ownerDb,
  rejection,
  rolledBack,
  sqlstateOf,
  uuidv7,
  WORKED_DAY as D,
  workedDay,
  type CrewDay,
} from "./helpers";

const owner = ownerDb();
const other = ownerDb();
afterAll(async () => {
  await owner.$client.end();
  await other.$client.end();
});

type Tx = Parameters<Parameters<typeof rolledBack>[1]>[0];

const HOUR = 3_600_000;
const forbidden = { code: "FORBIDDEN", message: "Not permitted." };

const review = (tx: Tx, who: unknown, jobId: string, workDate = D) =>
  appCallerIn(tx, who).closeout.review({ jobId, workDate });

// As the owner, past RLS, then trader_app again.
async function asOwner<T>(tx: Tx, d: CrewDay, body: () => Promise<T>): Promise<T> {
  await tx.execute(sql`reset role`);
  const result = await body();
  await asTenant(tx, d.companyId);
  return result;
}

describe("closeout.review — who may read", () => {
  it("answers 401 without an identity, and to a deactivated foreman", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const off = await boundIn(tx, d.companyId, "foreman", { deactivated: true });
      await becomeApp(tx);
      for (const who of [null, off.who]) {
        await expect(review(tx, who, d.J)).rejects.toMatchObject({
          code: "UNAUTHORIZED",
        });
      }
    });
  });

  it("answers one 403 for a worker, an admin, another crew's, another tenant's, unstaffed or no job", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const elsewhere = await crewDayIn(tx);
      const worker = await boundIn(tx, d.companyId, "worker");
      const admin = await boundIn(tx, d.companyId, "admin");
      const rival = await boundIn(tx, d.companyId, "foreman");
      const [rivalCrew] = await tx
        .insert(crews)
        .values({ companyId: d.companyId, name: "Rival", foremanUserId: rival.id })
        .returning({ id: crews.id });
      const [rivalJob] = await tx
        .insert(jobs)
        .values({
          companyId: d.companyId,
          customerId: d.customerId,
          name: "Rival's",
          crewId: rivalCrew!.id,
        })
        .returning({ id: jobs.id });
      await becomeApp(tx);
      await expect(review(tx, worker.who, d.J)).rejects.toMatchObject(forbidden);
      await expect(review(tx, admin.who, d.J)).rejects.toMatchObject(forbidden);
      for (const jobId of [rivalJob!.id, elsewhere.J, d.K, uuidv7()]) {
        await expect(review(tx, d.who, jobId)).rejects.toMatchObject(forbidden);
      }
    });
  });

  it("answers 403 when the crew is deactivated or the foreman demoted", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      await tx
        .update(crews)
        .set({ deactivatedAt: new Date() })
        .where(eq(crews.id, d.crewId));
      await becomeApp(tx);
      await expect(review(tx, d.who, d.J)).rejects.toMatchObject(forbidden);
    });
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      await tx.update(users).set({ role: "worker" }).where(eq(users.id, d.foremanId));
      await becomeApp(tx);
      await expect(review(tx, d.who, d.J)).rejects.toMatchObject(forbidden);
    });
  });
});

describe("closeout.review — content", () => {
  it("returns each worker's sessions, the day's materials without cost, and the zone", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      await workedDay(tx, d);
      const m = await materialIn(tx, d, d.J, "2026-10-05T15:00:00Z");
      await tx
        .update(materials)
        .set({ costCents: 4200, currency: "USD" })
        .where(eq(materials.id, m));
      await materialIn(tx, d, d.J, "2026-10-06T05:00:00Z"); // the 6th in New York
      await materialIn(tx, d, d.K, "2026-10-05T15:00:00Z"); // another job
      await becomeApp(tx);
      const r = await review(tx, d.who, d.J);

      expect(r).toMatchObject({
        jobId: d.J,
        workDate: D,
        timeZone: "America/New_York",
        job: { name: "J", status: "open" },
        closeout: null,
      });
      expect(r.workers.map((w) => [w.workerId, w.name])).toEqual(
        [
          [d.w1, "w1"],
          [d.w2, "w2"],
        ].sort((a, b) => (a[0]! < b[0]! ? -1 : 1)),
      );
      const worked = Object.fromEntries(
        r.workers.map((w) => [w.workerId, w.sessions.map((s) => s.workedMs)]),
      );
      expect(worked).toEqual({ [d.w1]: [4 * HOUR], [d.w2]: [8 * HOUR] });
      expect(r.workers[0]!.sessions[0]).toMatchObject({
        state: "ended",
        complete: true,
        voided: false,
        corrected: false,
        breakMs: 0,
      });
      expect(r.materials).toEqual([
        {
          id: m,
          description: "Eggshell, white",
          quantity: "2.000",
          unit: "gal",
          loggedAt: new Date("2026-10-05T15:00:00Z"),
          loggedByUserId: d.w1,
          loggedByName: "w1",
        },
      ]);
      expect(r.fingerprint).toMatch(/^v1\.[0-9a-f]{64}$/);
    });
  });

  it("shows corrected starts on the job they moved to, voids with zero hours, open sessions", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      // w1 started on K, corrected onto J; w2's J session voided; the foreman still open.
      const r1 = await eventIn(tx, d, {
        worker: d.w1,
        job: d.K,
        type: "started",
        client: "2026-10-05T12:00:00Z",
      });
      await eventIn(tx, d, {
        worker: d.w1,
        job: d.J,
        type: "started",
        client: "2026-10-05T12:00:00Z",
        server: "2026-10-05T12:30:00Z",
        corrects: r1,
      });
      await eventIn(tx, d, {
        worker: d.w1,
        job: d.J,
        type: "ended",
        client: "2026-10-05T16:00:00Z",
      });
      const r2 = await eventIn(tx, d, {
        worker: d.w2,
        job: d.J,
        type: "started",
        client: "2026-10-05T13:00:00Z",
      });
      await eventIn(tx, d, {
        worker: d.w2,
        job: d.J,
        type: "ended",
        client: "2026-10-05T15:00:00Z",
      });
      await eventIn(tx, d, {
        worker: d.w2,
        job: d.J,
        type: "voided",
        client: "2026-10-05T17:00:00Z",
        voids: r2,
      });
      await eventIn(tx, d, {
        worker: d.foremanId,
        job: d.J,
        type: "started",
        client: "2026-10-05T14:00:00Z",
      });
      await becomeApp(tx);
      const r = await review(tx, d.who, d.J);
      const by = Object.fromEntries(r.workers.map((w) => [w.workerId, w.sessions[0]]));
      expect(by[d.w1]).toMatchObject({ corrected: true, workedMs: 4 * HOUR });
      expect(by[d.w2]).toMatchObject({ voided: true, workedMs: 0, corrected: false });
      expect(by[d.foremanId]).toMatchObject({
        state: "working",
        complete: false,
        endedAt: null,
        elapsedMs: null,
      });
    });
  });

  it("dates sessions in the zone: overnight, the end of daylight saving, a skewed start", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const ev = (client: string, type: "started" | "ended", o = {}) =>
        eventIn(tx, d, { worker: d.w1, job: d.J, type, client, ...o });
      // 22:00–02:00 New York: wholly on the 5th.
      await ev("2026-10-06T02:00:00Z", "started");
      await ev("2026-10-06T06:00:00Z", "ended");
      // 23:30 EST on 1 November, after the clocks fell back; a fixed EDT offset says the 2nd.
      await ev("2026-11-02T04:30:00Z", "started");
      await ev("2026-11-02T05:30:00Z", "ended");
      // The device said 23:00 on the 7th; skewed, so it sits at its receipt on the 8th.
      await ev("2026-10-08T03:00:00Z", "started", {
        server: "2026-10-08T14:00:00Z",
        skewed: true,
      });
      await ev("2026-10-08T16:00:00Z", "ended");
      await becomeApp(tx);
      const hours = async (date: string) =>
        (await review(tx, d.who, d.J, date)).workers.flatMap((w) =>
          w.sessions.map((s) => s.workedMs / HOUR),
        );
      expect(await hours("2026-10-05")).toEqual([4]);
      expect(await hours("2026-10-06")).toEqual([]);
      expect(await hours("2026-11-01")).toEqual([1]);
      expect(await hours("2026-11-02")).toEqual([]);
      expect(await hours("2026-10-07")).toEqual([]);
      expect(await hours("2026-10-08")).toEqual([2]);
    });
  });

  it("flags a closeout already submitted, keeping the content live", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const id = uuidv7();
      const at = new Date("2026-10-05T22:00:00.000Z");
      await tx.insert(dayCloseouts).values({
        id,
        companyId: d.companyId,
        jobId: d.J,
        workDate: D,
        timezone: "America/New_York",
        jobStatus: "open",
        jobStatusApplied: true,
        note: null,
        submittedByUserId: d.foremanId,
        clientTimestamp: at,
        serverTimestamp: at,
        workerMarkCount: 0,
        materialCount: 0,
      });
      await workedDay(tx, d);
      await becomeApp(tx);
      const r = await review(tx, d.who, d.J);
      expect(r.closeout).toEqual({ id, serverTimestamp: at });
      expect(r.workers).toHaveLength(2);
    });
  });
});

describe("closeout.review — fingerprint", () => {
  it("is stable, kept by what the foreman does not review, changed by what they do", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      await workedDay(tx, d);
      const m = await materialIn(tx, d, d.J, "2026-10-05T15:00:00Z");
      await becomeApp(tx);
      const fp = async () => (await review(tx, d.who, d.J)).fingerprint;
      const first = await fp();
      expect(await fp()).toBe(first);

      // Not reviewed: w1 on K the same day (it moves w1's mark), J the next day, a material
      // on K, the cost, an approval, a name.
      const kept: [string, () => Promise<unknown>][] = [
        [
          "K same day",
          async () => {
            await eventIn(tx, d, {
              worker: d.w1,
              job: d.K,
              type: "started",
              client: "2026-10-05T17:00:00Z",
            });
            await eventIn(tx, d, {
              worker: d.w1,
              job: d.K,
              type: "ended",
              client: "2026-10-05T18:00:00Z",
            });
          },
        ],
        [
          "J next day",
          async () => {
            await eventIn(tx, d, {
              worker: d.w2,
              job: d.J,
              type: "started",
              client: "2026-10-06T12:00:00Z",
            });
            await eventIn(tx, d, {
              worker: d.w2,
              job: d.J,
              type: "ended",
              client: "2026-10-06T13:00:00Z",
            });
          },
        ],
        ["material on K", () => materialIn(tx, d, d.K, "2026-10-05T15:00:00Z")],
        [
          "cost",
          () =>
            tx
              .update(materials)
              .set({ costCents: 4200, currency: "USD" })
              .where(eq(materials.id, m)),
        ],
        [
          "approval",
          async () => {
            const e = await eventIn(tx, d, {
              worker: d.w2,
              job: d.K,
              type: "started",
              client: "2026-10-07T12:00:00Z",
            });
            await tx
              .insert(approvals)
              .values({ companyId: d.companyId, eventId: e, reasons: ["offline"] });
          },
        ],
        [
          "name",
          () => tx.update(users).set({ name: "Renamed" }).where(eq(users.id, d.w1)),
        ],
      ];
      for (const [what, change] of kept) {
        await asOwner(tx, d, change);
        expect([what, await fp()]).toEqual([what, first]);
      }

      // Reviewed: each changes it, and from every value before.
      let w1End = "";
      const seen = new Set([first]);
      const changed: [string, () => Promise<unknown>][] = [
        [
          "labor on J",
          async () => {
            await eventIn(tx, d, {
              worker: d.foremanId,
              job: d.J,
              type: "started",
              client: "2026-10-05T19:00:00Z",
            });
            w1End = await eventIn(tx, d, {
              worker: d.foremanId,
              job: d.J,
              type: "ended",
              client: "2026-10-05T20:00:00Z",
            });
          },
        ],
        [
          "same-time correction",
          () =>
            eventIn(tx, d, {
              worker: d.foremanId,
              job: d.J,
              type: "ended",
              client: "2026-10-05T20:00:00Z",
              server: "2026-10-05T23:00:00Z",
              corrects: w1End,
            }),
        ],
        ["material on J", () => materialIn(tx, d, d.J, "2026-10-05T16:00:00Z")],
        [
          "description",
          () =>
            tx
              .update(materials)
              .set({ description: "Satin, white" })
              .where(eq(materials.id, m)),
        ],
        [
          "zone",
          () =>
            tx
              .update(companies)
              .set({ timezone: "America/Chicago" })
              .where(eq(companies.id, d.companyId)),
        ],
        [
          "job status",
          () => tx.update(jobs).set({ status: "complete" }).where(eq(jobs.id, d.J)),
        ],
      ];
      for (const [what, change] of changed) {
        await asOwner(tx, d, change);
        const now = await fp();
        expect([what, seen.has(now)]).toEqual([what, false]);
        seen.add(now);
      }
    });
  });

  it("changes when a session is voided", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const root = await eventIn(tx, d, {
        worker: d.w1,
        job: d.J,
        type: "started",
        client: "2026-10-05T12:00:00Z",
      });
      await eventIn(tx, d, {
        worker: d.w1,
        job: d.J,
        type: "ended",
        client: "2026-10-05T16:00:00Z",
      });
      await becomeApp(tx);
      const before = (await review(tx, d.who, d.J)).fingerprint;
      await asOwner(tx, d, () =>
        eventIn(tx, d, {
          worker: d.w1,
          job: d.J,
          type: "voided",
          client: "2026-10-05T17:00:00Z",
          voids: root,
        }),
      );
      expect((await review(tx, d.who, d.J)).fingerprint).not.toBe(before);
    });
  });
});

describe("closeout.review — locks", () => {
  it("holds the crew, the caller, the job and the zone against change while it runs", async () => {
    const { day: d, cleanup } = await committedCrewDay(owner);
    try {
      await holding(
        owner,
        async (tx) => {
          await becomeApp(tx);
          await review(tx, d.who, d.J);
        },
        async () => {
          for (const statement of [
            sql`update crews set deactivated_at = now() where id = ${d.crewId}`,
            sql`update users set role = 'worker' where id = ${d.foremanId}`,
            sql`update jobs set status = 'complete' where id = ${d.J}`,
            sql`update companies set timezone = 'UTC' where id = ${d.companyId}`,
          ]) {
            let code: string | undefined;
            await rolledBack(other, async (tx) => {
              await lockTimeout(tx);
              code = sqlstateOf(await rejection(tx.execute(statement)));
            });
            expect(code).toBe("55P03");
          }
        },
      );
    } finally {
      await cleanup();
    }
  });

  it("takes no field-write lock: a labor writer goes ahead while it runs", async () => {
    const { day: d, cleanup } = await committedCrewDay(owner);
    try {
      await holding(
        owner,
        async (tx) => {
          await becomeApp(tx);
          await review(tx, d.who, d.J);
        },
        () =>
          rolledBack(other, async (tx) => {
            await asTenant(tx, d.companyId);
            await lockTimeout(tx);
            const timeline = await loadWorkerTimeline(tx, d.w1);
            expect(timeline.events).toEqual([]);
          }),
      );
    } finally {
      await cleanup();
    }
  });
});
