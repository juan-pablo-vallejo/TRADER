// material.correct (PRD, Day closeout: a submitted closeout is locked; later changes are
// correcting entries that go through approval). An admin, or the foreman of the job's current
// crew, corrects a material a committed closeout covers, or a receipt that arrived after its
// day's closeout: an `amend` replaces its description, quantity and unit together, a `void`
// takes it out of effect. The receipt itself is never written (migrations 0018 and 0024 freeze
// it); the correction is an append-only row naming it, with a
// pending approval written in the same transaction. Answers mirror a push record's: `accepted`
// or `duplicate` (both success), or `rejected`, which writes nothing, so the same id sent again
// later is judged afresh. Anything thrown is retried, except the one-message UNAUTHORIZED and
// FORBIDDEN. sync.push may later carry corrections here, each in a transaction of its own: this
// takes row locks before the field-write lock, which a push batch already holds. Consumed by
// routers/material.ts.
import {
  approvals,
  dayCloseoutMaterials,
  materialCorrections,
  materials,
} from "@trader/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { closedOn } from "../closeout/day";
import { lockForemanScope } from "../closeout/scope";
import { serverClock } from "../core/clock";
import { lockActiveSelf } from "../core/locks";
import type { Tx } from "../core/context";
import { instant } from "../core/instant";
import { assertReadCommitted, lockCompanyFieldWrites } from "../labor/timeline";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";
import { effectiveMaterial, type CorrectionState } from "./effective";
import { quantity } from "./quantity";

// Nothing names a company, a job, a submitter or a role: those are the server's. The job is the
// material's own, read under lock.
export const correctionInput = z.strictObject({
  // The device's UUIDv7 (invariant 2), the same on every retry.
  id: z.uuid({ version: "v7" }),
  materialId: z.uuid(),
  correction: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("amend"),
      description: z.string().trim().min(1).max(2000),
      quantity,
      unit: z.string().trim().min(1).max(40),
    }),
    z.strictObject({ kind: z.literal("void") }),
  ]),
  note: z.string().trim().min(1).max(2000).nullable(),
  clientTimestamp: instant,
});

export type CorrectionInput = z.infer<typeof correctionInput>;

// The acknowledgement: immutable facts of the correction only, so a retry answers exactly as
// the first call did.
export const correctionAcknowledgement = z.strictObject({
  id: z.uuid(),
  serverTimestamp: z.date(),
});

export const REJECTION_CODES = [
  // This id is already a different correction.
  "id_conflict",
  // The material's job has a closeout for the material's date that does not cover it, and
  // the receipt has no after-closeout approval. Permanent with respect to that sealed closeout —
  // membership is sealed, one closeout per job and date — so no automatic retry of this id;
  // the device keeps it recoverable. Since sync.push, every receipt recorded on a closed day
  // carries that approval and is corrected (step 7), so only a receipt written otherwise
  // lands here.
  "not_in_closeout",
  // No closeout for the material's job and date yet. Nothing is written; the same id may be
  // sent again once the closeout has committed.
  "closeout_pending",
  // Another correction of the material awaits a decision (conflictingId). Sent again after it.
  "correction_pending",
  // An approved void took the material out of effect for good.
  "material_voided",
  // The amend equals the material's effective facts.
  "no_change",
] as const;

export const correctionOutput = z.discriminatedUnion("result", [
  z.strictObject({
    result: z.literal("accepted"),
    correction: correctionAcknowledgement,
  }),
  z.strictObject({
    result: z.literal("duplicate"),
    correction: correctionAcknowledgement,
  }),
  z.strictObject({
    result: z.literal("rejected"),
    code: z.enum(REJECTION_CODES),
    conflictingId: z.uuid().optional(),
  }),
]);

export type CorrectionResult = z.infer<typeof correctionOutput>;

