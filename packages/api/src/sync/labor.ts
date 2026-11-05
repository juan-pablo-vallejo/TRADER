// One labor event from a push (ARCHITECTURE, Sync protocol; sync.push of 2026-11-05), in the
// record's own transaction: the caller's own id first; the scope under row locks; the worker's
// timeline under its lock (loadWorkerTimeline, which takes the field-write lock shared first);
// the id again; two-sided validation; the approval facts; the insert and, in the same
// transaction, its approval. Answers `accepted` or `duplicate` with an acknowledgement of fixed
// facts only, or `rejected` with a code, writing nothing. Anything thrown is the loop's: the
// record is omitted and retried. Consumed by sync/push.ts.
import {
  approvalReason,
  approvals,
  attestationLevel,
  workSessionEvents,
} from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../context";
import { replay, type LaborEvent, type Replay, type Session } from "../labor/fold";
import { assertReadCommitted, loadWorkerTimeline } from "../labor/timeline";
import { validateEvent, type RejectionCode } from "../labor/validate";
import type { AppUser } from "../resolve-user";
import { laborReasons, type ApprovalReason, type Skew } from "./reasons";
import { lockPushScope, mayRecordLabor } from "./scope";

// Schema version 1 of a labor event's payload. Nothing names a company, an initiator, a
// receipt stamp, a skew or an approval: those are the server's. No corrections or voids from a
// device: the office writes those (labor.repair, ARCHITECTURE row 187).
export const laborPayloadV1 = z.strictObject({
  workerId: z.uuid(),
  jobId: z.uuid(),
  type: z.enum(["started", "paused", "resumed", "ended"]),
  clientTimestamp: z.date(),
  attestationLevel: z.enum(attestationLevel.enumValues),
  location: z
    .strictObject({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      accuracyM: z.number().nonnegative().nullable(),
    })
    .nullable(),
  timeSetByUser: z.boolean(),
  capturedOffline: z.boolean(),
});

export type LaborPayload = z.infer<typeof laborPayloadV1>;

export type LaborRecord = { id: string; schemaVersion: number; payload: LaborPayload };

export const laborAck = z.strictObject({
  id: z.uuid(),
  serverTimestamp: z.date(),
  clockSkewed: z.boolean(),
  reasons: z.array(z.enum(approvalReason.enumValues)),
});

export type LaborRejection = RejectionCode | "id_conflict" | "not_permitted";

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

  // 2. Authority, from rows locked now (sync/scope.ts).
  const scope = await lockPushScope(tx, user, p.jobId, p.workerId);
  if (!mayRecordLabor(scope, user, p.workerId, p.type)) return rejected("not_permitted");

  // 3. The worker's ledger, with no other labor writer for them and no closeout in flight.
  const timeline = await loadWorkerTimeline(tx, p.workerId);

  // 4. Again, under the lock: a concurrent push of this id may have committed meanwhile.
  const again = await byId(tx, r.id);
  if (again !== undefined) {
    return again.initiatorUserId === user.id
      ? answerFor(tx, again, user, r)
      : rejected("id_conflict");
  }

  // 5. Two-sided validation with the event at its effective instant.
  const candidate: LaborEvent = {
    id: r.id,
    workerId: p.workerId,
    jobId: p.jobId,
    type: p.type,
    clientTimestamp: p.clientTimestamp,
    serverTimestamp: timeline.receivedAt,
    clockSkewed: skew.clockSkewed,
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

  // 6. The approval facts, the closeout among them judged in each closeout's stored zone.
  const reasons: ApprovalReason[] = laborReasons({
    type: p.type,
    corrected: false,
    capturedOffline: p.capturedOffline,
    timeSetByUser: p.timeSetByUser,
    stamp: p.location,
    job: scope!.place,
    clockSkewed: skew.clockSkewed,
    afterCloseout: await afterCloseout(
      tx,
      sessionOfEvent(replay([...timeline.events, candidate]), candidate),
    ),
  });

  // 7. No conflict target: the primary key ends here. Nothing comes back when a concurrent
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
      clockSkewed: skew.clockSkewed,
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

  // 8. Its approval, pending, in the same transaction (0022 requires the column-derived
  // reasons at commit).
  if (reasons.length > 0) {
    await tx
      .insert(approvals)
      .values({ companyId: user.companyId, eventId: r.id, reasons });
  }
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
// effective instant (fold.ts), the rule the closeout was built by (ARCHITECTURE row 201). Each
// closeout is judged in its own stored zone, never the company's current one, so a later zone
// change cannot move a record into or out of a closed day. Under the field-write lock held
// shared, a closeout either committed before (seen here) or covers this record. A closed day
// the session has left is not consulted: its sealed membership never changes. Consumed by
// push and by labor/repair.ts.
export async function afterCloseout(tx: Tx, session: Session): Promise<boolean> {
  const { rows } = await tx.execute<{ closed: boolean }>(sql`
    select exists (
      select 1 from day_closeouts c
      where c.job_id = ${session.jobId}
        and c.work_date = (${session.startedAt.toISOString()}::timestamptz at time zone c.timezone)::date
    ) as closed
  `);
  return rows[0]?.closed === true;
}
