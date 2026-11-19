// Stage 3 line 7: sync.pull (sync/pull.ts) through the application's router, against Postgres,
// in rolled-back owner transactions as trader_app under the tenant. What it must never hold:
// another worker's labor, coordinates or contact details.
import { jobs, users, workSessionEvents } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { Tx } from "../../src/core/context";
import { workDate } from "../../src/labor/work-date";
import {
  appCallerIn,
  asTenant,
  boundIn,
  workDayIn,
  ownerDb,
  rejection,
  rolledBack,
  uuidv7,
} from "../helpers";

const owner = ownerDb();
afterAll(async () => {
  await owner.$client.end();
});

const NY = "America/New_York";
const DAY = 86_400_000;

// Noon in New York, `n` calendar days before today there (16:30 UTC is noon ± DST).
function noonDaysAgo(n: number): Date {
  const today = workDate(new Date(), NY);
  const d = new Date(`${today}T16:30:00Z`);
  return new Date(d.getTime() - n * DAY);
}

async function world(tx: Tx) {
  const d = await workDayIn(tx);
  const w = await boundIn(tx, d.companyId, "worker");
  return { ...d, w };
}

// One event as the owner writes it, initiated by `by`.
async function event(
  tx: Tx,
  d: { companyId: string },
  e: {
    worker: string;
    job: string;
    type: "started" | "ended";
    at: Date;
    by?: string;
    flags?: (typeof workSessionEvents.$inferInsert)["flags"];
  },
) {
  const id = uuidv7(e.at.getTime());
  await tx.insert(workSessionEvents).values({
    id,
    companyId: d.companyId,
    workerId: e.worker,
    jobId: e.job,
    type: e.type,
    clientTimestamp: e.at,
    serverTimestamp: e.at,
    clockSkewed: false,
    clockSkewMs: 0,
    attestationLevel: "none",
    locationLat: 41.8,
    locationLng: -71.4,
    schemaVersion: 1,
    timeSetByUser: false,
    capturedOffline: false,
    initiatorUserId: e.by ?? e.worker,
    flags: e.flags ?? [],
  });
  return id;
}

async function session(
  tx: Tx,
  d: { companyId: string },
  worker: string,
  job: string,
  start: Date,
  by?: string,
) {
  const s = await event(tx, d, { worker, job, type: "started", at: start, by });
  const e = await event(tx, d, {
    worker,
    job,
    type: "ended",
    at: new Date(start.getTime() + 3_600_000),
    by,
  });
  return [s, e];
}

const pull = (tx: Tx, who: unknown) =>
  appCallerIn(tx, who).sync.pull({ protocolVersion: 1 });

describe("sync.pull — who may call", () => {
  it("answers UNAUTHORIZED without an identity and to a deactivated account; refuses protocol 2", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      await asTenant(tx, d.companyId);
      expect(await rejection(pull(tx, null))).toMatchObject({ code: "UNAUTHORIZED" });
      expect(
        await rejection(
          appCallerIn(tx, d.w.who).sync.pull({ protocolVersion: 2 } as never),
        ),
      ).toMatchObject({ code: "BAD_REQUEST" });
      await tx.execute(sql`reset role`);
      await tx
        .update(users)
        .set({ deactivatedAt: new Date() })
        .where(eq(users.id, d.w.id));
      await asTenant(tx, d.companyId);
      expect(await rejection(pull(tx, d.w.who))).toMatchObject({ code: "UNAUTHORIZED" });
    });
  });
});

