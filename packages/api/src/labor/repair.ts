// labor.repair (PRD, Labor: no role edits a recorded event; corrections are new events that
// reference the original. ARCHITECTURE rows 181, 182, 186, 187). An active admin repairs one
// worker's ledger with a set of operations — `append` a missing event, `correct` one (a new
// event naming its root), `void` a session — validated as one timeline (validateEvents), so a
// repair needing two events at once is legal when the pair is, and written all or nothing.
// Every new event gets its pending approval in the same transaction (0022, 0026); nothing here
// reads a decision, so a repair's validity never depends on one (row 209). Answers mirror a
// push record's: `accepted` or `duplicate` (both success) with acknowledgements in input order,
// or `rejected` with a code, writing nothing, so the same ids may be sent again. Anything
// thrown rolls the call back. Consumed by routers/labor.ts.
import {
  approvalReason,
  approvals,
  jobs,
  users,
  workSessionEvents,
} from "@trader/db/schema";
import { inArray, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { lockActiveSelf } from "../core/locks";
import type { Tx } from "../core/context";
import { instant } from "../core/instant";
import type { AppUser } from "../core/resolve-user";
import { afterCloseout, sessionOfEvent } from "../sync/labor";
import { laborReasons, type ApprovalReason } from "../sync/reasons";
import { forbidden } from "../core/trpc";
import { replay, type LaborEvent } from "./fold";
import { assertReadCommitted, loadWorkerTimeline } from "./timeline";
import { validateEvents, type RejectionCode } from "./validate";

const positional = z.enum(["started", "paused", "resumed", "ended"]);
// The office client's UUIDv7 (invariant 2), the same on every retry.
const eventId = z.uuid({ version: "v7" });

// Nothing names a company, an initiator, a stamp, a skew or a reason: those are the server's.
// A correction states its whole replacement (type and job as well as time), so the stored row
// is the input's; the fold refuses a changed type, or a changed job on anything but a start.
const operation = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("append"),
    id: eventId,
    type: positional,
    jobId: z.uuid(),
    clientTimestamp: instant,
  }),
  z.strictObject({
    kind: z.literal("correct"),
    id: eventId,
    correctsEventId: z.uuid(),
    // The source the office saw in effect for the root: its precondition, never stored and
    // never judged on a retry (as the review fingerprint, ARCHITECTURE row 198).
    replacesEventId: z.uuid(),
    type: positional,
    jobId: z.uuid(),
    clientTimestamp: instant,
  }),
  z.strictObject({ kind: z.literal("void"), id: eventId, voidsEventId: z.uuid() }),
]);

type Operation = z.infer<typeof operation>;

const targetOf = (op: Operation): string | null =>
  op.kind === "correct"
    ? op.correctsEventId
    : op.kind === "void"
      ? op.voidsEventId
      : null;

export const repairInput = z
  .strictObject({
    workerId: z.uuid(),
    operations: z.array(operation).min(1).max(20),
  })
  .superRefine((input, ctx) => {
    const ids = new Set(input.operations.map((op) => op.id));
    if (ids.size !== input.operations.length) {
      ctx.addIssue({
        code: "custom",
        message: "operation ids repeat",
        path: ["operations"],
      });
    }
    // An operation names a recorded event, never one of its own set.
    for (const [i, op] of input.operations.entries()) {
      const target = targetOf(op);
      if (target !== null && ids.has(target)) {
        ctx.addIssue({
          code: "custom",
          message: "an operation names an event of its own set",
          path: ["operations", i],
        });
      }
    }
  });

export type RepairInput = z.infer<typeof repairInput>;

const acknowledgement = z.strictObject({
  id: z.uuid(),
  serverTimestamp: z.date(),
  reasons: z.array(z.enum(approvalReason.enumValues)),
});

type RepairRejection = RejectionCode | "id_conflict" | "time_in_future" | "repair_stale";

