// Stage 3 line 7: one labor event from a push (sync/labor.ts), against Postgres. Every test runs
// in an owner transaction that is always rolled back (labor events can never be deleted); each
// record runs in a savepoint of it as trader_app under the day's tenant, as a record's own
// transaction would. Commit independence is not provable here: the real-commit suite
// (sync/push-commit.test.ts) proves it.
import { jobs, users, workSessionEvents } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { Tx } from "../../src/core/context";
import type { AppUser } from "../../src/core/resolve-user";
import { sessionAccounting } from "../../src/labor/accounting";
import { readWorkerEvents } from "../../src/labor/timeline";
import { deriveSessions } from "../../src/labor/work-date";
import { pushLaborEvent, type LaborRecord } from "../../src/sync/labor";
import { measureSkew } from "../../src/sync/reasons";
import {
  asTenant,
  boundIn,
  companyIn,
  workDayIn,
  ownerDb,
  rejection,
  rolledBack,
  uuidv7,
  type WorkDay,
} from "../helpers";

const owner = ownerDb();
afterAll(async () => {
  await owner.$client.end();
});

const NOW = new Date();
const ONLINE = measureSkew(NOW, NOW);
const SKEWED = measureSkew(new Date(NOW.getTime() + 600_000), NOW);
// Providence; a stamp at the job, and one 5 km north of it.
const HERE = { lat: 41.824, lng: -71.4128, accuracyM: 8 };
const FAR = { lat: 41.869, lng: -71.4128, accuracyM: 8 };

const appUser = (
  d: { companyId: string },
  id: string,
  role: AppUser["role"],
): AppUser => ({
  id,
  companyId: d.companyId,
  role,
  name: "n",
  email: "e@co.test",
  phone: null,
  signInPhone: null,
});

type Payload = LaborRecord["payload"];

function record(
  o: Partial<Payload> & Pick<Payload, "workerId" | "jobId">,
  id = uuidv7(),
) {
  const payload: Payload = {
    type: "started",
    clientTimestamp: new Date("2026-10-05T12:00:00Z"),
    location: HERE,
    timeSetByUser: false,
    capturedOffline: false,
    ...o,
  };
  return { id, schemaVersion: 1, payload };
}

// One record in a savepoint, as its own transaction would run it.
const push = (tx: Tx, user: AppUser, r: LaborRecord, skew = ONLINE) =>
  tx.transaction((sp) => pushLaborEvent(sp, user, r, skew));

// Back to the owner for fixtures and reads past RLS, then the tenant again.
async function asOwner<T>(tx: Tx, d: { companyId: string }, body: () => Promise<T>) {
  await tx.execute(sql`reset role`);
  const result = await body();
  await asTenant(tx, d.companyId);
  return result;
}

const rowsOf = (tx: Tx, d: WorkDay) =>
  asOwner(tx, d, async () => ({
    events: (
      await tx
        .select()
        .from(workSessionEvents)
        .where(eq(workSessionEvents.companyId, d.companyId))
    ).length,
  }));

async function dayFor(tx: Tx) {
  const d = await workDayIn(tx);
  await asTenant(tx, d.companyId);
  return {
    d,
    w1: appUser(d, d.w1, "worker"),
    w2: appUser(d, d.w2, "worker"),
  };
}

const at = (iso: string) => new Date(iso);
// Inside the receipt tolerance: a capture the server takes as made when it says (V1-D01). The
// default record's fixed October time is a backlog: pushed as captured online it is flagged
// `clock_skewed`, so a test of a clean capture times its events with this.
const ago = (seconds: number) => new Date(Date.now() - seconds * 1000);

