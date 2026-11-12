// Stage 3 line 7: one original receipt from a push (sync/material.ts), against Postgres, in
// rolled-back owner transactions with each record in a savepoint as trader_app (see
// sync/labor.test.ts). Commit independence is the real-commit suite's.
import {
  approvals,
  companies,
  crewMembers,
  dayCloseouts,
  jobs,
  materials,
  users,
} from "@trader/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { Tx } from "../../src/core/context";
import { lockCompanyFieldWrites } from "../../src/labor/timeline";
import { setMaterialCost } from "../../src/materials/cost";
import type { AppUser } from "../../src/core/resolve-user";
import {
  materialPayloadV1,
  pushMaterial,
  type MaterialRecord,
} from "../../src/sync/material";
import { measureSkew } from "../../src/sync/reasons";
import {
  asTenant,
  boundIn,
  committedCrewDay,
  companyIn,
  crewDayIn,
  ownerDb,
  rejection,
  rolledBack,
  sqlstateOf,
  uuidv7,
  type CrewDay,
} from "../helpers";

const owner = ownerDb();
afterAll(async () => {
  await owner.$client.end();
});

const NOW = new Date();
const ONLINE = measureSkew(NOW, NOW);
const SKEWED = measureSkew(new Date(NOW.getTime() - 600_000), NOW);
const NY = "America/New_York";

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
});

type Payload = MaterialRecord["payload"];

const record = (o: Partial<Payload> & Pick<Payload, "jobId">, id = uuidv7()) => ({
  id,
  schemaVersion: 1,
  payload: {
    description: "Eggshell, white",
    quantity: "2.500",
    unit: "gal",
    loggedAt: new Date("2026-10-05T15:00:00Z"),
    capturedOffline: false,
    ...o,
  },
});

const push = (tx: Tx, user: AppUser, r: MaterialRecord, skew = ONLINE) =>
  tx.transaction((sp) => pushMaterial(sp, user, r, skew));

async function asOwner<T>(tx: Tx, d: { companyId: string }, body: () => Promise<T>) {
  await tx.execute(sql`reset role`);
  const result = await body();
  await asTenant(tx, d.companyId);
  return result;
}

async function dayFor(tx: Tx) {
  const d = await crewDayIn(tx);
  await asTenant(tx, d.companyId);
  return {
    d,
    w1: appUser(d, d.w1, "worker"),
    foreman: appUser(d, d.foremanId, "foreman"),
  };
}

const rowsOf = (tx: Tx, d: CrewDay) =>
  asOwner(tx, d, async () => ({
    materials: (
      await tx.select().from(materials).where(eq(materials.companyId, d.companyId))
    ).length,
    approvals: (
      await tx.select().from(approvals).where(eq(approvals.companyId, d.companyId))
    ).length,
  }));

async function closeout(tx: Tx, d: CrewDay, workDate: string, zone: string) {
  await asOwner(tx, d, () =>
    tx.insert(dayCloseouts).values({
      id: uuidv7(),
      companyId: d.companyId,
      jobId: d.J,
      workDate,
      timezone: zone,
      jobStatus: "open",
      jobStatusApplied: true,
      submittedByUserId: d.foremanId,
      clientTimestamp: new Date(),
      serverTimestamp: new Date(),
      workerMarkCount: 0,
      materialCount: 0,
    }),
  );
}

