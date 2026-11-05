// Stage 3 line 7: sync.push through the application's router (routers/sync.ts), against
// Postgres, in rolled-back owner transactions: each record's caller transaction is a savepoint
// of it. What a commit proves is sync-push-commit.test.ts's; the loop's stop rules are also
// proved here without a database, through pushRecords with a stand-in runner.
import {
  crewMembers,
  dayCloseoutMaterials,
  dayCloseouts,
  dayCloseoutWorkers,
  materials,
  users,
  workSessionEvents,
} from "@trader/db/schema";
import { TRPCError } from "@trpc/server";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { Tx } from "../src/context";
import { readWorkerEvents } from "../src/labor/timeline";
import { deriveSessions } from "../src/labor/work-date";
import {
  BUDGET_MS,
  pushRecords,
  type PushResult,
  type RunRecord,
} from "../src/sync/push";
import {
  appCallerIn,
  asTenant,
  boundIn,
  crewDayIn,
  ownerDb,
  rejection,
  rolledBack,
  sqlstateOf,
  uuidv7,
} from "./helpers";

const owner = ownerDb();
afterAll(async () => {
  await owner.$client.end();
});

const HERE = { lat: 41.824, lng: -71.4128, accuracyM: 8 };
const NY = "America/New_York";

function labor(
  workerId: string,
  jobId: string,
  o: Record<string, unknown> = {},
  id = uuidv7(),
) {
  return {
    id,
    kind: "labor_event",
    schemaVersion: 1,
    payload: {
      workerId,
      jobId,
      type: "started",
      clientTimestamp: new Date("2026-10-05T12:00:00Z"),
      attestationLevel: "biometric",
      location: HERE,
      timeSetByUser: false,
      capturedOffline: false,
      ...o,
    },
  };
}

function receipt(jobId: string, o: Record<string, unknown> = {}, id = uuidv7()) {
  return {
    id,
    kind: "material",
    schemaVersion: 1,
    payload: {
      jobId,
      description: "Primer",
      quantity: "1.5",
      unit: "gal",
      loggedAt: new Date("2026-10-05T15:00:00Z"),
      capturedOffline: false,
      ...o,
    },
  };
}

// A crew day with a bound worker `w` on the crew, the app role and tenant on.
async function world(tx: Tx) {
  const d = await crewDayIn(tx);
  const w = await boundIn(tx, d.companyId, "worker");
  await tx
    .insert(crewMembers)
    .values({ companyId: d.companyId, crewId: d.crewId, userId: w.id });
  await asTenant(tx, d.companyId);
  return { ...d, w };
}

const push = (tx: Tx, who: unknown, records: unknown[], deviceNow = new Date()) =>
  appCallerIn(tx, who).sync.push({ protocolVersion: 1, deviceNow, records });

async function asOwner<T>(tx: Tx, companyId: string, body: () => Promise<T>) {
  await tx.execute(sql`reset role`);
  const result = await body();
  await asTenant(tx, companyId);
  return result;
}

const summary = (results: PushResult[]) =>
  results.map((r) => (r.result === "rejected" ? `${r.result}:${r.code}` : r.result));

describe("sync.push — who may call", () => {
  it("answers UNAUTHORIZED without an identity, and to a deactivated caller, writing nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      expect(await rejection(push(tx, null, [labor(d.w.id, d.J)]))).toMatchObject({
        code: "UNAUTHORIZED",
      });
      await asOwner(tx, d.companyId, () =>
        tx.update(users).set({ deactivatedAt: new Date() }).where(eq(users.id, d.w.id)),
      );
      const bad = { id: uuidv7(), kind: "labor_event", schemaVersion: 1, payload: {} };
      // Not even a malformed record is answered to a caller with no account.
      expect(await rejection(push(tx, d.w.who, [bad, labor(d.w.id, d.J)]))).toMatchObject(
        {
          code: "UNAUTHORIZED",
        },
      );
      const events = await asOwner(tx, d.companyId, () =>
        tx
          .select()
          .from(workSessionEvents)
          .where(eq(workSessionEvents.companyId, d.companyId)),
      );
      expect(events).toEqual([]);
    });
  });

  it("refuses another protocol version, an empty batch and an oversized one (BAD_REQUEST)", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const call = (input: unknown) => appCallerIn(tx, d.w.who).sync.push(input as never);
      const records = [labor(d.w.id, d.J)];
      for (const input of [
        { protocolVersion: 2, deviceNow: new Date(), records },
        { protocolVersion: 1, deviceNow: new Date(), records: [] },
        {
          protocolVersion: 1,
          deviceNow: new Date(),
          records: Array(101).fill(records[0]),
        },
        { protocolVersion: 1, deviceNow: new Date(), records, companyId: d.companyId },
      ]) {
        expect(await rejection(call(input))).toMatchObject({ code: "BAD_REQUEST" });
      }
    });
  });
});