describe("sync.push labor — a worker's own day", () => {
  it("accepts a day in order, stamps rising, with no flag for a clean capture", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const day = [
        record({
          workerId: d.w1,
          jobId: d.J,
          type: "started",
          clientTimestamp: ago(240),
        }),
        record({
          workerId: d.w1,
          jobId: d.J,
          type: "paused",
          clientTimestamp: ago(180),
          location: null,
        }),
        record({
          workerId: d.w1,
          jobId: d.J,
          type: "resumed",
          clientTimestamp: ago(120),
          location: null,
        }),
        record({
          workerId: d.w1,
          jobId: d.J,
          type: "ended",
          clientTimestamp: ago(60),
        }),
      ];
      const stamps: number[] = [];
      for (const r of day) {
        const answer = await push(tx, w1, r);
        expect(answer).toMatchObject({
          result: "accepted",
          ack: { id: r.id, clockSkewed: false, reasons: [] },
        });
        if (answer.result === "accepted")
          stamps.push(answer.ack.serverTimestamp.getTime());
      }
      expect([...stamps].sort((a, b) => a - b)).toEqual(stamps);
      expect(new Set(stamps).size).toBe(4);
      expect(await rowsOf(tx, d)).toEqual({ events: 4 });
    });
  });

  it("stores the event as sent, with the server's stamp, skew and initiator", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const r = record({ workerId: d.w1, jobId: d.J });
      const answer = await push(tx, w1, r, SKEWED);
      const row = await asOwner(
        tx,
        d,
        async () =>
          (
            await tx
              .select()
              .from(workSessionEvents)
              .where(eq(workSessionEvents.id, r.id))
          )[0],
      );
      expect(row).toMatchObject({
        companyId: d.companyId,
        workerId: d.w1,
        jobId: d.J,
        type: "started",
        clockSkewed: true,
        clockSkewMs: 600_000,
        locationLat: HERE.lat,
        locationLng: HERE.lng,
        locationAccuracyM: HERE.accuracyM,
        schemaVersion: 1,
        timeSetByUser: false,
        capturedOffline: false,
        initiatorUserId: d.w1,
        voidsEventId: null,
        correctsEventId: null,
        flags: ["clock_skewed"],
      });
      expect(answer).toEqual({
        result: "accepted",
        ack: {
          id: r.id,
          serverTimestamp: row!.serverTimestamp,
          clockSkewed: true,
          reasons: ["clock_skewed"],
        },
      });
    });
  });

  it("passes validation's rejections through and writes nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      expect(
        await push(tx, w1, record({ workerId: d.w1, jobId: d.J, type: "ended" })),
      ).toEqual({
        result: "rejected",
        code: "no_open_session",
      });
      const first = record({ workerId: d.w1, jobId: d.J, clientTimestamp: ago(120) });
      await push(tx, w1, first);
      expect(
        await push(
          tx,
          w1,
          record({
            workerId: d.w1,
            jobId: d.J,
            clientTimestamp: ago(60),
          }),
        ),
      ).toMatchObject({ result: "rejected", code: "session_already_open" });
      expect(
        await push(
          tx,
          w1,
          record({
            workerId: d.w1,
            jobId: d.K,
            type: "paused",
            clientTimestamp: ago(60),
          }),
        ),
      ).toMatchObject({
        result: "rejected",
        code: "job_id_mismatch",
        conflictingId: first.id,
      });
      expect(await rowsOf(tx, d)).toEqual({ events: 1 });
    });
  });
});