// A record, so the compiler holds the wire list to every validation code.
const REJECTIONS: Record<RepairRejection, true> = {
  no_open_session: true,
  session_already_open: true,
  not_paused: true,
  already_paused: true,
  target_missing: true,
  target_is_correction: true,
  correction_of_void: true,
  correction_type_mismatch: true,
  correction_job_mismatch: true,
  void_target_not_started: true,
  already_voided: true,
  breaks_following_event: true,
  correction_superseded: true,
  correction_moves_session: true,
  job_id_mismatch: true,
  // An id of the set is already a different event, or held by a row this tenant cannot see.
  id_conflict: true,
  // An appended or corrected time after the server's receipt of the repair.
  time_in_future: true,
  // Another correction is in effect for the root than the one the office replaced.
  repair_stale: true,
};

export const repairOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("accepted"), events: z.array(acknowledgement) }),
  // This caller already recorded exactly this set: a retry after a dropped response.
  z.strictObject({ result: z.literal("duplicate"), events: z.array(acknowledgement) }),
  z.strictObject({
    result: z.literal("rejected"),
    code: z.enum(Object.keys(REJECTIONS) as [RepairRejection, ...RepairRejection[]]),
    // The operation the rejection is about, when it is about one.
    eventId: z.uuid().optional(),
    conflictingEventId: z.uuid().optional(),
  }),
]);

export type RepairResult = z.infer<typeof repairOutput>;
type Acknowledgement = z.infer<typeof acknowledgement>;

const rejected = (
  code: RepairRejection,
  ids: { eventId?: string; conflictingEventId?: string } = {},
): RepairResult => ({
  result: "rejected",
  code,
  ...(ids.eventId === undefined ? {} : { eventId: ids.eventId }),
  ...(ids.conflictingEventId === undefined
    ? {}
    : { conflictingEventId: ids.conflictingEventId }),
});

type Stored = typeof workSessionEvents.$inferSelect;

// An office event's facts, fixed by the server: the time was set by a person (a void sets none),
// it was captured online, it is placed where the office put it, no attestation, no stamp.
const officeFacts = (op: Operation) => ({
  clockSkewed: false,
  clockSkewMs: 0,
  attestationLevel: "none" as const,
  locationLat: null,
  locationLng: null,
  locationAccuracyM: null,
  schemaVersion: 1,
  timeSetByUser: op.kind !== "void",
  capturedOffline: false,
});

// The same operation: every column the input and the server's fixed facts determine. Not the
// receipt stamp, not a void's time or job (the server's), not `replacesEventId` (unstored).
function same(row: Stored, user: AppUser, workerId: string, op: Operation): boolean {
  const facts = officeFacts(op);
  const common =
    row.initiatorUserId === user.id &&
    row.workerId === workerId &&
    row.clockSkewed === facts.clockSkewed &&
    row.attestationLevel === facts.attestationLevel &&
    row.locationLat === null &&
    row.locationLng === null &&
    row.locationAccuracyM === null &&
    row.schemaVersion === facts.schemaVersion &&
    row.timeSetByUser === facts.timeSetByUser &&
    row.capturedOffline === facts.capturedOffline;
  if (!common) return false;
  if (op.kind === "void") {
    return (
      row.type === "voided" &&
      row.voidsEventId === op.voidsEventId &&
      row.correctsEventId === null
    );
  }
  return (
    row.type === op.type &&
    row.jobId === op.jobId &&
    row.clientTimestamp.getTime() === op.clientTimestamp.getTime() &&
    row.voidsEventId === null &&
    row.correctsEventId === (op.kind === "correct" ? op.correctsEventId : null)
  );
}

