// One labor event from a push, in the record's own transaction: the caller's own id first;
// the scope under row locks; the worker's timeline under its lock; the id again; the time it
// claims against its receipt; two-sided validation; its flags; the insert, flags with it.
// An accepted event counts toward hours at once. Answers `accepted` or `duplicate` with an
// acknowledgement of fixed facts only, or `rejected` with a code, writing nothing. Anything
// thrown is the loop's: the record is omitted and retried. Consumed by sync/push.ts.
import { workSessionEvents } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { type z } from "zod";

import type { Tx } from "../core/context";
import type { LaborEvent } from "../labor/fold";
import { assertReadCommitted, loadWorkerTimeline } from "../labor/timeline";
import { validateEvent, type RejectionCode } from "../labor/validate";
import type { AppUser } from "../core/resolve-user";
import type { LaborPayload, laborAck } from "../contract/labor";
import { judgeEventTime, laborReasons, type EntryFlag, type Skew } from "./reasons";
import { judgeStart, lockShift, scheduleEnforced } from "./schedule";
import { lockPushScope, mayRecordLabor } from "./scope";

export { laborAck, laborPayloadV1, type LaborPayload } from "../contract/labor";

export type LaborRecord = { id: string; schemaVersion: number; payload: LaborPayload };

export type LaborRejection =
  | RejectionCode
  | "id_conflict"
  | "not_permitted"
  // Timed later than its receipt by more than the tolerance. Nothing is written; the record
  // stays on the device under its id and the office recovers the hours (labor.repair).
  | "time_in_future"
  // Under schedule enforcement: a start, captured with a connection, that no shift of the
  // worker's admits on that job at that minute. Nothing is written; they ask the office.
  | "not_scheduled";

export type LaborResult =
  | { result: "accepted" | "duplicate"; ack: z.infer<typeof laborAck> }
  | { result: "rejected"; code: LaborRejection; conflictingId?: string };

type Prior = typeof workSessionEvents.$inferSelect;

const rejected = (code: LaborRejection, conflictingId?: string): LaborResult => ({
  result: "rejected",
  code,
  ...(conflictingId === undefined ? {} : { conflictingId }),
});

// The same event: the caller as initiator and every column the device fixed, the schema
// version it was written in included. Not the receipt stamp or the skew, which are the
// server's.
const same = (row: Prior, user: AppUser, r: LaborRecord) => {
  const p = r.payload;
  return (
    row.initiatorUserId === user.id &&
    row.workerId === p.workerId &&
    row.jobId === p.jobId &&
    row.type === p.type &&
    row.clientTimestamp.getTime() === p.clientTimestamp.getTime() &&
    row.locationLat === (p.location?.lat ?? null) &&
    row.locationLng === (p.location?.lng ?? null) &&
    row.locationAccuracyM === (p.location?.accuracyM ?? null) &&
    row.timeSetByUser === p.timeSetByUser &&
    row.capturedOffline === p.capturedOffline &&
    row.schemaVersion === r.schemaVersion
  );
};

async function byId(tx: Tx, id: string): Promise<Prior | undefined> {
  const [row] = await tx
    .select()
    .from(workSessionEvents)
    .where(eq(workSessionEvents.id, id));
  return row;
}

// The acknowledgement, as stored: the flags are the row's own, fixed at write.
function ack(result: "accepted" | "duplicate", row: Prior): LaborResult {
  return {
    result,
    ack: {
      id: row.id,
      serverTimestamp: row.serverTimestamp,
      clockSkewed: row.clockSkewed,
      reasons: row.flags,
    },
  };
}

const answerFor = (row: Prior, user: AppUser, r: LaborRecord): LaborResult =>
  same(row, user, r) ? ack("duplicate", row) : rejected("id_conflict");