describe("sync.push — envelopes", () => {
  it("answers a malformed addressable record invalid_record and runs its neighbours", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const bad = labor(d.w.id, d.J, { initiatorUserId: d.foremanId });
      const unknownKind = { ...labor(d.w.id, d.J), kind: "photo" };
      const extra = { ...labor(d.w.id, d.J), companyId: d.companyId };
      const answer = await push(tx, d.w.who, [
        labor(d.w.id, d.J),
        bad,
        unknownKind,
        extra,
        receipt(d.J),
      ]);
      expect(summary(answer.results)).toEqual([
        "accepted",
        "rejected:invalid_record",
        "rejected:invalid_record",
        "rejected:invalid_record",
        "accepted",
      ]);
      expect(answer.results[2]).toMatchObject({ id: unknownKind.id, kind: null });
      expect(answer.results[1]).toMatchObject({ id: bad.id, kind: "labor_event" });
    });
  });

  it("stops before a record with no id or a version it does not know: the rest are retried", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const first = labor(d.w.id, d.J);
      const future = { ...labor(d.w.id, d.J), schemaVersion: 2 };
      const noId = { ...receipt(d.J), id: "not-a-uuid" };
      for (const blocker of [future, noId]) {
        const answer = await push(tx, d.w.who, [first, blocker, receipt(d.J)]);
        expect(answer.results.map((r) => r.id)).toEqual([first.id]);
      }
    });
  });

  it("normalizes a receipt's quantity as Postgres prints it", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const r = receipt(d.J, { quantity: "1.5" });
      await push(tx, d.w.who, [r]);
      const row = await asOwner(
        tx,
        d.companyId,
        async () => (await tx.select().from(materials).where(eq(materials.id, r.id)))[0],
      );
      expect(row?.quantity).toBe("1.500");
      // The same receipt written "1.50" is the same receipt.
      const again = await push(tx, d.w.who, [
        { ...r, payload: { ...r.payload, quantity: "1.50" } },
      ]);
      expect(summary(again.results)).toEqual(["duplicate"]);
    });
  });
});