describe("sync.push labor — flags", () => {
  it("stores every flag with the event, offline from capture evidence alone, and it counts at once", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const cases: [Partial<Payload>, string[]][] = [
        [{ capturedOffline: true }, ["offline"]],
        [{ timeSetByUser: true }, ["user_timed"]],
        [{ location: null }, ["location"]],
        [
          { capturedOffline: true, timeSetByUser: true, location: null },
          ["offline", "user_timed", "location"],
        ],
      ];
      let n = 0;
      for (const [o, reasons] of cases) {
        // A clean `ended` closes each session, so the next start is legal. All inside the
        // receipt tolerance, so no case gains `clock_skewed`.
        const start = record({
          workerId: d.w1,
          jobId: d.J,
          clientTimestamp: ago(240 - 40 * n),
          ...o,
        });
        const answer = await push(tx, w1, start);
        expect(answer).toMatchObject({ result: "accepted", ack: { reasons } });
        const row = await asOwner(
          tx,
          d,
          async () =>
            (
              await tx
                .select({ flags: workSessionEvents.flags })
                .from(workSessionEvents)
                .where(eq(workSessionEvents.id, start.id))
            )[0],
        );
        expect(row).toEqual({ flags: reasons });
        await push(
          tx,
          w1,
          record({
            workerId: d.w1,
            jobId: d.J,
            type: "ended",
            clientTimestamp: ago(220 - 40 * n),
          }),
        );
        n++;
      }
      // Four flagged sessions, each counted whole: none waits on anyone.
      const { byRoot } = sessionAccounting(await readWorkerEvents(tx, d.w1));
      const counted = [...byRoot.values()];
      expect(counted.map((c) => [c.accounting, c.complete])).toEqual(
        cases.map(() => ["eligible", true]),
      );
      expect(counted.every((c) => c.eligibleWorkedMs > 0)).toBe(true);
    });
  });

  it("judges location against the job's place, never on a pause or resume", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      await asOwner(tx, d, () =>
        tx
          .update(jobs)
          .set({ locationLat: HERE.lat, locationLng: HERE.lng, locationRadiusM: 200 })
          .where(eq(jobs.id, d.J)),
      );
      const reasonsOf = async (o: Partial<Payload>) => {
        const answer = await push(tx, w1, record({ workerId: d.w1, jobId: d.J, ...o }));
        return answer.result === "accepted" ? answer.ack.reasons : answer;
      };
      expect(await reasonsOf({ location: HERE, clientTimestamp: ago(240) })).toEqual([]);
      expect(
        await reasonsOf({ type: "paused", location: null, clientTimestamp: ago(180) }),
      ).toEqual([]);
      expect(
        await reasonsOf({ type: "resumed", location: FAR, clientTimestamp: ago(120) }),
      ).toEqual([]);
      expect(
        await reasonsOf({ type: "ended", location: FAR, clientTimestamp: ago(60) }),
      ).toEqual(["location"]);
    });
  });
});

