// The locked timeline read, against Postgres. Every test runs in transactions that are always
// rolled back: a labor event can never be deleted once committed, so none ever is.
import { createDb, type Db } from "@trader/db";
import { companies, customers, jobs, users, workSessionEvents } from "@trader/db/schema";
import { DrizzleQueryError, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { Tx } from "../../src/core/context";
import { foldSessions } from "../../src/labor/fold";
import { loadWorkerTimeline, lockCompanyFieldWrites } from "../../src/labor/timeline";
import { validateEvent } from "../../src/labor/validate";
import { HOUR } from "./events";

const ROLLBACK = Symbol("rollback");
const owner = createDb();
const other = createDb();

afterAll(async () => {
  await owner.$client.end();
  await other.$client.end();
});

async function rolledBack(
  db: Db,
  body: (tx: Tx) => Promise<void>,
  config?: Parameters<Db["transaction"]>[1],
) {
  try {
    await db.transaction(async (tx) => {
      await body(tx);
      throw ROLLBACK;
    }, config);
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

// Random, like a device's: these rows share the database with concurrently running suites.
function uuidv7(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  const ms = BigInt(Date.now());
  for (let i = 0; i < 6; i++) b[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function company(tx: Tx, label: string) {
  const [c] = await tx
    .insert(companies)
    .values({ name: `Timeline ${label}`, timezone: "America/New_York" })
    .returning({ id: companies.id });
  const companyId = c!.id;
  const worker = async (n: string) =>
    (
      await tx
        .insert(users)
        .values({ companyId, email: `${n}@timeline.test`, name: n })
        .returning({ id: users.id })
    )[0]!.id;
  const [cu] = await tx
    .insert(customers)
    .values({ companyId, name: "Customer" })
    .returning({ id: customers.id });
  const [j] = await tx
    .insert(jobs)
    .values({ companyId, customerId: cu!.id, name: "Job" })
    .returning({ id: jobs.id });
  return { companyId, jobId: j!.id, worker };
}

type Refs = { companyId: string; jobId: string; workerId: string };

async function event(
  tx: Tx,
  refs: Refs,
  type: "started" | "paused" | "resumed" | "ended",
  client: string,
  server?: string,
) {
  const id = uuidv7();
  await tx.insert(workSessionEvents).values({
    id,
    companyId: refs.companyId,
    workerId: refs.workerId,
    jobId: refs.jobId,
    type,
    clientTimestamp: new Date(client),
    ...(server === undefined ? {} : { serverTimestamp: new Date(server) }),
    clockSkewed: false,
    clockSkewMs: 0,
    attestationLevel: "none",
    schemaVersion: 1,
    timeSetByUser: false,
    capturedOffline: false,
    initiatorUserId: refs.workerId,
  });
  return id;
}

async function asApp(tx: Tx, companyId?: string) {
  await tx.execute(sql`set local role trader_app`);
  if (companyId !== undefined) {
    await tx.execute(sql`select set_config('app.company_id', ${companyId}, true)`);
  }
}

// The tenant setting alone, as the owner: the locks key on it and need no rows.
async function tenantOnly(tx: Tx, companyId: string) {
  await tx.execute(sql`select set_config('app.company_id', ${companyId}, true)`);
}

async function sqlstate(run: Promise<unknown>): Promise<string | undefined> {
  try {
    await run;
  } catch (error) {
    if (error instanceof DrizzleQueryError)
      return (error.cause as { code?: string }).code;
    throw error;
  }
  throw new Error("expected the statement to fail");
}

describe("loadWorkerTimeline", () => {
  it("reads one worker's events under the tenant, and they fold", async () => {
    await rolledBack(owner, async (tx) => {
      const a = await company(tx, "A");
      const w1: Refs = {
        companyId: a.companyId,
        jobId: a.jobId,
        workerId: await a.worker("w1"),
      };
      const w2: Refs = { ...w1, workerId: await a.worker("w2") };
      await event(tx, w1, "started", "2026-10-05T12:00:00Z");
      await event(tx, w1, "paused", "2026-10-05T14:00:00Z");
      await event(tx, w1, "resumed", "2026-10-05T14:30:00Z");
      await event(tx, w1, "ended", "2026-10-05T20:00:00Z");
      await event(tx, w2, "started", "2026-10-05T12:00:00Z");

      await asApp(tx, a.companyId);
      const { events } = await loadWorkerTimeline(tx, w1.workerId);
      expect(events).toHaveLength(4);
      expect(events.every((e) => e.workerId === w1.workerId)).toBe(true);
      expect(foldSessions(events)[0]).toMatchObject({
        workedMs: 7.5 * HOUR,
        breakMs: 0.5 * HOUR,
      });
    });
  });

  it("sees no other tenant's events, and refuses to run with the tenant unset", async () => {
    await rolledBack(owner, async (tx) => {
      const a = await company(tx, "A");
      const b = await company(tx, "B");
      const wa: Refs = {
        companyId: a.companyId,
        jobId: a.jobId,
        workerId: await a.worker("a"),
      };
      const wb: Refs = {
        companyId: b.companyId,
        jobId: b.jobId,
        workerId: await b.worker("b"),
      };
      await event(tx, wa, "started", "2026-10-05T12:00:00Z");
      await event(tx, wb, "started", "2026-10-05T12:00:00Z");

      await asApp(tx);
      await expect(
        tx.transaction((sp) => loadWorkerTimeline(sp, wa.workerId)),
      ).rejects.toThrow(/requires the request's tenant/);
      await tx.execute(sql`select set_config('app.company_id', ${a.companyId}, true)`);
      expect((await loadWorkerTimeline(tx, wb.workerId)).events).toHaveLength(0);
      expect((await loadWorkerTimeline(tx, wa.workerId)).events).toHaveLength(1);
    });
  });

  it("gives a null baseline for a worker with no events", async () => {
    await rolledBack(owner, async (tx) => {
      const a = await company(tx, "A");
      const workerId = await a.worker("new");
      await asApp(tx, a.companyId);
      const t = await loadWorkerTimeline(tx, workerId);
      expect(t.baselineStamp).toBeNull();
      expect(t.receivedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
    });
  });

  it("stamps after the committed baseline even when it is later than this transaction", async () => {
    await rolledBack(owner, async (tx) => {
      const a = await company(tx, "A");
      const refs: Refs = {
        companyId: a.companyId,
        jobId: a.jobId,
        workerId: await a.worker("w"),
      };
      const { rows } = await tx.execute<{ started_ms: string }>(
        sql`select (extract(epoch from now()) * 1000)::bigint as started_ms`,
      );
      const txStart = Number(rows[0]!.started_ms);
      // What another transaction that began later and committed first would leave: a stamp
      // after this transaction's now(). Far ahead, so only the floor can pass it.
      const later = "2099-01-01T00:00:00.000Z";
      await event(tx, refs, "started", "2026-10-05T12:00:00Z", later);
      await event(tx, refs, "ended", "2026-10-05T13:00:00Z");

      await asApp(tx, a.companyId);
      const t = await loadWorkerTimeline(tx, refs.workerId);
      expect(t.baselineStamp?.toISOString()).toBe(later);
      expect(t.receivedAt.toISOString()).toBe("2099-01-01T00:00:00.001Z");
      expect(t.receivedAt.getTime()).toBeGreaterThan(txStart);
    });
  });

  it("gives validateEvent a context it accepts for a real timeline", async () => {
    await rolledBack(owner, async (tx) => {
      const a = await company(tx, "A");
      const refs: Refs = {
        companyId: a.companyId,
        jobId: a.jobId,
        workerId: await a.worker("w"),
      };
      await event(tx, refs, "started", "2026-10-05T12:00:00Z");
      await asApp(tx, a.companyId);
      const t = await loadWorkerTimeline(tx, refs.workerId);
      const ctx = { workerId: refs.workerId, ...t };
      const end = {
        id: uuidv7(),
        workerId: refs.workerId,
        jobId: refs.jobId,
        type: "ended" as const,
        clientTimestamp: new Date("2026-10-05T20:00:00Z"),
        serverTimestamp: t.receivedAt,
        clockSkewed: false,
        voidsEventId: null,
        correctsEventId: null,
      };
      expect(validateEvent(ctx, t.events, end)).toEqual({ verdict: "accepted" });
    });
  });

  it("refuses a REPEATABLE READ transaction", async () => {
    await expect(
      rolledBack(owner, (tx) => loadWorkerTimeline(tx, uuidv7()).then(() => undefined), {
        isolationLevel: "repeatable read",
      }),
    ).rejects.toThrow(/READ COMMITTED/);
  });

  it("makes a second transaction on the same worker wait, and not one on another", async () => {
    const worker = uuidv7();
    const tenant = uuidv7();
    await rolledBack(owner, async (holder) => {
      await tenantOnly(holder, tenant);
      await loadWorkerTimeline(holder, worker);
      await rolledBack(other, async (tx) => {
        await tenantOnly(tx, tenant);
        await tx.execute(sql`set local lock_timeout = '200ms'`);
        await loadWorkerTimeline(tx, uuidv7());
        expect(await sqlstate(loadWorkerTimeline(tx, worker))).toBe("55P03");
      });
    });
  });
  it("waits out a closeout's exclusive lock in its company, and not in another", async () => {
    const tenant = uuidv7();
    await rolledBack(owner, async (closeout) => {
      await tenantOnly(closeout, tenant);
      await lockCompanyFieldWrites(closeout, "exclusive");
      await rolledBack(other, async (tx) => {
        await tx.execute(sql`set local lock_timeout = '200ms'`);
        await tenantOnly(tx, tenant);
        expect(
          await sqlstate(tx.transaction((sp) => loadWorkerTimeline(sp, uuidv7()))),
        ).toBe("55P03");
        await tenantOnly(tx, uuidv7());
        await loadWorkerTimeline(tx, uuidv7());
      });
    });
  });

  it("holds a closeout off while a writer is in flight; writers share", async () => {
    const tenant = uuidv7();
    await rolledBack(owner, async (writer) => {
      await tenantOnly(writer, tenant);
      await loadWorkerTimeline(writer, uuidv7());
      await rolledBack(other, async (tx) => {
        await tx.execute(sql`set local lock_timeout = '200ms'`);
        await tenantOnly(tx, tenant);
        expect(
          await sqlstate(tx.transaction((sp) => lockCompanyFieldWrites(sp, "exclusive"))),
        ).toBe("55P03");
        await loadWorkerTimeline(tx, uuidv7());
      });
    });
  });
});