// Answers a set some of whose ids are already recorded: `duplicate` when every one is, by this
// caller, as sent; otherwise `id_conflict`. Null when none is visible.
async function answerRecorded(
  tx: Tx,
  user: AppUser,
  input: RepairInput,
): Promise<RepairResult | null> {
  const ids = input.operations.map((op) => op.id);
  const rows = await tx
    .select()
    .from(workSessionEvents)
    .where(inArray(workSessionEvents.id, ids));
  if (rows.length === 0) return null;
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const op of input.operations) {
    const row = byId.get(op.id);
    if (row !== undefined && !same(row, user, input.workerId, op)) {
      return rejected("id_conflict", { conflictingEventId: op.id });
    }
  }
  if (rows.length !== ids.length) {
    // Part of a set: the rest was never written with it, so these ids are another write's.
    return rejected("id_conflict", { conflictingEventId: rows[0]!.id });
  }
  const stored = await tx
    .select({ eventId: approvals.eventId, reasons: approvals.reasons })
    .from(approvals)
    .where(inArray(approvals.eventId, ids));
  const reasonsOf = new Map(stored.map((a) => [a.eventId, a.reasons]));
  return {
    result: "duplicate",
    events: input.operations.map((op) => ({
      id: op.id,
      serverTimestamp: byId.get(op.id)!.serverTimestamp,
      reasons: reasonsOf.get(op.id) ?? [],
    })),
  };
}

// Raised inside the insert savepoint when an id is held by a row this tenant cannot see; the
// savepoint rolls back, so the call writes nothing and answers `id_conflict`.
class IdHeld extends Error {
  constructor(readonly id: string) {
    super("an id of the repair is held elsewhere");
  }
}

// Fired before the procedure returns, then deferred again (material.correct's pattern): a
// rolled-back test never reaches the commit where they would otherwise run.
const APPROVED = sql`set constraints work_session_events_approved, work_session_events_repair_approved immediate`;
const DEFERRED = sql`set constraints work_session_events_approved, work_session_events_repair_approved deferred`;

