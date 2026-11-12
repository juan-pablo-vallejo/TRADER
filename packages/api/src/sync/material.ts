// One original receipt from a push (PRD, Materials and photos; ARCHITECTURE, original receipts
// as approval subjects), in the record's own transaction: the caller's own id first; the scope
// under row locks; the company's field-write lock shared, so a closeout either committed before
// this record (seen below) or covers it; the id again; the approval facts; the insert and, in
// the same transaction, its approval. No cost: the office fills it in later. Answers as
// sync/labor.ts does. Consumed by sync/push.ts; a receipt the office enters itself is
// materials/create.ts.
import { approvalReason, approvals, materials } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import { instant } from "../core/instant";
import { closedOn } from "../closeout/day";
import { assertReadCommitted, lockCompanyFieldWrites } from "../labor/timeline";
import { quantity } from "../materials/quantity";
import type { AppUser } from "../core/resolve-user";
import { receiptReasons, type Skew } from "./reasons";
import { lockPushScope, mayLogReceipt } from "./scope";

// Schema version 1 of a receipt's payload. The logger is the caller; nothing names a company,
// a cost, a stamp, an approval or a provenance: a pushed receipt is a device's.
export const materialPayloadV1 = z.strictObject({
  jobId: z.uuid(),
  description: z.string().trim().min(1).max(2000),
  quantity,
  unit: z.string().trim().min(1).max(40),
  loggedAt: instant,
  capturedOffline: z.boolean(),
});

export type MaterialPayload = z.infer<typeof materialPayloadV1>;

export type MaterialRecord = {
  id: string;
  schemaVersion: number;
  payload: MaterialPayload;
};

export const materialAck = z.strictObject({
  id: z.uuid(),
  receivedAt: z.date(),
  clockSkewed: z.boolean(),
  reasons: z.array(z.enum(approvalReason.enumValues)),
});

export type MaterialResult =
  | { result: "accepted" | "duplicate"; ack: z.infer<typeof materialAck> }
  | { result: "rejected"; code: "id_conflict" | "not_permitted" };

type Prior = typeof materials.$inferSelect;

// The same receipt: the caller as logger and every fact the device fixed. A receipt row has no
// schema version (the version is an envelope's, upcast before this), so a re-encoded retry
// with equal facts is the same receipt; the device never re-encodes its outbox. A receipt the
// office entered is never a device's, whatever id and facts a push replays.
const same = (row: Prior, user: AppUser, p: MaterialPayload) =>
  !row.enteredByOffice &&
  row.loggedByUserId === user.id &&
  row.jobId === p.jobId &&
  row.description === p.description &&
  row.quantity === p.quantity &&
  row.unit === p.unit &&
  row.loggedAt.getTime() === p.loggedAt.getTime() &&
  row.capturedOffline === p.capturedOffline;

async function byId(tx: Tx, id: string): Promise<Prior | undefined> {
  const [row] = await tx.select().from(materials).where(eq(materials.id, id));
  return row;
}

async function ack(
  tx: Tx,
  result: "accepted" | "duplicate",
  row: Prior,
): Promise<MaterialResult> {
  const [approval] = await tx
    .select({ reasons: approvals.reasons })
    .from(approvals)
    .where(eq(approvals.materialId, row.id));
  return {
    result,
    ack: {
      id: row.id,
      receivedAt: row.createdAt,
      clockSkewed: row.clockSkewed,
      reasons: approval?.reasons ?? [],
    },
  };
}

const conflict = (): MaterialResult => ({ result: "rejected", code: "id_conflict" });

const answerFor = (tx: Tx, row: Prior, user: AppUser, p: MaterialPayload) =>
  same(row, user, p) ? ack(tx, "duplicate", row) : Promise.resolve(conflict());

// A receipt's server stamp, read once, after the locks, and written to both created_at and
// updated_at: their default is now(), the transaction's start, which precedes a closeout the
// writer waited behind. As text, so the microseconds survive the round trip. Also consumed
// by materials/create.ts.
export async function receiptStamp(tx: Tx) {
  const { rows: clock } = await tx.execute<{ at: string }>(
    sql`select clock_timestamp()::text as at`,
  );
  return sql`${clock[0]!.at}::timestamptz`;
}

export async function pushMaterial(
  tx: Tx,
  user: AppUser,
  r: MaterialRecord,
  skew: Skew,
): Promise<MaterialResult> {
  await assertReadCommitted(tx, "sync.push");
  const p = r.payload;

  // 1. The caller's own receipt first, before any scope check.
  const prior = await byId(tx, r.id);
  if (prior !== undefined && prior.loggedByUserId === user.id) {
    return answerFor(tx, prior, user, p);
  }

  // 2. Authority from rows locked now, then 3. the field-write lock, after them (row 193).
  const scope = await lockPushScope(tx, user, p.jobId, user.id);
  if (!mayLogReceipt(scope, user)) return { result: "rejected", code: "not_permitted" };
  await lockCompanyFieldWrites(tx, "shared");

  // 4. Again: a concurrent push of this id may have committed meanwhile.
  const again = await byId(tx, r.id);
  if (again !== undefined) {
    return again.loggedByUserId === user.id ? answerFor(tx, again, user, p) : conflict();
  }

  // 5. A closeout of the receipt's job for its date, the date in that closeout's stored zone
  // (device time is business time: a material's day is its logged_at's, closeout/day.ts).
  const reasons = receiptReasons({
    capturedOffline: p.capturedOffline,
    clockSkewed: skew.clockSkewed,
    afterCloseout: await closedOn(tx, p.jobId, p.loggedAt),
  });

  const stampedAt = await receiptStamp(tx);

  // 6. As in sync/labor.ts: nothing back is a concurrent commit of this id, or another
  // tenant's row, which is `id_conflict` and says nothing more.
  const [inserted] = await tx
    .insert(materials)
    .values({
      id: r.id,
      companyId: user.companyId,
      jobId: p.jobId,
      loggedByUserId: user.id,
      description: p.description,
      quantity: p.quantity,
      unit: p.unit,
      loggedAt: p.loggedAt,
      capturedOffline: p.capturedOffline,
      clockSkewed: skew.clockSkewed,
      clockSkewMs: skew.clockSkewMs,
      enteredByOffice: false,
      createdAt: stampedAt,
      updatedAt: stampedAt,
    })
    .onConflictDoNothing()
    .returning();
  if (inserted === undefined) {
    const raced = await byId(tx, r.id);
    return raced !== undefined && raced.loggedByUserId === user.id
      ? answerFor(tx, raced, user, p)
      : conflict();
  }

  // 7. Its approval, pending, in the same transaction (0022 requires the column-derived
  // reasons at commit).
  if (reasons.length > 0) {
    await tx
      .insert(approvals)
      .values({ companyId: user.companyId, materialId: r.id, reasons });
  }
  return ack(tx, "accepted", inserted);
}
