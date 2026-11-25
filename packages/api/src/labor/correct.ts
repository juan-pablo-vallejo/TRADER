// labor.correct: no role edits a recorded event; a fix is a new event that references the
// original. An active admin corrects one worker's ledger with a set of operations: `append` a
// missing event, `correct` one (a new event naming its root), `void` a session. The set is
// validated as one timeline (validateEvents), so a correction needing two events at once is
// legal when the pair is, and written all or nothing. Every new event carries its flags and
// takes effect when it is written. Answers mirror a push record's: `accepted` or `duplicate`
// (both success) with acknowledgements in input order, or `rejected` with a code, writing
// nothing, so the same ids may be sent again. Anything thrown rolls the call back. Consumed
// by routers/labor.ts.
import { entryFlag, jobs, users, entries } from "@trader/db/schema";
import { inArray, eq } from "drizzle-orm";
import { z } from "zod";

import { lockActiveSelf } from "../core/locks";
import type { Tx } from "../core/context";
import { instant } from "../core/instant";
import type { AppUser } from "../core/resolve-user";
import { laborReasons, type EntryFlag } from "../sync/flags";
import { releaseVoided } from "../sync/schedule";
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
    // never judged on a retry.
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

export const correctionInput = z
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

export type CorrectionInput = z.infer<typeof correctionInput>;

const acknowledgement = z.strictObject({
  id: z.uuid(),
  serverTimestamp: z.date(),
  flags: z.array(z.enum(entryFlag.enumValues)),
});

type CorrectionRejection =
  | RejectionCode
  | "id_conflict"
  | "time_in_future"
  | "correction_stale"
  | "void_leaves_session_open";

// A record, so the compiler holds the wire list to every validation code.
const REJECTIONS: Record<CorrectionRejection, true> = {
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
  // An appended or corrected time after the server's receipt of the correction.
  time_in_future: true,
  // Another correction is in effect for the root than the one the office replaced.
  correction_stale: true,
  // A void of a session the set leaves open: its worker would stay clocked in. The
  // office sends the void with the session's end.
  void_leaves_session_open: true,
};

export const correctionOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("accepted"), events: z.array(acknowledgement) }),
  // This caller already recorded exactly this set: a retry after a dropped response.
  z.strictObject({ result: z.literal("duplicate"), events: z.array(acknowledgement) }),
  z.strictObject({
    result: z.literal("rejected"),
    code: z.enum(
      Object.keys(REJECTIONS) as [CorrectionRejection, ...CorrectionRejection[]],
    ),
    // The operation the rejection is about, when it is about one.
    eventId: z.uuid().optional(),
    conflictingEventId: z.uuid().optional(),
  }),
]);

type CorrectionResult = z.infer<typeof correctionOutput>;
type Acknowledgement = z.infer<typeof acknowledgement>;

const rejected = (
  code: CorrectionRejection,
  ids: { eventId?: string; conflictingEventId?: string } = {},
): CorrectionResult => ({
  result: "rejected",
  code,
  ...(ids.eventId === undefined ? {} : { eventId: ids.eventId }),
  ...(ids.conflictingEventId === undefined
    ? {}
    : { conflictingEventId: ids.conflictingEventId }),
});

type Stored = typeof entries.$inferSelect;

// An office event's facts, fixed by the server: the time was set by a person (a void sets none),
// it was captured online, it is placed where the office put it, no stamp.
const officeFacts = (op: Operation) => ({
  clockSkewed: false,
  clockSkewMs: 0,
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
  input: CorrectionInput,
): Promise<CorrectionResult | null> {
  const ids = input.operations.map((op) => op.id);
  const rows = await tx.select().from(entries).where(inArray(entries.id, ids));
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
  return {
    result: "duplicate",
    events: input.operations.map((op) => ({
      id: op.id,
      serverTimestamp: byId.get(op.id)!.serverTimestamp,
      flags: byId.get(op.id)!.flags,
    })),
  };
}

// Raised inside the insert savepoint when an id is held by a row this tenant cannot see; the
// savepoint rolls back, so the call writes nothing and answers `id_conflict`.
class IdHeld extends Error {
  constructor(readonly id: string) {
    super("an id of the correction is held elsewhere");
  }
}

export async function correctLabor(
  tx: Tx,
  user: AppUser,
  input: CorrectionInput,
): Promise<CorrectionResult> {
  await assertReadCommitted(tx, "labor.correct");

  // 1. A retry answers as the first call did.
  const recorded = await answerRecorded(tx, user, input);
  if (recorded !== null) return recorded;

  // 2. The caller, re-read under a lock held to commit (users rows first in the lock order).
  await lockActiveSelf(tx, user, "admin");

  // 3. The worker and every named job, visible in the tenant. Ids and companies never change,
  // so no lock: a deactivated worker's history and an archived job's labor are correctable.
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

  // 4. The worker's ledger, with no other labor writer for them.
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
    // An office browser more than a minute fast is refused here when it ends an open
    // session: the end it sends is its own now less 60 s, and the clock is the browser's.
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
      return rejected("correction_stale", { eventId: op.id, conflictingEventId: winner });
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

  // 8b. A void may not leave its session open: a voided open session keeps its worker
  // clocked in on the server, and every clock-in after it is refused.
  const voids = input.operations.filter((op) => op.kind === "void");
  if (voids.length > 0) {
    const after = replay([...timeline.events, ...candidates]);
    for (const op of voids) {
      const session = after.sessions.find((x) => x.rootEventId === op.voidsEventId);
      if (session !== undefined && !session.complete) {
        return rejected("void_leaves_session_open", { eventId: op.id });
      }
    }
  }

  // 9. Each entry's flags: an entry the office writes is `corrected`, added hours
  // included, and never `location`: nobody stood anywhere to write it.
  const reasons: EntryFlag[][] = [];
  for (const [i, op] of input.operations.entries()) {
    const c = candidates[i]!;
    reasons.push(
      laborReasons({
        type: c.type,
        corrected: true,
        capturedOffline: false,
        timeSetByUser: op.kind !== "void",
        stamped: false,
        stamp: null,
        job: null,
        clockSkewed: false,
      }),
    );
  }

  // 10. Every event with its flags, all or nothing. No conflict on a visible id is possible
  // here (step 5, under the lock); one held by an invisible row returns nothing for it.
  try {
    await tx.transaction(async (sp) => {
      const inserted = await sp
        .insert(entries)
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
              flags: reasons[i]!,
              ...officeFacts(op),
            };
          }),
        )
        .onConflictDoNothing({ target: entries.id })
        .returning({ id: entries.id });
      if (inserted.length !== candidates.length) {
        const written = new Set(inserted.map((r) => r.id));
        throw new IdHeld(candidates.find((c) => !written.has(c.id))!.id);
      }
    });
  } catch (error) {
    if (error instanceof IdHeld) {
      return rejected("id_conflict", { conflictingEventId: error.id });
    }
    throw error;
  }

  // 11. A clock-in voided here no longer holds its shift (sync/schedule.ts).
  await releaseVoided(
    tx,
    input.operations.flatMap((op) => (op.kind === "void" ? [op.voidsEventId] : [])),
  );

  // 12. In input order, whatever order the database returned rows in.
  const events: Acknowledgement[] = candidates.map((c, i) => ({
    id: c.id,
    serverTimestamp: receivedAt,
    flags: reasons[i]!,
  }));
  return { result: "accepted", events };
}