describe("sync.push labor — the time an event claims, against its receipt (V1-D01)", () => {
  const HOUR = 3_600_000;
  const rowOf = (tx: Tx, d: WorkDay, id: string) =>
    asOwner(
      tx,
      d,
      async () =>
        (
          await tx.select().from(workSessionEvents).where(eq(workSessionEvents.id, id))
        )[0]!,
    );

  it("flags a backdated event that claims an online capture, at the time it carries", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const claimed = new Date(Date.now() - HOUR);
      const r = record({ workerId: d.w1, jobId: d.J, clientTimestamp: claimed });
      // The device's clock is right (ONLINE): only the receipt comparison can flag it.
      const answer = await push(tx, w1, r);
      expect(answer).toMatchObject({
        result: "accepted",
        ack: { clockSkewed: true, reasons: ["clock_skewed"] },
      });
      const row = await rowOf(tx, d, r.id);
      expect(row).toMatchObject({
        clientTimestamp: claimed,
        clockSkewed: true,
        clockSkewMs: 0,
        capturedOffline: false,
        timeSetByUser: false,
        flags: ["clock_skewed"],
      });
      // The evidence is on the row: its receipt is more than the tolerance after its time.
      expect(row.serverTimestamp.getTime() - claimed.getTime()).toBeGreaterThan(
        HOUR - 60_000,
      );
      // Kept, not replaced: the session starts when the event says it did.
      const [session] = deriveSessions(await readWorkerEvents(tx, d.w1), "UTC");
      expect(session!.startedAt).toEqual(claimed);
    });
  });

  it("does not flag an old event that says it was captured offline or timed by the user", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const cases: [Partial<Payload>, string[]][] = [
        [{ capturedOffline: true }, ["offline"]],
        [{ timeSetByUser: true }, ["user_timed"]],
      ];
      let n = 0;
      for (const [o, reasons] of cases) {
        // Two days old, then a day old: delivery delay alone decides nothing.
        const start = record({
          workerId: d.w1,
          jobId: d.J,
          clientTimestamp: new Date(Date.now() - (48 - 24 * n) * HOUR),
          ...o,
        });
        expect(await push(tx, w1, start)).toMatchObject({
          result: "accepted",
          ack: { clockSkewed: false, reasons },
        });
        expect((await rowOf(tx, d, start.id)).clockSkewed).toBe(false);
        await push(
          tx,
          w1,
          record({
            workerId: d.w1,
            jobId: d.J,
            type: "ended",
            clientTimestamp: new Date(Date.now() - (47 - 24 * n) * HOUR),
            capturedOffline: true,
          }),
        );
        n++;
      }
    });
  });

  it("refuses a future event whatever it says of itself, writing nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const future = new Date(Date.now() + HOUR);
      const refused = { result: "rejected", code: "time_in_future" };
      const variants: Partial<Payload>[] = [
        {},
        { capturedOffline: true },
        { timeSetByUser: true },
        { capturedOffline: true, timeSetByUser: true },
      ];
      for (const o of variants) {
        const r = record({ workerId: d.w1, jobId: d.J, clientTimestamp: future, ...o });
        expect(await push(tx, w1, r)).toEqual(refused);
        // The same record sent again is judged again and refused again: nothing was kept.
        expect(await push(tx, w1, r)).toEqual(refused);
      }
      // A skewed device clock excuses nothing.
      expect(
        await push(
          tx,
          w1,
          record({ workerId: d.w1, jobId: d.J, clientTimestamp: future }),
          SKEWED,
        ),
      ).toEqual(refused);
      expect(await rowsOf(tx, d)).toEqual({ events: 0 });
      // Inside the tolerance a slightly fast clock is taken as it is: accepted, unflagged.
      expect(
        await push(
          tx,
          w1,
          record({
            workerId: d.w1,
            jobId: d.J,
            clientTimestamp: new Date(Date.now() + 120_000),
          }),
        ),
      ).toMatchObject({ result: "accepted", ack: { clockSkewed: false, reasons: [] } });
    });
  });

  it("answers scope before time, and time before the timeline", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const future = new Date(Date.now() + HOUR);
      // Not w1's own labor: a caller out of scope learns no time verdict.
      expect(
        await push(
          tx,
          w1,
          record({ workerId: d.w2, jobId: d.J, clientTimestamp: future }),
        ),
      ).toEqual({ result: "rejected", code: "not_permitted" });
      // An end with no session, in the future: named as the future time it is.
      expect(
        await push(
          tx,
          w1,
          record({ workerId: d.w1, jobId: d.J, type: "ended", clientTimestamp: future }),
        ),
      ).toEqual({ result: "rejected", code: "time_in_future" });
      expect(await rowsOf(tx, d)).toEqual({ events: 0 });
    });
  });

  it("answers a flagged event's retry from the stored row, never judging it again", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const r = record({
        workerId: d.w1,
        jobId: d.J,
        clientTimestamp: new Date(Date.now() - HOUR),
      });
      const first = await push(tx, w1, r);
      expect(first).toMatchObject({ ack: { reasons: ["clock_skewed"] } });
      const stored = await rowOf(tx, d, r.id);
      expect(await push(tx, w1, r, SKEWED)).toEqual({ ...first, result: "duplicate" });
      expect(await rowOf(tx, d, r.id)).toEqual(stored);
      expect(await rowsOf(tx, d)).toEqual({ events: 1 });
    });
  });
});