// The deferred approval requirement (migration 0020), fired before the procedure returns, then
// deferred again: IMMEDIATE lasts to the transaction's end, and a later correction in the same
// transaction is inserted before its approval.
const APPROVED = sql`set constraints material_corrections_approved immediate`;
const DEFERRED = sql`set constraints material_corrections_approved deferred`;

type Prior = typeof materialCorrections.$inferSelect;

const rejected = (
  code: (typeof REJECTION_CODES)[number],
  conflictingId?: string,
): CorrectionResult => ({
  result: "rejected",
  code,
  ...(conflictingId === undefined ? {} : { conflictingId }),
});

const ack = (result: "accepted" | "duplicate", row: Prior): CorrectionResult => ({
  result,
  correction: { id: row.id, serverTimestamp: row.serverTimestamp },
});

// The columns the input fixes, as stored.
const stored = (input: CorrectionInput) =>
  input.correction.kind === "amend"
    ? {
        kind: "amend" as const,
        description: input.correction.description,
        quantity: input.correction.quantity,
        unit: input.correction.unit,
      }
    : { kind: "void" as const, description: null, quantity: null, unit: null };

// The same correction: the same submitter and every stored field the device sent.
const same = (row: Prior, user: AppUser, input: CorrectionInput) => {
  const s = stored(input);
  return (
    row.submittedByUserId === user.id &&
    row.materialId === input.materialId &&
    row.kind === s.kind &&
    row.description === s.description &&
    row.quantity === s.quantity &&
    row.unit === s.unit &&
    row.note === input.note &&
    row.clientTimestamp.getTime() === input.clientTimestamp.getTime()
  );
};

const answerFor = (row: Prior, user: AppUser, input: CorrectionInput) =>
  same(row, user, input) ? ack("duplicate", row) : rejected("id_conflict");

async function byId(tx: Tx, id: string): Promise<Prior | undefined> {
  const [row] = await tx
    .select()
    .from(materialCorrections)
    .where(eq(materialCorrections.id, id));
  return row;
}

const materialFacts = {
  jobId: materials.jobId,
  loggedAt: materials.loggedAt,
  description: materials.description,
  quantity: materials.quantity,
  unit: materials.unit,
};

