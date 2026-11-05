// approval.decide (PRD, Office approval: nobody approves their own entries). An active admin
// records one decision on one pending approval, once: migration 0004 freezes a decided row, so
// a decision is never reversed, only answered. Nobody decides their own entry — the worker of a
// labor event (never merely its initiator), a receipt's logger, a correction's submitter — and
// migrations 0020, 0022 and 0025 refuse the same in SQL. A decision changes no structural fact:
// the ledger, materials, closeouts and their fingerprints stay as they are, and what counts is
// derived (labor/approval.ts, materials/approval.ts). Consumed by routers/approval.ts.
import {
  approvals,
  materialCorrections,
  materials,
  workSessionEvents,
} from "@trader/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { lockActiveSelf } from "../closeout/scope";
import type { Tx } from "../context";
import { assertReadCommitted, lockCompanyFieldWrites } from "../labor/timeline";
import type { AppUser } from "../resolve-user";
import { forbidden } from "../trpc";

// Nothing names a tenant, a decider or a time: those are the server's.
export const decideInput = z.strictObject({
  approvalId: z.uuid(),
  decision: z.enum(["approved", "rejected"]),
});

export type DecideInput = z.infer<typeof decideInput>;

const decision = z.enum(["approved", "rejected"]);
const ack = z.strictObject({ id: z.uuid(), decision, decidedAt: z.date() });

export const decideOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("decided"), approval: ack }),
  // This caller already recorded this decision: a retry after a dropped response.
  z.strictObject({ result: z.literal("duplicate"), approval: ack }),
  z.discriminatedUnion("code", [
    // Decided already, otherwise or by another admin; the standing decision stays.
    z.strictObject({
      result: z.literal("rejected"),
      code: z.literal("already_decided"),
      standing: z.strictObject({
        decision,
        decidedAt: z.date(),
        decidedByUserId: z.uuid(),
      }),
    }),
    // The caller's own labor, receipt or correction. Nothing is written.
    z.strictObject({ result: z.literal("rejected"), code: z.literal("own_entry") }),
  ]),
]);

export type DecideResult = z.infer<typeof decideOutput>;

export async function decideApproval(
  tx: Tx,
  user: AppUser,
  input: DecideInput,
): Promise<DecideResult> {
  await assertReadCommitted(tx, "approval.decide");

  // 1. The approval's subject, unlocked: 0020 fixes it, so only the decision can move under
  // this read. One FORBIDDEN for an id that is missing or another tenant's (invisible).
  const [seen] = await tx
    .select({
      eventId: approvals.eventId,
      materialId: approvals.materialId,
      materialCorrectionId: approvals.materialCorrectionId,
    })
    .from(approvals)
    .where(eq(approvals.id, input.approvalId));
  if (seen === undefined) throw forbidden();

  // 2. The caller, re-read under a lock held to commit (users rows come first in the lock
  // order): a demotion or deactivation either committed first and is seen, or waits.
  await lockActiveSelf(tx, user, "admin");

  // 3. Whose entry it is, from immutable columns. A correction's decision takes
  // material.correct's locks, in its order (ARCHITECTURE row 200): the field-write lock shared,
  // then the material row, so a correction of the same material is serialized with it.
  let party: string;
  if (seen.materialCorrectionId !== null) {
    const [correction] = await tx
      .select({
        materialId: materialCorrections.materialId,
        submittedByUserId: materialCorrections.submittedByUserId,
      })
      .from(materialCorrections)
      .where(eq(materialCorrections.id, seen.materialCorrectionId));
    if (correction === undefined)
      throw new Error("an approval's correction is not visible");
    await lockCompanyFieldWrites(tx, "shared");
    await tx
      .select({ id: materials.id })
      .from(materials)
      .where(eq(materials.id, correction.materialId))
      .for("no key update");
    party = correction.submittedByUserId;
  } else if (seen.materialId !== null) {
    const [receipt] = await tx
      .select({ loggedByUserId: materials.loggedByUserId })
      .from(materials)
      .where(eq(materials.id, seen.materialId));
    if (receipt === undefined) throw new Error("an approval's receipt is not visible");
    party = receipt.loggedByUserId;
  } else {
    const [event] = await tx
      .select({ workerId: workSessionEvents.workerId })
      .from(workSessionEvents)
      .where(eq(workSessionEvents.id, seen.eventId!));
    if (event === undefined) throw new Error("an approval's event is not visible");
    party = event.workerId;
  }

  // 4. The approval row, last in the lock order: a second decider waits here, then reads the
  // first one's commit (READ COMMITTED reads afresh per statement).
  const [row] = await tx
    .select({
      decision: approvals.decision,
      decidedAt: approvals.decidedAt,
      decidedByUserId: approvals.decidedByUserId,
    })
    .from(approvals)
    .where(eq(approvals.id, input.approvalId))
    .for("no key update");
  if (row === undefined) throw new Error("the approval vanished under its lock");

  // 5. Decided: answered, never rewritten.
  if (row.decision !== null) {
    if (row.decision === input.decision && row.decidedByUserId === user.id) {
      return {
        result: "duplicate",
        approval: {
          id: input.approvalId,
          decision: row.decision,
          decidedAt: row.decidedAt!,
        },
      };
    }
    return {
      result: "rejected",
      code: "already_decided",
      standing: {
        decision: row.decision,
        decidedAt: row.decidedAt!,
        decidedByUserId: row.decidedByUserId!,
      },
    };
  }

  // 6. Nobody decides their own entry.
  if (party === user.id) return { result: "rejected", code: "own_entry" };

  // 7. The server's clock after the locks, to the millisecond.
  const { rows: stamp } = await tx.execute<{ now_ms: string }>(sql`
    select (extract(epoch from date_trunc('milliseconds', clock_timestamp())) * 1000)::bigint
      as now_ms
  `);
  const decidedAt = new Date(Number(stamp[0]!.now_ms));

  // 8. One statement sets all three, which approvals_decision_complete requires together.
  const [written] = await tx
    .update(approvals)
    .set({ decision: input.decision, decidedAt, decidedByUserId: user.id })
    .where(and(eq(approvals.id, input.approvalId), isNull(approvals.decision)))
    .returning({ decision: approvals.decision, decidedAt: approvals.decidedAt });
  if (written === undefined) throw new Error("the approval was decided under its lock");
  return {
    result: "decided",
    approval: {
      id: input.approvalId,
      decision: input.decision,
      decidedAt: written.decidedAt!,
    },
  };
}
