// The authoritative read for validation: one worker's whole ledger, locked against every other
// writer for that worker until the transaction ends. Every writer of labor events follows one
// path — loadWorkerTimeline, validateEvent, insert, commit — in one transaction, so two
// concurrent pushes for a worker cannot each validate against a timeline missing the other.
// Consumed by sync.push (Stage 3) and every later writer of labor events, and — for the
// company-wide lock — by closeout.submit.
import { workSessionEvents } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";

import type { Tx } from "../context";
import type { LaborEvent } from "./fold";

export type WorkerTimeline = {
  events: LaborEvent[];
  // The newest receipt stamp committed for the worker, or null for a worker with no events.
  baselineStamp: Date | null;
  // The receipt stamp this transaction writes, explicitly, on every event it accepts for the
  // worker (decision D6). Read after the lock and floored at baseline + 1 ms, so a worker's
  // stamps rise in acceptance order even when this transaction began before one that
  // committed first (now() is transaction start) or the clock steps back.
  receivedAt: Date;
};

// The company's field-write lock. Every writer of field records takes it shared — labor
// through loadWorkerTimeline, materials in their own writers — and the day closeout takes it
// exclusive, so a closeout reads a company's labor and materials with no writer in flight: a
// record either committed before the closeout's read or is written after its commit, and then
// sees the closeout. Shared holders never block each other. Lock order: a transaction takes
// any row locks it needs on jobs, crews, users or companies before this lock and none after
// it (foreign-key checks take KEY SHARE, which no closeout lock conflicts with). Keyed on the
// request's tenant, so it fails closed without one: a NULL key would lock nothing.
export async function lockCompanyFieldWrites(
  tx: Tx,
  mode: "shared" | "exclusive",
): Promise<string> {
  const { rows } = await tx.execute<{ company_id: string | null }>(
    sql`select public.app_company_id() as company_id`,
  );
  const companyId = rows[0]?.company_id ?? null;
  if (companyId === null)
    throw new Error("the field-write lock requires the request's tenant");
  // A key space of its own: the prefix keeps it from ever equalling a worker's key.
  const key = sql`hashtextextended(${`field-writes:${companyId}`}, 0)`;
  await tx.execute(
    mode === "shared"
      ? sql`select pg_advisory_xact_lock_shared(${key})`
      : sql`select pg_advisory_xact_lock(${key})`,
  );
  return companyId;
}

export async function loadWorkerTimeline(
  tx: Tx,
  workerId: string,
): Promise<WorkerTimeline> {
  // READ COMMITTED takes a snapshot per statement, so the select below, issued after the lock,
  // sees everything the previous holder committed. A REPEATABLE READ snapshot predates it.
  const { rows: isolation } = await tx.execute<{ level: string }>(
    sql`select current_setting('transaction_isolation') as level`,
  );
  if (isolation[0]?.level !== "read committed") {
    throw new Error("loadWorkerTimeline requires a READ COMMITTED transaction");
  }

  // Shared, before the worker's lock (the order every writer follows): a closeout holding it
  // exclusive is waited out, and this writer is never part of a closeout's read.
  await lockCompanyFieldWrites(tx, "shared");

  // Its own statement, before the read. A transaction-level advisory lock needs no grant and
  // ends with the transaction; a hash collision between two workers only serializes them.
  // The cast canonicalizes the uuid, so one worker always maps to one key.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${workerId}::uuid::text, 0))`,
  );

  // Row-level security confines this to the request's tenant.
  const events = await tx
    .select({
      id: workSessionEvents.id,
      workerId: workSessionEvents.workerId,
      jobId: workSessionEvents.jobId,
      type: workSessionEvents.type,
      clientTimestamp: workSessionEvents.clientTimestamp,
      serverTimestamp: workSessionEvents.serverTimestamp,
      clockSkewed: workSessionEvents.clockSkewed,
      voidsEventId: workSessionEvents.voidsEventId,
      correctsEventId: workSessionEvents.correctsEventId,
    })
    .from(workSessionEvents)
    .where(eq(workSessionEvents.workerId, workerId));

  const newest = Math.max(...events.map((e) => e.serverTimestamp.getTime()));
  const baselineStamp = events.length > 0 ? new Date(newest) : null;

  // greatest() ignores the NULL a worker with no events gives. Epoch milliseconds, so no
  // text format crosses the driver; the column holds milliseconds (precision 3).
  const { rows: stamp } = await tx.execute<{ received_ms: string }>(sql`
    select (extract(epoch from date_trunc('milliseconds', greatest(
      clock_timestamp(),
      ${baselineStamp?.toISOString() ?? null}::timestamptz + interval '1 millisecond'
    ))) * 1000)::bigint as received_ms
  `);
  const received = stamp[0]?.received_ms;
  if (received === undefined) throw new Error("no receipt stamp returned");

  return { events, baselineStamp, receivedAt: new Date(Number(received)) };
}