describe("sync.push — the day as the field sends it", () => {
  it("measures skew once per push and places a skewed event at its receipt", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const ahead = new Date(Date.now() + 600_000);
      const answer = await push(tx, d.w.who, [labor(d.w.id, d.J)], ahead);
      expect(answer.clockSkewMs).toBeGreaterThan(599_000);
      expect(answer.clockSkewMs).toBeLessThan(601_000);
      expect(answer.results[0]).toMatchObject({
        ack: { clockSkewed: true, reasons: ["clock_skewed"] },
      });
      const [session] = deriveSessions(
        await asOwner(tx, d.companyId, () => readWorkerEvents(tx, d.w.id)),
        NY,
      );
      // Effective instant is the receipt, not the device's 12:00.
      expect(session!.startedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
    });
  });

  it("rejects an end whose start has not arrived, from another source; the start still lands", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const end = labor(d.w.id, d.J, {
        type: "ended",
        clientTimestamp: new Date("2026-10-05T16:00:00Z"),
      });
      expect(summary((await push(tx, d.who, [end])).results)).toEqual([
        "rejected:no_open_session",
      ]);
      expect(summary((await push(tx, d.w.who, [labor(d.w.id, d.J)])).results)).toEqual([
        "accepted",
      ]);
    });
  });

  it("answers a delegate's refusal not_permitted and goes on", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const closeout = {
        id: uuidv7(),
        kind: "closeout",
        schemaVersion: 1,
        payload: {
          jobId: d.J,
          workDate: "2026-10-05",
          jobStatus: "open",
          note: null,
          clientTimestamp: new Date(),
          reviewFingerprint: `v1.${"0".repeat(64)}`,
        },
      };
      const answer = await push(tx, d.w.who, [closeout, labor(d.w.id, d.J)]);
      expect(summary(answer.results)).toEqual(["rejected:not_permitted", "accepted"]);
    });
  });

  it("carries a two-day backlog: offline throughout, after_closeout on the day closed meanwhile", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      // Day 1 closed by the foreman while w's phone was offline: w had no session then.
      const review = await appCallerIn(tx, d.who).closeout.review({
        jobId: d.J,
        workDate: "2026-10-05",
      });
      const closeoutId = uuidv7();
      const closed = await appCallerIn(tx, d.who).closeout.submit({
        id: closeoutId,
        jobId: d.J,
        workDate: "2026-10-05",
        jobStatus: "open",
        note: null,
        clientTimestamp: new Date(),
        reviewFingerprint: review.fingerprint,
      });
      expect(closed.result).toBe("accepted");
      const snapshot = () =>
        asOwner(tx, d.companyId, async () => ({
          closeout: await tx
            .select()
            .from(dayCloseouts)
            .where(eq(dayCloseouts.id, closeoutId)),
          workers: await tx
            .select()
            .from(dayCloseoutWorkers)
            .where(eq(dayCloseoutWorkers.closeoutId, closeoutId)),
          materials: await tx
            .select()
            .from(dayCloseoutMaterials)
            .where(eq(dayCloseoutMaterials.closeoutId, closeoutId)),
        }));
      const before = await snapshot();
      const day = (date: string) => [
        labor(d.w.id, d.J, {
          clientTimestamp: new Date(`${date}T12:00:00Z`),
          capturedOffline: true,
        }),
        labor(d.w.id, d.J, {
          type: "paused",
          clientTimestamp: new Date(`${date}T15:00:00Z`),
          location: null,
          capturedOffline: true,
        }),
        labor(d.w.id, d.J, {
          type: "resumed",
          clientTimestamp: new Date(`${date}T15:30:00Z`),
          location: null,
          capturedOffline: true,
        }),
        labor(d.w.id, d.J, {
          type: "ended",
          clientTimestamp: new Date(`${date}T20:00:00Z`),
          capturedOffline: true,
        }),
        receipt(d.J, { loggedAt: new Date(`${date}T16:00:00Z`), capturedOffline: true }),
      ];
      const answer = await push(tx, d.w.who, [
        ...day("2026-10-05"),
        ...day("2026-10-06"),
      ]);
      const reasons = answer.results.map((r) =>
        r.result === "accepted" ? (r.ack as { reasons: string[] }).reasons : r,
      );
      expect(reasons).toEqual([
        ...Array(5).fill(["offline", "after_closeout"]),
        ...Array(5).fill(["offline"]),
      ]);
      // The closeout and its membership are exactly as submitted.
      expect(await snapshot()).toEqual(before);
    });
  });

  it("records a late receipt pending, then takes its correction, the closeout untouched", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const review = await appCallerIn(tx, d.who).closeout.review({
        jobId: d.J,
        workDate: "2026-10-05",
      });
      const closeout = {
        id: uuidv7(),
        kind: "closeout",
        schemaVersion: 1,
        payload: {
          jobId: d.J,
          workDate: "2026-10-05",
          jobStatus: "open",
          note: null,
          clientTimestamp: new Date(),
          reviewFingerprint: review.fingerprint,
        },
      };
      expect(summary((await push(tx, d.who, [closeout])).results)).toEqual(["accepted"]);
      const late = receipt(d.J);
      const logged = await push(tx, d.w.who, [late]);
      expect(logged.results[0]).toMatchObject({ ack: { reasons: ["after_closeout"] } });
      const correction = {
        id: uuidv7(),
        kind: "material_correction",
        schemaVersion: 1,
        payload: {
          materialId: late.id,
          correction: {
            kind: "amend",
            description: "Primer",
            quantity: "2",
            unit: "gal",
          },
          note: "Two gallons",
          clientTimestamp: new Date(),
        },
      };
      const corrected = await push(tx, d.who, [correction]);
      expect(corrected.results[0]).toMatchObject({
        result: "accepted",
        ack: { id: correction.id },
      });
      const members = await asOwner(tx, d.companyId, () =>
        tx
          .select()
          .from(dayCloseoutMaterials)
          .where(eq(dayCloseoutMaterials.closeoutId, closeout.id)),
      );
      expect(members).toEqual([]);
      // The receipt as logged stays: frozen, corrected only by its correction's approval.
      await tx.execute(sql`reset role`);
      const error = await rejection(
        tx.transaction((sp) =>
          sp
            .update(materials)
            .set({ quantity: "2.000" })
            .where(eq(materials.id, late.id)),
        ),
      );
      expect(sqlstateOf(error)).toBe("23000");
    });
  });
});