describe("sync.pull — own labor only", () => {
  it("holds the caller's own sessions and events, whoever recorded them, and no one else's", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const other = await workDayIn(tx);
      const mine = await session(tx, d, d.w.id, d.J, noonDaysAgo(1));
      const byAnother = await session(tx, d, d.w.id, d.J, noonDaysAgo(2), d.userId);
      await session(tx, d, d.w1, d.J, noonDaysAgo(1));
      await session(tx, d, d.w2, d.J, noonDaysAgo(1), d.userId);
      await session(tx, other, other.w1, other.J, noonDaysAgo(1));
      await asTenant(tx, d.companyId);
      const snap = await pull(tx, d.w.who);
      expect(snap.events.map((e) => e.id).sort()).toEqual([...mine, ...byAnother].sort());
      expect(snap.sessions.map((s) => s.rootEventId).sort()).toEqual(
        [mine[0], byAnother[0]].sort(),
      );
      expect(snap.sessions[0]).toMatchObject({
        state: "ended",
        workedMs: 3_600_000,
        voided: false,
      });
      // Initiating an event for somebody makes none of it the initiator's own.
      const initiatorSnap = await pull(tx, d.who);
      expect(initiatorSnap.events).toEqual([]);
      expect(Object.keys(snap.events[0]!).sort()).toEqual(
        [
          "clientTimestamp",
          "clockSkewed",
          "correctsEventId",
          "flags",
          "id",
          "jobId",
          "serverTimestamp",
          "type",
          "voidsEventId",
        ].sort(),
      );
    });
  });

  it("keeps the last 14 days in the company's zone, and an open session whatever its age", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const in13 = await session(tx, d, d.w.id, d.J, noonDaysAgo(13));
      await session(tx, d, d.w.id, d.J, noonDaysAgo(14));
      await session(tx, d, d.w.id, d.J, noonDaysAgo(30));
      // Another worker, clocked in 20 days ago and never out.
      const v = await boundIn(tx, d.companyId, "worker");
      await session(tx, d, v.id, d.J, noonDaysAgo(25));
      const open = await event(tx, d, {
        worker: v.id,
        job: d.J,
        type: "started",
        at: noonDaysAgo(20),
      });
      await asTenant(tx, d.companyId);
      expect((await pull(tx, d.w.who)).sessions.map((s) => s.rootEventId)).toEqual([
        in13[0],
      ]);
      const snap = await pull(tx, v.who);
      expect(snap.sessions.map((s) => s.rootEventId)).toEqual([open]);
      expect(snap.sessions[0]).toMatchObject({ state: "working", endedAt: null });
      expect(snap.events.map((e) => e.id)).toEqual([open]);
    });
  });

  it("tells each event's flags, as stored with it", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const a = await event(tx, d, {
        worker: d.w.id,
        job: d.J,
        type: "started",
        at: noonDaysAgo(1),
        flags: ["offline", "unscheduled"],
      });
      const b = await event(tx, d, {
        worker: d.w.id,
        job: d.J,
        type: "ended",
        at: new Date(noonDaysAgo(1).getTime() + 3_600_000),
      });
      await asTenant(tx, d.companyId);
      const snap = await pull(tx, d.w.who);
      const flags = new Map(snap.events.map((x) => [x.id, x.flags]));
      expect([a, b].map((id) => flags.get(id))).toEqual([["offline", "unscheduled"], []]);
      // Flagged, and counted all the same.
      expect(snap.sessions[0]).toMatchObject({ state: "ended", workedMs: 3_600_000 });
    });
  });
});

describe("sync.pull — reference data", () => {
  it("lists every job that is not archived, the same for a worker and an admin", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const [j3] = await tx
        .insert(jobs)
        .values({
          companyId: d.companyId,
          customerId: d.customerId,
          name: "J3",
          status: "archived",
        })
        .returning({ id: jobs.id });
      await tx
        .update(jobs)
        .set({ locationLat: 41.8, locationLng: -71.4, locationRadiusM: 200 })
        .where(eq(jobs.id, d.J));
      await tx.update(jobs).set({ status: "complete" }).where(eq(jobs.id, d.K));
      const admin = await boundIn(tx, d.companyId, "admin");
      const other = await workDayIn(tx);
      await asTenant(tx, d.companyId);
      const jobIds = async (who: unknown) =>
        (await pull(tx, who)).jobs.map((j) => j.id).sort();
      for (const who of [d.w.who, d.who, admin.who]) {
        expect(await jobIds(who)).toEqual([d.J, d.K].sort());
        expect(await jobIds(who)).not.toContain(j3!.id);
        expect(await jobIds(who)).not.toContain(other.J);
      }
      const [job] = (await pull(tx, d.w.who)).jobs;
      expect(Object.keys(job!).sort()).toEqual(["address", "id", "name", "status"]);
    });
  });

  it("says who the caller is, by id, role and name, and their company", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      await asTenant(tx, d.companyId);
      const snap = await pull(tx, d.who);
      expect(snap.me).toEqual({ id: d.userId, role: "worker", name: "Rolled" });
      expect(snap.company).toEqual({
        name: expect.stringMatching(/^Rolled Co /),
        timezone: NY,
      });
      expect((await pull(tx, admin.who)).me).toMatchObject({
        id: admin.id,
        role: "admin",
      });
    });
  });
});