export async function repairLabor(
  tx: Tx,
  user: AppUser,
  input: RepairInput,
): Promise<RepairResult> {
  await assertReadCommitted(tx, "labor.repair");

  // 1. A retry answers as the first call did.
  const recorded = await answerRecorded(tx, user, input);
  if (recorded !== null) return recorded;

  // 2. The caller, re-read under a lock held to commit (users rows first in the lock order).
  await lockActiveSelf(tx, user, "admin");

  // 3. The worker and every named job, visible in the tenant. Ids and companies never change,
  // so no lock: a deactivated worker's history and an archived job's labor are repairable.
  // One FORBIDDEN for anything missing or another tenant's.
  const [worker] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, input.workerId));
  if (worker === undefined) throw forbidden();
  const jobIds = [
    ...new Set(input.operations.flatMap((op) => (op.kind === "void" ? [] : [op.jobId]))),
  ];
  if (jobIds.length > 0) {
    const visible = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(inArray(jobs.id, jobIds));
    if (visible.length !== jobIds.length) throw forbidden();
  }

  // 4. The worker's ledger, with no other labor writer for them and no closeout in flight.
  const timeline = await loadWorkerTimeline(tx, input.workerId);
  const { receivedAt } = timeline;

  // 5. Again, under the lock: a concurrent call with these ids may have committed meanwhile.
  const again = await answerRecorded(tx, user, input);
  if (again !== null) return again;

  // 6. The candidates, as they would be stored.
  const byId = new Map(timeline.events.map((e) => [e.id, e]));
  const candidates: LaborEvent[] = [];
  for (const op of input.operations) {
    if (op.kind === "void") {
      // A void sits at its receipt on its root's own job; the fold judges the rest.
      const target = byId.get(op.voidsEventId);
      if (target === undefined) return rejected("target_missing", { eventId: op.id });
      candidates.push({
        id: op.id,
        workerId: input.workerId,
        jobId: target.jobId,
        type: "voided",
        clientTimestamp: receivedAt,
        serverTimestamp: receivedAt,
        clockSkewed: false,
        voidsEventId: op.voidsEventId,
        correctsEventId: null,
      });
      continue;
    }
    if (op.clientTimestamp.getTime() > receivedAt.getTime()) {
      return rejected("time_in_future", { eventId: op.id });
    }
    candidates.push({
      id: op.id,
      workerId: input.workerId,
      jobId: op.jobId,
      type: op.type,
      clientTimestamp: op.clientTimestamp,
      serverTimestamp: receivedAt,
      clockSkewed: false,
      voidsEventId: null,
      correctsEventId: op.kind === "correct" ? op.correctsEventId : null,
    });
  }

  // 7. The office's precondition: the correction replaces the source it saw in effect. A root
  // the fold cannot resolve is left to validation's own answer.
  const before = replay(timeline.events);
  for (const op of input.operations) {
    if (op.kind !== "correct") continue;
    const winner = before.winners.get(op.correctsEventId);
    if (winner !== undefined && winner !== op.replacesEventId) {
      return rejected("repair_stale", { eventId: op.id, conflictingEventId: winner });
    }
  }

  // 8. One timeline: every candidate in place, two-sided.
  const verdict = validateEvents(
    { workerId: input.workerId, baselineStamp: timeline.baselineStamp, receivedAt },
    timeline.events,
    candidates,
  );
  if (verdict.verdict === "rejected") {
    return rejected(verdict.code, {
      eventId: verdict.eventId,
      ...(verdict.conflictingEventId === undefined
        ? {}
        : { conflictingEventId: verdict.conflictingEventId }),
    });
  }

  // 9. The approval facts, the closeout among them judged on the session as repaired, in each
  // closeout's stored zone (ARCHITECTURE row 201).
  const after = replay([...timeline.events, ...candidates]);
  const reasons: ApprovalReason[][] = [];
  for (const [i, op] of input.operations.entries()) {
    const c = candidates[i]!;
    reasons.push(
      laborReasons({
        type: c.type,
        corrected: op.kind !== "append",
        capturedOffline: false,
        timeSetByUser: op.kind !== "void",
        stamp: null,
        job: null,
        clockSkewed: false,
        afterCloseout: await afterCloseout(tx, sessionOfEvent(after, c)),
      }),
    );
  }

  // 10. Every event and its approval, all or nothing. No conflict on a visible id is possible
  // here (step 5, under the lock); one held by an invisible row returns nothing for it.
  try {
    await tx.transaction(async (sp) => {
      const inserted = await sp
        .insert(workSessionEvents)
        .values(
          input.operations.map((op, i) => {
            const c = candidates[i]!;
            return {
              id: c.id,
              companyId: user.companyId,
              workerId: c.workerId,
              jobId: c.jobId,
              type: c.type,
              clientTimestamp: c.clientTimestamp,
              serverTimestamp: receivedAt,
              voidsEventId: c.voidsEventId,
              correctsEventId: c.correctsEventId,
              initiatorUserId: user.id,
              ...officeFacts(op),
            };
          }),
        )
        .onConflictDoNothing({ target: workSessionEvents.id })
        .returning({ id: workSessionEvents.id });
      if (inserted.length !== candidates.length) {
        const written = new Set(inserted.map((r) => r.id));
        throw new IdHeld(candidates.find((c) => !written.has(c.id))!.id);
      }
      await sp.insert(approvals).values(
        candidates.map((c, i) => {
          if (reasons[i]!.length === 0) throw new Error("an office event has a reason");
          return { companyId: user.companyId, eventId: c.id, reasons: reasons[i]! };
        }),
      );
      await sp.execute(APPROVED);
      await sp.execute(DEFERRED);
    });
  } catch (error) {
    if (error instanceof IdHeld) {
      return rejected("id_conflict", { conflictingEventId: error.id });
    }
    throw error;
  }

  // 11. In input order, whatever order the database returned rows in.
  const events: Acknowledgement[] = candidates.map((c, i) => ({
    id: c.id,
    serverTimestamp: receivedAt,
    reasons: reasons[i]!,
  }));
  return { result: "accepted", events };
}
