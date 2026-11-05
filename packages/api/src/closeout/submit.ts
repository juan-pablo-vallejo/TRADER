// closeout.submit (PRD, Day closeout): a foreman's day closeout for one job and work date,
// recorded once and locked. The answers mirror a push record's (ARCHITECTURE, Sync protocol):
// `accepted` or `duplicate` (both success), or `rejected` (permanent, never retried). Anything
// thrown is retried, except the one-message UNAUTHORIZED and FORBIDDEN answers. Runs in the
// protected call's transaction; sync.push may later carry closeout records here, each in a
// transaction of its own (a push holds the field-write lock shared, and this takes it
// exclusive). Consumed by routers/closeout.ts.
import {
  dayCloseoutMaterials,
  dayCloseouts,
  dayCloseoutWorkers,
  jobs,
  materials,
} from "@trader/db/schema";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../context";
import { assertReadCommitted, lockCompanyFieldWrites } from "../labor/timeline";
import { workDate as workDateOf } from "../labor/work-date";
import type { AppUser } from "../resolve-user";
import { forbidden } from "../trpc";
import {
  dayMaterialColumns,
  gatherJobDay,
  onDayInIdOrder,
  type DayMaterial,
} from "./day";
import { lockForemanScope } from "./scope";

// Nothing names a company, a submitter, a worker or a role: those are the server's.
export const closeoutInput = z.strictObject({
  // The device's UUIDv7 (invariant 2), the same on every retry.
  id: z.uuid({ version: "v7" }),
  jobId: z.uuid(),
  workDate: z.iso.date(),
  // Hiding a job (`archived`) is the office's, never the closeout's.
  jobStatus: z.enum(["open", "complete"]),
  note: z.string().trim().min(1).max(2000).nullable(),
  clientTimestamp: z.date(),
});

export type CloseoutInput = z.infer<typeof closeoutInput>;

// The acknowledgement: immutable facts of the submission, nothing more, so a retry answers
// exactly as the first call did and needs no current authority over the job. What was
// covered is read elsewhere, under the reader's current authorization.
const acknowledgement = z.strictObject({
  id: z.uuid(),
  serverTimestamp: z.date(),
  jobStatusApplied: z.boolean(),
});

export const REJECTION_CODES = [
  // This id is already a different submission.
  "id_conflict",
  // The job and date already have a closeout under another id.
  "already_submitted",
  // A session on the job and date is not ended (a voided one included: decision D4).
  "sessions_open",
  "work_date_in_future",
] as const;

export const closeoutOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("accepted"), closeout: acknowledgement }),
  z.strictObject({ result: z.literal("duplicate"), closeout: acknowledgement }),
  z.strictObject({
    result: z.literal("rejected"),
    code: z.enum(REJECTION_CODES),
    conflictingId: z.uuid().optional(),
  }),
]);

export type CloseoutResult = z.infer<typeof closeoutOutput>;

// The deferred seal (migration 0017), fired before the procedure returns so a fault is an
// error inside the call, not at commit.
const SEAL = sql`set constraints day_closeouts_sealed, day_closeout_workers_sealed,
  day_closeout_materials_sealed immediate`;

type Prior = typeof dayCloseouts.$inferSelect;

const rejected = (
  code: (typeof REJECTION_CODES)[number],
  conflictingId?: string,
): CloseoutResult => ({
  result: "rejected",
  code,
  ...(conflictingId === undefined ? {} : { conflictingId }),
});

const ack = (result: "accepted" | "duplicate", row: Prior): CloseoutResult => ({
  result,
  closeout: {
    id: row.id,
    serverTimestamp: row.serverTimestamp,
    jobStatusApplied: row.jobStatusApplied,
  },
});

// The same submission: the same submitter and every column the device sent.
const same = (row: Prior, user: AppUser, input: CloseoutInput) =>
  row.submittedByUserId === user.id &&
  row.jobId === input.jobId &&
  row.workDate === input.workDate &&
  row.jobStatus === input.jobStatus &&
  row.note === input.note &&
  row.clientTimestamp.getTime() === input.clientTimestamp.getTime();

async function byId(tx: Tx, id: string): Promise<Prior | undefined> {
  const [row] = await tx.select().from(dayCloseouts).where(eq(dayCloseouts.id, id));
  return row;
}

// An existing row under this id: the caller's own identical submission is a duplicate; any
// other is a conflict.
const answerFor = (row: Prior, user: AppUser, input: CloseoutInput) =>
  same(row, user, input) ? ack("duplicate", row) : rejected("id_conflict");