export async function pushLaborEvent(
  tx: Tx,
  user: AppUser,
  r: LaborRecord,
  skew: Skew,
): Promise<LaborResult> {
  await assertReadCommitted(tx, "sync.push");
  const p = r.payload;

  // 1. The caller's own record first: a retry after a demotion or a reassignment answers as
  // the first push did. Another initiator's row is not revealed before the scope passes.
  const prior = await byId(tx, r.id);
  if (prior !== undefined && prior.initiatorUserId === user.id) {
    return answerFor(prior, user, r);
  }

  // 2. Authority, from rows locked now (sync/scope.ts). Whether the schedule decides a start
  // is the company's setting, read here; with it off nothing reads a shift.
  const enforced = p.type === "started" && (await scheduleEnforced(tx));
  const scope = await lockPushScope(tx, user, p.jobId);
  if (!mayRecordLabor(scope, user, p.workerId, p.type)) return rejected("not_permitted");

  // 3. The worker's ledger, with no other labor writer for them.
  const timeline = await loadWorkerTimeline(tx, p.workerId);

  // 4. Again, under the lock: a concurrent push of this id may have committed meanwhile.
  const again = await byId(tx, r.id);
  if (again !== undefined) {
    return again.initiatorUserId === user.id
      ? answerFor(again, user, r)
      : rejected("id_conflict");
  }

  // 5. The time the event claims, against the receipt it will be stored with. After the
  // caller's own id and the scope, so a retry never re-judges and a caller out of scope learns
  // nothing; before validation, so a future time is named as that. A flagged event goes on at
  // its captured time: the flag is the per-push reading or this one (reasons.ts).
  const time = judgeEventTime({
    clientTimestamp: p.clientTimestamp,
    receivedAt: timeline.receivedAt,
    capturedOffline: p.capturedOffline,
    timeSetByUser: p.timeSetByUser,
  });
  if (time === "future") return rejected("time_in_future");
  const clockSkewed = skew.clockSkewed || time === "skewed";

  // 6. Two-sided validation with the event at its effective instant.
  const candidate: LaborEvent = {
    id: r.id,
    workerId: p.workerId,
    jobId: p.jobId,
    type: p.type,
    clientTimestamp: p.clientTimestamp,
    serverTimestamp: timeline.receivedAt,
    clockSkewed,
    voidsEventId: null,
    correctsEventId: null,
  };
  const verdict = validateEvent(
    {
      workerId: p.workerId,
      baselineStamp: timeline.baselineStamp,
      receivedAt: timeline.receivedAt,
    },
    timeline.events,
    candidate,
  );
  if (verdict.verdict === "rejected")
    return rejected(verdict.code, verdict.conflictingEventId);

  // 6. The schedule, where the company enforces it. Admitted, the start will lock its shift.
  // Not admitted and captured offline, it is stored under its own id at its recorded time,
  // flagged `unscheduled`, and counts unless the office corrects it: the pause, resume and
  // end behind it are judged against it and not refused in a chain. An admin starts on any
  // open job, shift or not: theirs is stored and flagged the same way, online too. Any other
  // start the schedule does not admit is refused: the worker calls the office.
  let admittedOn: string | null = null;
  let unscheduled = false;
  if (enforced) {
    const start = await judgeStart(tx, p.workerId, p.jobId, p.clientTimestamp);
    if (start.admitted) admittedOn = start.shiftId;
    else if (p.capturedOffline || scope!.role === "admin") unscheduled = true;
    else return rejected("not_scheduled");
  }

  // 7. The entry's flags, written with it.
  const reasons: EntryFlag[] = laborReasons({
    type: p.type,
    corrected: false,
    capturedOffline: p.capturedOffline,
    timeSetByUser: p.timeSetByUser,
    stamp: p.location,
    job: scope!.place,
    clockSkewed,
    unscheduled,
  });

  // 8. No conflict target: the primary key ends here. Nothing comes back when a concurrent
  // push committed this id (seen above, then) or another tenant holds it (invisible): that is
  // `id_conflict`, and says nothing more.
  const [inserted] = await tx
    .insert(workSessionEvents)
    .values({
      id: r.id,
      companyId: user.companyId,
      workerId: p.workerId,
      jobId: p.jobId,
      type: p.type,
      clientTimestamp: p.clientTimestamp,
      serverTimestamp: timeline.receivedAt,
      clockSkewed,
      // The per-push reading alone, signed; the receipt comparison's evidence is the row's
      // own two timestamps.
      clockSkewMs: skew.clockSkewMs,
      locationLat: p.location?.lat ?? null,
      locationLng: p.location?.lng ?? null,
      locationAccuracyM: p.location?.accuracyM ?? null,
      schemaVersion: r.schemaVersion,
      timeSetByUser: p.timeSetByUser,
      capturedOffline: p.capturedOffline,
      initiatorUserId: user.id,
      flags: reasons,
    })
    .onConflictDoNothing()
    .returning();
  if (inserted === undefined) {
    const raced = await byId(tx, r.id);
    return raced !== undefined && raced.initiatorUserId === user.id
      ? answerFor(raced, user, r)
      : rejected("id_conflict");
  }

  // 9. The punch lock: the shift this start was admitted on keeps its job, day and times
  // from here, in the same transaction as the event that locked it.
  if (admittedOn !== null) await lockShift(tx, admittedOn, r.id);
  return ack("accepted", inserted);
}