describe("sync.push receipt — recording", () => {
  it("stores the receipt as sent, logged by the caller, with no cost and the push's skew", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const r = record({ jobId: d.J });
      const answer = await push(tx, w1, r, SKEWED);
      const row = await asOwner(
        tx,
        d,
        async () => (await tx.select().from(materials).where(eq(materials.id, r.id)))[0],
      );
      expect(row).toMatchObject({
        companyId: d.companyId,
        jobId: d.J,
        loggedByUserId: d.w1,
        description: "Eggshell, white",
        quantity: "2.500",
        unit: "gal",
        costCents: null,
        currency: null,
        capturedOffline: false,
        clockSkewed: true,
        clockSkewMs: -600_000,
      });
      expect(answer).toEqual({
        result: "accepted",
        ack: {
          id: r.id,
          receivedAt: row!.createdAt,
          clockSkewed: true,
          reasons: ["clock_skewed"],
        },
      });
      expect(await rowsOf(tx, d)).toEqual({ materials: 1, approvals: 1 });
    });
  });

  it("writes no approval for a clean receipt, and offline from capture evidence", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      expect(await push(tx, w1, record({ jobId: d.J }))).toMatchObject({
        ack: { reasons: [] },
      });
      const offline = record({ jobId: d.J, capturedOffline: true });
      expect(await push(tx, w1, offline)).toMatchObject({
        ack: { reasons: ["offline"] },
      });
      const row = await asOwner(
        tx,
        d,
        async () =>
          (
            await tx.select().from(approvals).where(eq(approvals.materialId, offline.id))
          )[0],
      );
      expect(row).toMatchObject({ reasons: ["offline"], decision: null, eventId: null });
    });
  });
});

describe("sync.push receipt — after its day's closeout, in the closeout's stored zone", () => {
  const cases: [
    string,
    { date: string; zone: string; at: string; company: string; late: boolean },
  ][] = [
    [
      "zone changed since",
      {
        date: "2026-11-02",
        zone: NY,
        at: "2026-11-03T02:00:00Z",
        company: "UTC",
        late: true,
      },
    ],
    [
      "the converse",
      {
        date: "2026-11-03",
        zone: "UTC",
        at: "2026-11-03T02:00:00Z",
        company: NY,
        late: true,
      },
    ],
    [
      "last second of the day, EDT",
      {
        date: "2026-10-31",
        zone: NY,
        at: "2026-11-01T03:59:59Z",
        company: NY,
        late: true,
      },
    ],
    [
      "first second of the next day",
      {
        date: "2026-10-31",
        zone: NY,
        at: "2026-11-01T04:00:00Z",
        company: NY,
        late: false,
      },
    ],
    [
      "evening of the fall-back day",
      {
        date: "2026-11-01",
        zone: NY,
        at: "2026-11-02T04:30:00Z",
        company: NY,
        late: true,
      },
    ],
    [
      "evening of the spring-forward day",
      {
        date: "2026-03-08",
        zone: NY,
        at: "2026-03-09T03:30:00Z",
        company: NY,
        late: true,
      },
    ],
  ];
  for (const [name, c] of cases) {
    it(`${name}: ${c.late ? "after_closeout" : "no reason"}`, async () => {
      await rolledBack(owner, async (tx) => {
        const { d, w1 } = await dayFor(tx);
        await closeout(tx, d, c.date, c.zone);
        await asOwner(tx, d, () =>
          tx
            .update(companies)
            .set({ timezone: c.company })
            .where(eq(companies.id, d.companyId)),
        );
        expect(
          await push(tx, w1, record({ jobId: d.J, loggedAt: new Date(c.at) })),
        ).toMatchObject({
          result: "accepted",
          ack: { reasons: c.late ? ["after_closeout"] : [] },
        });
      });
    });
  }
});