describe("sync.push labor — who may push", () => {
  it("lets a worker start on any job that is not archived, and end on one archived since", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const notPermitted = { result: "rejected", code: "not_permitted" };
      const start = record({ workerId: d.w1, jobId: d.J });
      expect((await push(tx, w1, start)).result).toBe("accepted");
      // The job archived mid-session: the end is still accepted.
      await asOwner(tx, d, () =>
        tx.update(jobs).set({ status: "archived" }).where(eq(jobs.id, d.J)),
      );
      expect(
        (
          await push(
            tx,
            w1,
            record({
              workerId: d.w1,
              jobId: d.J,
              type: "ended",
              clientTimestamp: at("2026-10-05T16:00:00Z"),
            }),
          )
        ).result,
      ).toBe("accepted");
      expect(
        await push(
          tx,
          w1,
          record({
            workerId: d.w1,
            jobId: d.J,
            clientTimestamp: at("2026-10-06T12:00:00Z"),
          }),
        ),
      ).toEqual(notPermitted);
      // Any other job of the company that is not archived, with nothing tying them to it.
      expect(
        (
          await push(
            tx,
            w1,
            record({
              workerId: d.w1,
              jobId: d.K,
              clientTimestamp: at("2026-10-06T12:00:00Z"),
            }),
          )
        ).result,
      ).toBe("accepted");
    });
  });

  it("refuses a worker's start on an archived job", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      await asOwner(tx, d, () =>
        tx.update(jobs).set({ status: "archived" }).where(eq(jobs.id, d.J)),
      );
      expect(await push(tx, w1, record({ workerId: d.w1, jobId: d.J }))).toMatchObject({
        code: "not_permitted",
      });
    });
  });

  it("refuses a record naming another person as its worker not_permitted, every type, and writes nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1, w2 } = await dayFor(tx);
      const a = await asOwner(tx, d, () => boundIn(tx, d.companyId, "admin"));
      const notPermitted = { result: "rejected", code: "not_permitted" };
      // A worker for a worker, and an admin for a worker: nobody records another's labor.
      for (const caller of [w1, appUser(d, a.id, "admin")]) {
        expect(await push(tx, caller, record({ workerId: d.w2, jobId: d.J }))).toEqual(
          notPermitted,
        );
      }
      expect(await rowsOf(tx, d)).toEqual({ events: 0 });
      // Nor a pause, a resume or an end of a session that person opened themself.
      expect((await push(tx, w2, record({ workerId: d.w2, jobId: d.J }))).result).toBe(
        "accepted",
      );
      for (const [i, type] of (["paused", "resumed", "ended"] as const).entries()) {
        const r = record({
          workerId: d.w2,
          jobId: d.J,
          type,
          clientTimestamp: at(`2026-10-05T1${3 + i}:00:00Z`),
        });
        expect(await push(tx, w1, r)).toEqual(notPermitted);
      }
      expect(await rowsOf(tx, d)).toEqual({ events: 1 });
    });
  });

  it("lets an admin start on any job but record nobody else's labor", async () => {
    await rolledBack(owner, async (tx) => {
      const { d } = await dayFor(tx);
      const a = await asOwner(tx, d, () => boundIn(tx, d.companyId, "admin"));
      const admin = appUser(d, a.id, "admin");
      expect((await push(tx, admin, record({ workerId: a.id, jobId: d.K }))).result).toBe(
        "accepted",
      );
      expect(await push(tx, admin, record({ workerId: d.w1, jobId: d.J }))).toMatchObject(
        { code: "not_permitted" },
      );
    });
  });

  it("answers UNAUTHORIZED to a caller deactivated since resolution, and writes nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      await asOwner(tx, d, () =>
        tx.update(users).set({ deactivatedAt: new Date() }).where(eq(users.id, d.w1)),
      );
      const error = await rejection(push(tx, w1, record({ workerId: d.w1, jobId: d.J })));
      expect(error).toMatchObject({ code: "UNAUTHORIZED" });
      expect(await rowsOf(tx, d)).toEqual({ events: 0 });
    });
  });

  it("sees no other tenant's job or worker", async () => {
    await rolledBack(owner, async (tx) => {
      const other = await workDayIn(tx);
      const { d, w1, w2 } = await dayFor(tx);
      expect(
        await push(tx, w1, record({ workerId: d.w1, jobId: other.J })),
      ).toMatchObject({ code: "not_permitted" });
      expect(
        await push(tx, w2, record({ workerId: other.w1, jobId: d.J })),
      ).toMatchObject({ code: "not_permitted" });
    });
  });
});