export async function correctMaterial(
  tx: Tx,
  user: AppUser,
  input: CorrectionInput,
): Promise<CorrectionResult> {
  await assertReadCommitted(tx, "material.correct");

  // 1. The caller's own record first, before any role or scope check: a retry of an accepted
  // correction succeeds after the caller is reassigned or demoted, and reveals only what the
  // caller sent. Another submitter's row is not revealed until the caller is in scope (step 6).
  const prior = await byId(tx, input.id);
  if (prior !== undefined && prior.submittedByUserId === user.id) {
    return answerFor(prior, user, input);
  }

  // 2. Checked here rather than at a gate, so step 1 stays open to the original submitter.
  if (user.role !== "admin" && user.role !== "foreman") throw forbidden();

  // 3. The material, unlocked, for its job. One FORBIDDEN for one that is missing, not yet
  // arrived, or another tenant's (invisible under RLS), and for one out of scope (4).
  const [seen] = await tx
    .select({ jobId: materials.jobId })
    .from(materials)
    .where(eq(materials.id, input.materialId));
  if (seen === undefined) throw forbidden();

  // 4. Authorization under row locks held to commit, in the global order (jobs, crews, users,
  // companies): a foreman through the job's crew, an admin company-wide.
  if (user.role === "foreman") {
    await lockForemanScope(tx, user, seen.jobId, "share");
  } else {
    await lockActiveSelf(tx, user, "admin");
  }

  // 5. Shared: a closeout, which takes it exclusive, is either committed — its membership seen
  // below — or waits for this call to end.
  await lockCompanyFieldWrites(tx, "shared");

  // 6. The material's row, against another correction of it, a decision on one, or a cost
  // fill; then this id again, which a concurrent call may have committed meanwhile.
  const [material] = await tx
    .select(materialFacts)
    .from(materials)
    .where(eq(materials.id, input.materialId))
    .for("no key update");
  if (material === undefined || material.jobId !== seen.jobId) {
    throw new Error("the material changed job while it was being corrected");
  }
  const again = await byId(tx, input.id);
  if (again !== undefined) return answerFor(again, user, input);

  // 7. A material a committed closeout covers is corrected, and so is a receipt that arrived
  // after its day's closeout: its approval, written by the push in the receipt's own
  // transaction, carries `after_closeout` (migration 0024 states the same rule). Otherwise: a
  // closeout of its job for its date — the date in the zone that closeout was judged in —
  // means it never will be; none means not yet.
  const [member] = await tx
    .select({ closeoutId: dayCloseoutMaterials.closeoutId })
    .from(dayCloseoutMaterials)
    .where(eq(dayCloseoutMaterials.materialId, input.materialId));
  const [late] =
    member === undefined
      ? await tx
          .select({ id: approvals.id })
          .from(approvals)
          .where(
            and(
              eq(approvals.materialId, input.materialId),
              sql`'after_closeout'::approval_reason = any (${approvals.reasons})`,
            ),
          )
      : [];
  if (member === undefined && late === undefined) {
    const closed = await closedOn(tx, material.jobId, material.loggedAt);
    return rejected(closed ? "not_in_closeout" : "closeout_pending");
  }

  // 8. The material as it stands, read under its lock.
  const history: CorrectionState[] = await tx
    .select({
      id: materialCorrections.id,
      kind: materialCorrections.kind,
      description: materialCorrections.description,
      quantity: materialCorrections.quantity,
      unit: materialCorrections.unit,
      serverTimestamp: materialCorrections.serverTimestamp,
      decision: approvals.decision,
    })
    .from(materialCorrections)
    .leftJoin(approvals, eq(approvals.materialCorrectionId, materialCorrections.id))
    .where(eq(materialCorrections.materialId, input.materialId))
    .orderBy(asc(materialCorrections.serverTimestamp), asc(materialCorrections.id));
  const effective = effectiveMaterial(material, history);
  if (effective.pendingId !== null) {
    return rejected("correction_pending", effective.pendingId);
  }
  if (effective.voided) return rejected("material_voided");
  const values = stored(input);
  if (
    values.kind === "amend" &&
    values.description === effective.description &&
    values.quantity === effective.quantity &&
    values.unit === effective.unit
  ) {
    return rejected("no_change");
  }

  // 9. The receipt stamp: the server's clock after the locks, above every earlier correction
  // of this material, so they take effect in the order they were accepted.
  const newest = history.at(-1)?.serverTimestamp ?? null;
  const now = await serverClock(tx, newest);

  // 10. No conflict target: the primary key is this table's only unique key the id does not
  // imply. Nothing comes back when a concurrent call committed this id for another material
  // (seen, then), or another tenant holds it (invisible).
  const [inserted] = await tx
    .insert(materialCorrections)
    .values({
      id: input.id,
      companyId: user.companyId,
      materialId: input.materialId,
      ...values,
      note: input.note,
      submittedByUserId: user.id,
      clientTimestamp: input.clientTimestamp,
      serverTimestamp: now,
    })
    .onConflictDoNothing()
    .returning();
  if (inserted === undefined) {
    const raced = await byId(tx, input.id);
    if (raced !== undefined) return answerFor(raced, user, input);
    // Another tenant's row, append-only, so permanent: answered as a visible conflict is, and
    // saying nothing more (ARCHITECTURE, push authority).
    return rejected("id_conflict");
  }

  // 11. Its approval, pending, in the same transaction (migration 0020 requires it).
  await tx.insert(approvals).values({
    companyId: user.companyId,
    materialCorrectionId: input.id,
    reasons: ["corrected"],
  });
  await tx.execute(APPROVED);
  await tx.execute(DEFERRED);
  return ack("accepted", inserted);
}