describe("sync.push receipt — who may log", () => {
  it("lets a worker log on their crew's jobs only, never an archived one", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      expect(await push(tx, w1, record({ jobId: d.K }))).toEqual({
        result: "rejected",
        code: "not_permitted",
      });
      await asOwner(tx, d, () =>
        tx.update(jobs).set({ status: "archived" }).where(eq(jobs.id, d.J)),
      );
      expect(await push(tx, w1, record({ jobId: d.J }))).toMatchObject({
        code: "not_permitted",
      });
      expect(await rowsOf(tx, d)).toEqual({ materials: 0, approvals: 0 });
    });
  });

  it("lets a lead log without a member row, and an admin on any job", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, foreman } = await dayFor(tx);
      await asOwner(tx, d, () =>
        tx
          .delete(crewMembers)
          .where(
            and(eq(crewMembers.crewId, d.crewId), eq(crewMembers.userId, d.foremanId)),
          ),
      );
      expect((await push(tx, foreman, record({ jobId: d.J }))).result).toBe("accepted");
      const a = await asOwner(tx, d, () => boundIn(tx, d.companyId, "admin"));
      expect(
        (await push(tx, appUser(d, a.id, "admin"), record({ jobId: d.K }))).result,
      ).toBe("accepted");
    });
  });

  it("sees no other tenant's job, and answers UNAUTHORIZED to a deactivated caller", async () => {
    await rolledBack(owner, async (tx) => {
      const other = await crewDayIn(tx);
      const { d, w1 } = await dayFor(tx);
      expect(await push(tx, w1, record({ jobId: other.J }))).toMatchObject({
        code: "not_permitted",
      });
      await asOwner(tx, d, () =>
        tx.update(users).set({ deactivatedAt: new Date() }).where(eq(users.id, d.w1)),
      );
      expect(await rejection(push(tx, w1, record({ jobId: d.J })))).toMatchObject({
        code: "UNAUTHORIZED",
      });
      expect(await rowsOf(tx, d)).toEqual({ materials: 0, approvals: 0 });
    });
  });
});

describe("sync.push receipt — idempotency", () => {
  it("answers an identical retry duplicate, also after the logger left the crew", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const r = record({ jobId: d.J, capturedOffline: true });
      const first = await push(tx, w1, r);
      await asOwner(tx, d, () =>
        tx
          .delete(crewMembers)
          .where(and(eq(crewMembers.crewId, d.crewId), eq(crewMembers.userId, d.w1))),
      );
      expect(await push(tx, w1, r, SKEWED)).toEqual({ ...first, result: "duplicate" });
      expect(await rowsOf(tx, d)).toEqual({ materials: 1, approvals: 1 });
    });
  });

  it("answers a retry duplicate after the office priced the receipt, the cost kept", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const r = record({ jobId: d.J });
      const first = await push(tx, w1, r);
      const admin = await asOwner(tx, d, () => boundIn(tx, d.companyId, "admin"));
      await tx.transaction((sp) =>
        setMaterialCost(sp, appUser(d, admin.id, "admin"), {
          materialId: r.id,
          cost: { cents: 8999, currency: "USD" },
        }),
      );
      // Cost is not a fact the device sent: the same receipt, and nothing overwritten.
      expect(await push(tx, w1, r)).toEqual({ ...first, result: "duplicate" });
      const [row] = await tx
        .select({ costCents: materials.costCents, currency: materials.currency })
        .from(materials)
        .where(eq(materials.id, r.id));
      expect(row).toEqual({ costCents: 8999, currency: "USD" });
    });
  });

  it("answers id_conflict for any device fact that differs", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const r = record({ jobId: d.J });
      await push(tx, w1, r);
      const variants: Partial<Payload>[] = [
        { jobId: d.K },
        { description: "Flat" },
        { quantity: "2.501" },
        { unit: "qt" },
        { loggedAt: new Date("2026-10-05T15:00:00.001Z") },
        { capturedOffline: true },
      ];
      for (const v of variants) {
        expect(await push(tx, w1, { ...r, payload: { ...r.payload, ...v } })).toEqual({
          result: "rejected",
          code: "id_conflict",
        });
      }
      expect(await rowsOf(tx, d)).toEqual({ materials: 1, approvals: 0 });
    });
  });

  it("answers another logger's id as id_conflict in scope, not_permitted outside it", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1, foreman } = await dayFor(tx);
      const r = record({ jobId: d.J });
      expect((await push(tx, foreman, r)).result).toBe("accepted");
      expect(await push(tx, w1, r)).toEqual({ result: "rejected", code: "id_conflict" });
      expect(await push(tx, w1, { ...r, payload: { ...r.payload, jobId: d.K } })).toEqual(
        {
          result: "rejected",
          code: "not_permitted",
        },
      );
    });
  });

  it("answers an id another tenant holds as id_conflict, revealing nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const other = await companyIn(tx);
      const job = (
        await tx
          .insert(jobs)
          .values({ companyId: other.companyId, customerId: other.customerId, name: "X" })
          .returning({ id: jobs.id })
      )[0]!.id;
      const id = uuidv7();
      await tx.insert(materials).values({
        id,
        companyId: other.companyId,
        jobId: job,
        loggedByUserId: other.userId,
        description: "Theirs",
        quantity: "1.000",
        unit: "ea",
        loggedAt: new Date(),
        capturedOffline: false,
        clockSkewed: false,
        clockSkewMs: 0,
        enteredByOffice: false,
      });
      const { d, w1 } = await dayFor(tx);
      expect(await push(tx, w1, record({ jobId: d.J }, id))).toEqual({
        result: "rejected",
        code: "id_conflict",
      });
      expect(await rowsOf(tx, d)).toEqual({ materials: 0, approvals: 0 });
    });
  });
});