export async function submitCloseout(
  tx: Tx,
  user: AppUser,
  input: CloseoutInput,
): Promise<CloseoutResult> {
  await assertReadCommitted(tx, "closeout.submit");

  // 1. The caller's own record first, before any role or scope check: a retry of an accepted
  // submission succeeds after the foreman is reassigned or demoted, and reveals only what the
  // caller sent and the stored facts of its own submission. Another submitter's row under
  // this id is not revealed until the caller is shown to be in scope (step 9).
  const prior = await byId(tx, input.id);
  if (prior !== undefined && prior.submittedByUserId === user.id) {
    return answerFor(prior, user, input);
  }

  // 2. The role, in the procedure rather than at the gate, so step 1 stays open to the
  // original submitter (an allowlist of one, ARCHITECTURE row 176).
  if (user.role !== "foreman") throw forbidden();

  // 3–6. Every authorization input under a lock held to commit (closeout/scope.ts): the job
  // NO KEY UPDATE, then its crew, the caller and the company's zone, which is stored with the
  // closeout.
  const scope = await lockForemanScope(tx, user, input.jobId, "no key update");
  const timeZone = scope.timeZone;

  // 8. No labor or material writer is in flight from here to commit.
  await lockCompanyFieldWrites(tx, "exclusive");

  // 9. Re-check under the locks: a concurrent call may have committed meanwhile.
  const again = await byId(tx, input.id);
  if (again !== undefined) return answerFor(again, user, input);
  const [taken] = await tx
    .select({ id: dayCloseouts.id })
    .from(dayCloseouts)
    .where(
      and(eq(dayCloseouts.jobId, input.jobId), eq(dayCloseouts.workDate, input.workDate)),
    );
  if (taken !== undefined) return rejected("already_submitted", taken.id);

  // 7. The server's clock, read after the locks: it judges the date and stamps the record,
  // after everything the closeout covers.
  const { rows } = await tx.execute<{ now_ms: string }>(
    sql`select (extract(epoch from date_trunc('milliseconds', clock_timestamp())) * 1000)::bigint as now_ms`,
  );
  const now = new Date(Number(rows[0]!.now_ms));
  if (input.workDate > workDateOf(now, timeZone)) return rejected("work_date_in_future");

  // 10. The day, from the fold.
  const day = await gatherJobDay(tx, {
    jobId: input.jobId,
    workDate: input.workDate,
    timeZone,
  });
  if (day.sessions.some((s) => !s.session.complete)) return rejected("sessions_open");

  // 11. Hold the day's materials against a concurrent edit, then judge them again as they now
  // stand: an edit that committed while this waited may have moved one off the day.
  let dayMaterials: DayMaterial[] = [];
  if (day.materials.length > 0) {
    const locked = await tx
      .select(dayMaterialColumns)
      .from(materials)
      .where(
        and(
          inArray(
            materials.id,
            day.materials.map((m) => m.id),
          ),
          eq(materials.jobId, input.jobId),
        ),
      )
      .for("share");
    dayMaterials = onDayInIdOrder(locked, input.workDate, timeZone);
  }
  const materialIds = dayMaterials.map((m) => m.id);

  // 12. A late closeout for an earlier day never overwrites a later day's status, and an
  // archived job stays archived. Fixed now, stored, and answered the same on every retry.
  const [later] = await tx
    .select({ id: dayCloseouts.id })
    .from(dayCloseouts)
    .where(
      and(eq(dayCloseouts.jobId, input.jobId), gt(dayCloseouts.workDate, input.workDate)),
    )
    .limit(1);
  const jobStatusApplied = scope.jobStatus !== "archived" && later === undefined;

  // 14. No conflict target: the primary key and the natural key both end here. Nothing comes
  // back only if a concurrent call inserted this id for another job (another job's lock).
  const [inserted] = await tx
    .insert(dayCloseouts)
    .values({
      id: input.id,
      companyId: user.companyId,
      jobId: input.jobId,
      workDate: input.workDate,
      timezone: timeZone,
      jobStatus: input.jobStatus,
      jobStatusApplied,
      note: input.note,
      submittedByUserId: user.id,
      clientTimestamp: input.clientTimestamp,
      serverTimestamp: now,
      workerMarkCount: day.workers.length,
      materialCount: materialIds.length,
    })
    .onConflictDoNothing()
    .returning();
  if (inserted === undefined) {
    const raced = await byId(tx, input.id);
    if (raced !== undefined) return answerFor(raced, user, input);
    throw new Error("closeout insert conflicted with no row under its id");
  }

  // 15. The membership, then the status, through the ORM so updated_at moves.
  if (day.workers.length > 0) {
    await tx.insert(dayCloseoutWorkers).values(
      day.workers.map((w) => ({
        companyId: user.companyId,
        closeoutId: input.id,
        workerId: w.workerId,
        ledgerThrough: w.ledgerThrough,
      })),
    );
  }
  if (materialIds.length > 0) {
    await tx.insert(dayCloseoutMaterials).values(
      materialIds.map((materialId) => ({
        companyId: user.companyId,
        closeoutId: input.id,
        jobId: input.jobId,
        materialId,
      })),
    );
  }
  if (jobStatusApplied) {
    await tx
      .update(jobs)
      .set({ status: input.jobStatus })
      .where(eq(jobs.id, input.jobId));
  }

  // 16.
  await tx.execute(SEAL);
  return ack("accepted", inserted);
}