describe("pushRecords — the loop, without a database", () => {
  const records = (n: number) =>
    Array.from({ length: n }, () => ({
      id: uuidv7(),
      kind: "material",
      schemaVersion: 1,
      payload: {
        jobId: uuidv7(),
        description: "x",
        quantity: "1",
        unit: "ea",
        loggedAt: new Date(),
        capturedOffline: false,
      },
    }));
  // A runner that answers each record without running it, failing where told.
  function fakeRun(fail: Record<number, Error> = {}): RunRecord {
    let n = 0;
    return async () => {
      const i = n++;
      if (fail[i] !== undefined) throw fail[i];
      return {
        id: uuidv7(),
        kind: "material",
        result: "rejected",
        code: `r_${i}`,
      } as never;
    };
  }
  const input = (rs: unknown[]) => ({
    protocolVersion: 1 as const,
    deviceNow: new Date(),
    records: rs,
  });

  it("stops at the first thrown record, rethrowing only when nothing ran", async () => {
    const boom = new Error("transient");
    const out = await pushRecords(input(records(4)), fakeRun({ 2: boom }));
    expect(out.results.map((r) => (r.result === "rejected" ? r.code : r.result))).toEqual(
      ["r_0", "r_1"],
    );
    await expect(pushRecords(input(records(2)), fakeRun({ 0: boom }))).rejects.toBe(boom);
  });

  it("answers FORBIDDEN not_permitted and goes on; UNAUTHORIZED stops, or throws first", async () => {
    const forbidden = new TRPCError({ code: "FORBIDDEN" });
    const unauthorized = new TRPCError({ code: "UNAUTHORIZED" });
    const out = await pushRecords(input(records(3)), fakeRun({ 0: forbidden }));
    expect(out.results.map((r) => (r.result === "rejected" ? r.code : r.result))).toEqual(
      ["not_permitted", "r_1", "r_2"],
    );
    const partial = await pushRecords(input(records(3)), fakeRun({ 1: unauthorized }));
    expect(partial.results).toHaveLength(1);
    await expect(
      pushRecords(input(records(2)), fakeRun({ 0: unauthorized })),
    ).rejects.toBe(unauthorized);
  });

  it("starts no record after the budget; what is left is retried", async () => {
    let now = 0;
    const clock = () => now;
    let n = 0;
    const run: RunRecord = async () => {
      now += BUDGET_MS / 2 + 1;
      return {
        id: uuidv7(),
        kind: "material",
        result: "rejected",
        code: `r_${n++}`,
      } as never;
    };
    const out = await pushRecords(input(records(5)), run, clock);
    expect(out.results).toHaveLength(2);
  });
});