describe("sync.push labor — idempotency", () => {
  it("answers an identical retry duplicate with the same acknowledgement", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const r = record({ workerId: d.w1, jobId: d.J, capturedOffline: true });
      const first = await push(tx, w1, r);
      const again = await push(tx, w1, r, SKEWED);
      expect(again).toEqual({ ...first, result: "duplicate" });
      expect(await rowsOf(tx, d)).toEqual({ events: 1 });
    });
  });

  it("answers its initiator's retry after the job was archived, from their own record", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const r = record({ workerId: d.w1, jobId: d.J });
      const first = await push(tx, w1, r);
      await asOwner(tx, d, () =>
        tx.update(jobs).set({ status: "archived" }).where(eq(jobs.id, d.J)),
      );
      expect(await push(tx, w1, r)).toEqual({ ...first, result: "duplicate" });
    });
  });

  it("answers id_conflict for any device field that differs, the schema version included", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const r = record({ workerId: d.w1, jobId: d.J, clientTimestamp: ago(60) });
      await push(tx, w1, r);
      const variants: LaborRecord[] = [
        { ...r, schemaVersion: 2 },
        { ...r, payload: { ...r.payload, jobId: d.K } },
        { ...r, payload: { ...r.payload, type: "ended" } },
        {
          ...r,
          payload: {
            ...r.payload,
            clientTimestamp: new Date(r.payload.clientTimestamp.getTime() + 1),
          },
        },
        { ...r, payload: { ...r.payload, location: null } },
        { ...r, payload: { ...r.payload, location: { ...HERE, accuracyM: null } } },
        { ...r, payload: { ...r.payload, location: { ...HERE, lat: 41.8241 } } },
        { ...r, payload: { ...r.payload, location: { ...HERE, lng: -71.4129 } } },
        { ...r, payload: { ...r.payload, timeSetByUser: true } },
        { ...r, payload: { ...r.payload, capturedOffline: true } },
      ];
      for (const v of variants) {
        expect(await push(tx, w1, v)).toEqual({
          result: "rejected",
          code: "id_conflict",
        });
      }
      expect(await rowsOf(tx, d)).toEqual({ events: 1 });
    });
  });

  it("answers another initiator's id as id_conflict only in scope", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1, w2 } = await dayFor(tx);
      const theirs = record({ workerId: d.w2, jobId: d.J });
      expect((await push(tx, w2, theirs)).result).toBe("accepted");
      // The same id on w1's own record: taken. On a record out of w1's scope: nothing said.
      const mine = record({ workerId: d.w1, jobId: d.J }, theirs.id);
      expect(await push(tx, w1, mine)).toEqual({
        result: "rejected",
        code: "id_conflict",
      });
      expect(await push(tx, w1, theirs)).toEqual({
        result: "rejected",
        code: "not_permitted",
      });
    });
  });

  it("answers an id another tenant holds as id_conflict, revealing nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const other = await companyIn(tx);
      const otherJob = (
        await tx
          .insert(jobs)
          .values({ companyId: other.companyId, customerId: other.customerId, name: "X" })
          .returning({ id: jobs.id })
      )[0]!.id;
      const id = uuidv7();
      await tx.insert(workSessionEvents).values({
        id,
        companyId: other.companyId,
        workerId: other.userId,
        jobId: otherJob,
        type: "started",
        clientTimestamp: new Date(),
        serverTimestamp: new Date(),
        clockSkewed: false,
        clockSkewMs: 0,
        schemaVersion: 1,
        timeSetByUser: false,
        capturedOffline: false,
        initiatorUserId: other.userId,
      });
      const { d, w1 } = await dayFor(tx);
      expect(await push(tx, w1, record({ workerId: d.w1, jobId: d.J }, id))).toEqual({
        result: "rejected",
        code: "id_conflict",
      });
      expect(await rowsOf(tx, d)).toEqual({ events: 0 });
    });
  });
});