describe("sync.push receipt — provenance", () => {
  it("has no key by which a device could claim an office entry", () => {
    const { payload } = record({ jobId: uuidv7() });
    expect(materialPayloadV1.safeParse(payload).success).toBe(true);
    expect(
      materialPayloadV1.safeParse({ ...payload, enteredByOffice: true }).success,
    ).toBe(false);
  });

  it("stores an admin's own push as a device's receipt", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      await asTenant(tx, d.companyId);
      const r = record({ jobId: d.J });
      expect((await push(tx, appUser(d, admin.id, "admin"), r)).result).toBe("accepted");
      const row = await asOwner(
        tx,
        d,
        async () => (await tx.select().from(materials).where(eq(materials.id, r.id)))[0],
      );
      expect(row?.enteredByOffice).toBe(false);
    });
  });

  it("answers a replay of the caller's own office entry as id_conflict and leaves it", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      const r = record({ jobId: d.J });
      await tx.insert(materials).values({
        id: r.id,
        companyId: d.companyId,
        jobId: d.J,
        loggedByUserId: admin.id,
        description: r.payload.description,
        quantity: r.payload.quantity,
        unit: r.payload.unit,
        loggedAt: r.payload.loggedAt,
        capturedOffline: false,
        clockSkewed: false,
        clockSkewMs: 0,
        enteredByOffice: true,
      });
      await asTenant(tx, d.companyId);
      expect(await push(tx, appUser(d, admin.id, "admin"), r)).toEqual({
        result: "rejected",
        code: "id_conflict",
      });
      const row = await asOwner(
        tx,
        d,
        async () => (await tx.select().from(materials).where(eq(materials.id, r.id)))[0],
      );
      expect(row?.enteredByOffice).toBe(true);
    });
  });
});

describe("sync.push receipt — the field-write lock", () => {
  it("waits out a closeout's exclusive lock, after its scope rows", async () => {
    const { day: d, cleanup } = await committedCrewDay(owner);
    const other = ownerDb();
    try {
      await rolledBack(owner, async (closeout) => {
        await closeout.execute(
          sql`select set_config('app.company_id', ${d.companyId}, true)`,
        );
        await lockCompanyFieldWrites(closeout, "exclusive");
        await rolledBack(other, async (tx) => {
          await asTenant(tx, d.companyId);
          await tx.execute(sql`set local lock_timeout = '200ms'`);
          const error = await rejection(
            push(tx, appUser(d, d.w1, "worker"), record({ jobId: d.J })),
          );
          expect(sqlstateOf(error)).toBe("55P03");
        });
      });
    } finally {
      await other.$client.end();
      await cleanup();
    }
  });
});
