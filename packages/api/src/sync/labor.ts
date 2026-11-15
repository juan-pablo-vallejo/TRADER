// One labor event from a push (ARCHITECTURE, Sync protocol; sync.push of 2026-11-05), in the
// record's own transaction: the caller's own id first; the scope under row locks; the worker's
// timeline under its lock (loadWorkerTimeline, which takes the field-write lock shared first);
// the id again; the time it claims against its receipt (V1-D01); two-sided validation; the
// approval facts; the insert and, in the same transaction, its approval — none when the worker
// is an admin, whose own labor needs no approval (V1-D10 as amended). Answers `accepted` or
// `duplicate` with an acknowledgement of fixed facts only, or `rejected` with a code, writing nothing. Anything thrown is the loop's: the
// record is omitted and retried. Consumed by sync/push.ts.
import { approvals, workSessionEvents } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { type z } from "zod";

import { closedOn } from "../closeout/day";
import type { Tx } from "../core/context";
import { replay, type LaborEvent, type Replay, type Session } from "../labor/fold";
import { assertReadCommitted, loadWorkerTimeline } from "../labor/timeline";
import { validateEvent, type RejectionCode } from "../labor/validate";
import type { AppUser } from "../core/resolve-user";
import type { LaborPayload, laborAck } from "../contract/labor";
import { judgeEventTime, laborReasons, type ApprovalReason, type Skew } from "./reasons";
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
// server's (MEMORY: duplicates are push's).
const same = (row: Prior, user: AppUser, r: LaborRecord) => {
  const p = r.payload;
  return (
    row.initiatorUserId === user.id &&
    row.workerId === p.workerId &&
    row.jobId === p.jobId &&
    row.type === p.type &&
    row.clientTimestamp.getTime() === p.clientTimestamp.getTime() &&
    row.attestationLevel === p.attestationLevel &&
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

// The acknowledgement, as stored: the reasons are the approval's, fixed at write (0020).
async function ack(
  tx: Tx,
  result: "accepted" | "duplicate",
  row: Prior,
): Promise<LaborResult> {
  const [approval] = await tx
    .select({ reasons: approvals.reasons })
    .from(approvals)
    .where(eq(approvals.eventId, row.id));
  return {
    result,
    ack: {
      id: row.id,
      serverTimestamp: row.serverTimestamp,
      clockSkewed: row.clockSkewed,
      reasons: approval?.reasons ?? [],
    },
  };
}

const answerFor = (tx: Tx, row: Prior, user: AppUser, r: LaborRecord) =>
  same(row, user, r)
    ? ack(tx, "duplicate", row)
    : Promise.resolve(rejected("id_conflict"));

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
    return answerFor(tx, prior, user, r);
  }

  // 2. Authority, from rows locked now (sync/scope.ts). Whether the schedule decides a start
  // is the company's setting, read here; with it off nothing reads a shift.
  const enforced = p.type === "started" && (await scheduleEnforced(tx));
  const scope = await lockPushScope(tx, user, p.jobId, p.workerId);
  if (!mayRecordLabor(scope, user, p.workerId, p.type, enforced))
    return rejected("not_permitted");
  // An admin's own start needs no shift (2026-11-15, schedule authority).
  const scheduled = enforced && !(p.workerId === user.id && scope!.role === "admin");

  // 3. The worker's ledger, with no other labor writer for them and no closeout in flight.
  const timeline = await loadWorkerTimeline(tx, p.workerId);

  // 4. Again, under the lock: a concurrent push of this id may have committed meanwhile.
  const again = await byId(tx, r.id);
  if (again !== undefined) {
    return again.initiatorUserId === user.id
      ? answerFor(tx, again, user, r)
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

  // 6b. The schedule, for a start it decides, under the worker's day lock: after validation,
  // so a start that is no start at all is named as that. Admitted, it will lock its shift.
  // Not admitted and captured offline, it is stored under its own id at its recorded time
  // for the office to approve, reject or repair: it counts toward nothing until then, and
  // being stored, the pause, resume and end behind it are judged against it and not refused
  // in a chain. Not for an admin worker, whose labor takes no approval and so could not
  // wait for one. Any other start the schedule does not admit is refused and writes nothing.
  let admittedOn: string | null = null;
  let unscheduled = false;
  if (scheduled) {
    const start = await judgeStart(tx, p.workerId, p.jobId, p.clientTimestamp);
    if (start.admitted) admittedOn = start.shiftId;
    else if (p.capturedOffline && !scope!.workerAdmin) unscheduled = true;
    else return rejected("not_scheduled");
  }

  // 7. The approval facts, the closeout among them judged in each closeout's stored zone.
  const reasons: ApprovalReason[] = laborReasons({
    type: p.type,
    corrected: false,
    capturedOffline: p.capturedOffline,
    timeSetByUser: p.timeSetByUser,
    stamp: p.location,
    job: scope!.place,
    clockSkewed,
    afterCloseout: await afterCloseout(
      tx,
      sessionOfEvent(replay([...timeline.events, candidate]), candidate),
    ),
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
      attestationLevel: p.attestationLevel,
      locationLat: p.location?.lat ?? null,
      locationLng: p.location?.lng ?? null,
      locationAccuracyM: p.location?.accuracyM ?? null,
      schemaVersion: r.schemaVersion,
      timeSetByUser: p.timeSetByUser,
      capturedOffline: p.capturedOffline,
      initiatorUserId: user.id,
    })
    .onConflictDoNothing()
    .returning();
  if (inserted === undefined) {
    const raced = await byId(tx, r.id);
    return raced !== undefined && raced.initiatorUserId === user.id
      ? answerFor(tx, raced, user, r)
      : rejected("id_conflict");
  }

  // 9. Its approval, pending, in the same transaction (0022 requires the column-derived
  // reasons at commit). None for a worker who is an admin at this receipt, the role locked
  // with the scope: the evidence columns above are stored all the same, 0032 stands 0022
  // down for the event, and with no row it is approved by default (labor/approval.ts). A
  // push for another person is a foreman's, never an admin's (scope.ts), so "the worker is an
  // admin" is the whole rule here. The acknowledgement reads the stored row: no reasons.
  if (reasons.length > 0 && !scope!.workerAdmin) {
    await tx
      .insert(approvals)
      .values({ companyId: user.companyId, eventId: r.id, reasons });
  }

  // 10. The punch lock: the shift this start was admitted on keeps its job, day and times
  // from here, in the same transaction as the event that locked it.
  if (admittedOn !== null) await lockShift(tx, admittedOn, r.id);
  return ack(tx, "accepted", inserted);
}

// The session an accepted event falls in: a positional source's own, or for a void, the
// session of the root it names. Consumed by push and by labor/repair.ts.
export function sessionOfEvent(after: Replay, event: LaborEvent): Session {
  const root =
    event.type === "voided" ? event.voidsEventId : after.sessionOf.get(event.id);
  const session = after.sessions.find((s) => s.rootEventId === root);
  if (session === undefined) throw new Error("an accepted event has a session");
  return session;
}

// Whether a session lies on a (job, date) whose closeout is already accepted, judged on the
// session as it stands with the new events in place: its effective `started` source's job and
// captured time (fold.ts, effectiveAt), the rule the closeout was built by (ARCHITECTURE,
// 2026-11-05, approval triggers are six). Each
// closeout is judged in its own stored zone, never the company's current one, so a later zone
// change cannot move a record into or out of a closed day. Under the field-write lock held
// shared, a closeout either committed before (seen here) or covers this record. A closed day
// the session has left is not consulted: its sealed membership never changes. Consumed by
// push and by labor/repair.ts.
export const afterCloseout = (tx: Tx, session: Session): Promise<boolean> =>
  closedOn(tx, session.jobId, session.startedAt);