// An admin's own labor is flagged like anyone's. Flags are judged once, at receipt, and
// nothing is judged again afterwards.
describe("sync.push labor — an admin's own labor", () => {
  // Every reason a push can compute, and the reading that flags the clock.
  const FLAGGED = { capturedOffline: true, timeSetByUser: true, location: null } as const;
  const REASONS = ["offline", "user_timed", "location", "clock_skewed"];

  const flagsOf = (tx: Tx, d: WorkDay, eventId: string) =>
    asOwner(
      tx,
      d,
      async () =>
        (
          await tx
            .select({ flags: workSessionEvents.flags })
            .from(workSessionEvents)
            .where(eq(workSessionEvents.id, eventId))
        )[0]?.flags,
    );

  // How one worker's sessions count, by the accounting every reader uses.
  async function accounting(tx: Tx, d: WorkDay, workerId: string) {
    return asOwner(tx, d, async () =>
      [...sessionAccounting(await readWorkerEvents(tx, workerId)).byRoot.values()].map(
        (s) => s.accounting,
      ),
    );
  }

  async function adminIn(tx: Tx, d: WorkDay) {
    const a = await asOwner(tx, d, () => boundIn(tx, d.companyId, "admin"));
    return appUser(d, a.id, "admin");
  }

  it("flags an admin's event like anyone's, keeps its evidence, and it counts", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1, w2 } = await dayFor(tx);
      const admin = await adminIn(tx, d);
      const r = record({ workerId: admin.id, jobId: d.K, ...FLAGGED });
      expect(await push(tx, admin, r, SKEWED)).toMatchObject({
        result: "accepted",
        ack: { id: r.id, clockSkewed: true, reasons: REASONS },
      });
      const [row] = await asOwner(tx, d, () =>
        tx.select().from(workSessionEvents).where(eq(workSessionEvents.id, r.id)),
      );
      expect(row).toMatchObject({
        workerId: admin.id,
        initiatorUserId: admin.id,
        capturedOffline: true,
        timeSetByUser: true,
        clockSkewed: true,
        clockSkewMs: SKEWED.clockSkewMs,
        locationLat: null,
        flags: REASONS,
      });
      expect(await accounting(tx, d, admin.id)).toEqual(["eligible"]);

      // The same event from a worker, and from another: the same flags, and it counts.
      for (const who of [w1, w2]) {
        const theirs = record({ workerId: who.id, jobId: d.J, ...FLAGGED });
        expect(await push(tx, who, theirs, SKEWED)).toMatchObject({
          result: "accepted",
          ack: { reasons: REASONS },
        });
        expect(await flagsOf(tx, d, theirs.id)).toEqual(REASONS);
        expect(await accounting(tx, d, who.id)).toEqual(["eligible"]);
      }
    });
  });

  it("moves nothing when the role changes after receipt", async () => {
    await rolledBack(owner, async (tx) => {
      const { d } = await dayFor(tx);
      const admin = await adminIn(tx, d);
      const flags = ["offline", "user_timed", "location"];

      // An admin's event, then a demotion: the flags stand, and the retry answers as stored.
      const theirs = record({ workerId: admin.id, jobId: d.K, ...FLAGGED });
      const first = await push(tx, admin, theirs);
      expect(first).toMatchObject({ result: "accepted", ack: { reasons: flags } });
      await asOwner(tx, d, () =>
        tx.update(users).set({ role: "worker" }).where(eq(users.id, admin.id)),
      );
      expect(await push(tx, { ...admin, role: "worker" }, theirs)).toEqual({
        ...first,
        result: "duplicate",
      });
      expect(await flagsOf(tx, d, theirs.id)).toEqual(flags);
      expect(await accounting(tx, d, admin.id)).toEqual(["eligible"]);
    });
  });
});
