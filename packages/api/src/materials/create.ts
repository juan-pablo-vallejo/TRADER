// material.create (PRD, Office review and job cost: the office adds a material entry the crew
// never logged; ARCHITECTURE, Office material entries; V1-D09). An admin enters a receipt for
// any job of the company, archived included, on a calendar day. The row is a new receipt and
// nothing else: its logger is the admin who entered it and `entered_by_office` says so,
// stored, never inferred from a role. It has no device evidence, so the one approval reason
// it can carry is `after_closeout`, and every ordinary receipt rule follows from the columns
// — pending when its day is closed out, never decided by its logger (0022, approvals/
// decide.ts), frozen and correctable as a late receipt (0024). It updates no receipt, no
// closeout and no approval that exists.
//
// The office names a day, not a moment: `logged_at` is noon of that day on the wall clock of
// `companies.timezone`, a time no daylight-saving change skips or repeats, so the day reads
// back the same in the zone. A day after today in that zone is `date_in_future`.
//
// Order, as sync/material.ts for a pushed receipt: the id first, answered from its row when
// it exists; the job's row, the caller re-read as an active admin and the company's zone,
// shared (closeout/scope.ts, the admin's order); the field-write lock shared, so a closeout
// either committed before this entry (seen below, and the entry waits for approval) or
// covers it; the insert, cost included, which also answers an id committed meanwhile; its
// approval in the same transaction. No audit row: the audited set is closed (V1-D20), and
// the row itself records who entered it. Consumed by routers/material.ts.
import { approvalReason, approvals, jobs, materials } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { closedOn } from "../closeout/day";
import { lockZone } from "../closeout/scope";
import type { Tx } from "../core/context";
import { lockActiveSelf } from "../core/locks";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";
import { assertReadCommitted, lockCompanyFieldWrites } from "../labor/timeline";
import { receiptReasons } from "../sync/reasons";
import { receiptStamp } from "../sync/material";
import { costInput } from "./cost";
import { quantity } from "./quantity";

export const createInput = z.strictObject({
  // Minted by the browser and kept across retries, so a resend is answered `duplicate`.
  id: z.uuid({ version: "v7" }),
  jobId: z.uuid(),
  // The receipt's calendar day in `companies.timezone`.
  workDate: z.iso.date(),
  // The facts of a receipt, bounded as a pushed one's (sync/material.ts).
  description: z.string().trim().min(1).max(2000),
  quantity,
  unit: z.string().trim().min(1).max(40),
  // The receipt total, when the office already has it; `material.setCost` states it later.
  cost: costInput.nullable(),
});

export type CreateInput = z.infer<typeof createInput>;

const entry = z.strictObject({
  id: z.uuid(),
  loggedAt: z.date(),
  // Empty, or `after_closeout`: the entry then waits for another admin's approval.
  reasons: z.array(z.enum(approvalReason.enumValues)),
});

export const createOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.enum(["created", "duplicate"]), entry }),
  z.strictObject({
    result: z.literal("rejected"),
    code: z.enum(["id_conflict", "date_in_future"]),
  }),
]);

export type CreateResult = z.infer<typeof createOutput>;

type Prior = typeof materials.$inferSelect;

// Noon of `workDate` on the zone's wall clock, and whether that day is after the zone's
// today. In SQL, through the zone's rules; epoch milliseconds cross the driver as text.
async function placeDay(tx: Tx, workDate: string, timeZone: string) {
  const { rows } = await tx.execute<{ noon_ms: string; future: boolean }>(sql`
    select
      (extract(epoch from (${workDate}::date + time '12:00') at time zone ${timeZone})
        * 1000)::bigint as noon_ms,
      ${workDate}::date > (clock_timestamp() at time zone ${timeZone})::date as future
  `);
  const row = rows[0];
  if (row === undefined) throw new Error("no day returned");
  return { loggedAt: new Date(Number(row.noon_ms)), future: row.future };
}

async function byId(tx: Tx, id: string): Promise<Prior | undefined> {
  const [row] = await tx.select().from(materials).where(eq(materials.id, id));
  return row;
}

// The same entry: the caller's own office receipt with the job, day and facts sent. Its cost
// is not compared: the office may have restated it since (material.setCost).
const same = (row: Prior, user: AppUser, input: CreateInput, loggedAt: Date) =>
  row.enteredByOffice &&
  row.loggedByUserId === user.id &&
  row.jobId === input.jobId &&
  row.description === input.description &&
  row.quantity === input.quantity &&
  row.unit === input.unit &&
  row.loggedAt.getTime() === loggedAt.getTime();

const conflict = (): CreateResult => ({ result: "rejected", code: "id_conflict" });

async function answer(
  tx: Tx,
  result: "created" | "duplicate",
  row: Prior,
): Promise<CreateResult> {
  const [approval] = await tx
    .select({ reasons: approvals.reasons })
    .from(approvals)
    .where(eq(approvals.materialId, row.id));
  return {
    result,
    entry: { id: row.id, loggedAt: row.loggedAt, reasons: approval?.reasons ?? [] },
  };
}

export async function createMaterial(
  tx: Tx,
  user: AppUser,
  input: CreateInput,
): Promise<CreateResult> {
  await assertReadCommitted(tx, "material.create");

  // 1. The id first: an id that exists is answered from its row and nothing is written.
  // Another tenant's is invisible here and is refused by the insert below.
  const prior = await byId(tx, input.id);
  if (prior !== undefined) {
    const { loggedAt } = await placeDay(tx, input.workDate, await lockZone(tx, user));
    return same(prior, user, input, loggedAt)
      ? answer(tx, "duplicate", prior)
      : conflict();
  }

  // 2. The job, any of the company's, held against a concurrent delete; a job that is not
  // visible (another tenant's, under RLS) is the one FORBIDDEN. Then the caller, then the
  // zone.
  const [job] = await tx
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.id, input.jobId))
    .for("share");
  if (job === undefined) throw forbidden();
  await lockActiveSelf(tx, user, "admin");
  const timeZone = await lockZone(tx, user);

  // 3. The day as an instant, and never a day that has not come.
  const { loggedAt, future } = await placeDay(tx, input.workDate, timeZone);
  if (future) return { result: "rejected", code: "date_in_future" };

  // 4. The field-write lock, after the rows.
  await lockCompanyFieldWrites(tx, "shared");

  // 5. The office has no capture evidence and no clock to compare: a closeout of the job
  // for the day is the only reason there can be.
  const reasons = receiptReasons({
    capturedOffline: false,
    clockSkewed: false,
    afterCloseout: await closedOn(tx, input.jobId, loggedAt),
  });

  // 6. The row, stamped after the locks as a pushed receipt is. Nothing back is this id
  // committed meanwhile — the same entry sent twice at once, answered from its row — or
  // another tenant's row, which is `id_conflict` and says nothing more.
  const stampedAt = await receiptStamp(tx);
  const [inserted] = await tx
    .insert(materials)
    .values({
      id: input.id,
      companyId: user.companyId,
      jobId: input.jobId,
      loggedByUserId: user.id,
      description: input.description,
      quantity: input.quantity,
      unit: input.unit,
      costCents: input.cost?.cents ?? null,
      currency: input.cost?.currency ?? null,
      loggedAt,
      capturedOffline: false,
      clockSkewed: false,
      clockSkewMs: 0,
      enteredByOffice: true,
      createdAt: stampedAt,
      updatedAt: stampedAt,
    })
    .onConflictDoNothing({ target: materials.id })
    .returning();
  if (inserted === undefined) {
    const raced = await byId(tx, input.id);
    return raced !== undefined && same(raced, user, input, loggedAt)
      ? answer(tx, "duplicate", raced)
      : conflict();
  }

  // 7. Its approval, pending, in the same transaction.
  if (reasons.length > 0) {
    await tx
      .insert(approvals)
      .values({ companyId: user.companyId, materialId: input.id, reasons });
  }
  return answer(tx, "created", inserted);
}
