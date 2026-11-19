// approval.queue (PRD, Office approval: the queue tags each entry with every reason it is
// there). The admin's pending labor approvals of the tenant, oldest first. Plain reads under RLS, no locks: an item
// may be decided between this read and the admin's click, and approval.decide answers that.
// Each labor item carries its session as it stands now — live, derived, never a closeout
// snapshot — and whether this event is what the session is judged on (labor/approval.ts).
// The page names the company's zone, the one its work dates are judged in, so the office
// reads every time in it; a receipt carries when the server stored it beside the time its
// phone reported. No coordinates, cost or rates. Consumed by routers/approval.ts.
import {
  approvalReason,
  approvals,
  companies,
  jobs,
  users,
  workSessionEvents,
} from "@trader/db/schema";
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import { eventEffect, sessionApprovals, type Decision } from "../labor/approval";
import type { LaborEvent } from "../labor/fold";
import { readWorkerEvents } from "../labor/timeline";
import { workDate } from "../labor/work-date";
import type { AppUser } from "../core/resolve-user";

// The cursor is the last item's approval id: its created_at is read back in SQL at full
// precision (a Date would truncate microseconds and repeat rows sharing a timestamp).
export const queueInput = z.strictObject({
  after: z.uuid().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

const person = z.strictObject({ id: z.uuid(), name: z.string() });
const job = z.strictObject({ id: z.uuid(), name: z.string() });
const accounting = z.enum(["eligible", "pending", "rejected", "voided"]);

const subject = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("labor_event"),
    eventId: z.uuid(),
    type: z.enum(["started", "paused", "resumed", "ended", "voided"]),
    worker: person,
    initiator: person,
    job,
    clientTimestamp: z.date(),
    serverTimestamp: z.date(),
    clockSkewed: z.boolean(),
    clockSkewMs: z.number().int(),
    timeSetByUser: z.boolean(),
    capturedOffline: z.boolean(),
    attestationLevel: z.enum(["biometric", "device_credential", "none"]),
    correctsEventId: z.uuid().nullable(),
    voidsEventId: z.uuid().nullable(),
    // The source in effect for its root, a superseded one (no current accounting effect), or
    // the session's void.
    effect: z.enum(["in_effect", "superseded", "void"]),
    // Live: the session as the ledger and the decisions stand at this read.
    session: z.strictObject({
      rootEventId: z.uuid(),
      workDate: z.iso.date(),
      state: z.enum(["working", "paused", "ended"]),
      complete: z.boolean(),
      structuralWorkedMs: z.number().int(),
      accounting,
      eligibleWorkedMs: z.number().int(),
    }),
  }),
]);

export const queueOutput = z.strictObject({
  // `companies.timezone`: the zone the session work dates below were judged in.
  timezone: z.string(),
  items: z.array(
    z.strictObject({
      approvalId: z.uuid(),
      createdAt: z.date(),
      reasons: z.array(z.enum(approvalReason.enumValues)).min(1),
      // The caller may not decide it: their own labor (never merely initiated by them), their
      // own receipt, their own correction.
      ownEntry: z.boolean(),
      subject,
    }),
  ),
  next: z.uuid().nullable(),
});

export type QueueOutput = z.infer<typeof queueOutput>;
type Item = QueueOutput["items"][number];

const decisionsOf = async (tx: Tx, ids: string[]) =>
  ids.length === 0
    ? new Map<string, Decision>()
    : new Map(
        (
          await tx
            .select({ subject: approvals.eventId, decision: approvals.decision })
            .from(approvals)
            .where(inArray(approvals.eventId, ids))
        ).map((r) => [r.subject!, r.decision]),
      );

async function namesOf(tx: Tx, ids: Set<string>) {
  if (ids.size === 0) return new Map<string, string>();
  const rows = await tx
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, [...ids]));
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function jobNamesOf(tx: Tx, ids: Set<string>) {
  if (ids.size === 0) return new Map<string, string>();
  const rows = await tx
    .select({ id: jobs.id, name: jobs.name })
    .from(jobs)
    .where(inArray(jobs.id, [...ids]));
  return new Map(rows.map((r) => [r.id, r.name]));
}

function named(names: Map<string, string>, id: string) {
  const name = names.get(id);
  if (name === undefined) throw new Error(`a referenced row is not visible: ${id}`);
  return { id, name };
}

export async function approvalQueue(
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof queueInput>,
): Promise<QueueOutput> {
  // 1. The page: pending only, (created_at, id) after the cursor's row. An invisible cursor
  // (another tenant's id) compares NULL and yields an empty page, saying nothing about it.
  const after =
    input.after === undefined
      ? undefined
      : sql`(${approvals.createdAt}, ${approvals.id}) > (
          (select a.created_at from approvals a where a.id = ${input.after}), ${input.after}::uuid
        )`;
  const rows = await tx
    .select()
    .from(approvals)
    .where(and(isNull(approvals.decision), isNotNull(approvals.eventId), after))
    .orderBy(asc(approvals.createdAt), asc(approvals.id))
    .limit(input.limit + 1);
  const page = rows.slice(0, input.limit);
  const next = rows.length > input.limit ? page.at(-1)!.id : null;

  const eventIds = page.flatMap((a) => (a.eventId === null ? [] : [a.eventId]));

  // 2. Labor subjects and, per worker, the whole ledger folded with its decisions.
  const events =
    eventIds.length === 0
      ? []
      : await tx
          .select()
          .from(workSessionEvents)
          .where(inArray(workSessionEvents.id, eventIds));
  const eventById = new Map(events.map((e) => [e.id, e]));
  const [company] = await tx
    .select({ timezone: companies.timezone })
    .from(companies)
    .where(eq(companies.id, user.companyId));
  if (company === undefined) throw new Error("the caller's company is not visible");
  const folds = new Map<string, ReturnType<typeof sessionApprovals>>();
  for (const workerId of new Set(events.map((e) => e.workerId))) {
    const ledger: LaborEvent[] = await readWorkerEvents(tx, workerId);
    const decisions = await decisionsOf(
      tx,
      ledger.map((e) => e.id),
    );
    folds.set(workerId, sessionApprovals(ledger, decisions));
  }

  // 3. Names for everyone and every job the page shows.
  const people = new Set<string>();
  const jobIds = new Set<string>();
  for (const e of events) {
    people.add(e.workerId).add(e.initiatorUserId);
    jobIds.add(e.jobId);
  }
  const names = await namesOf(tx, people);
  const jobNames = await jobNamesOf(tx, jobIds);

  const items: Item[] = page.map((a) => {
    const base = { approvalId: a.id, createdAt: a.createdAt, reasons: a.reasons };
    {
      const e = eventById.get(a.eventId!)!;
      const fold = folds.get(e.workerId)!;
      const { sessionRootEventId, effect } = eventEffect(fold.structural, e);
      const s = fold.structural.sessions.find(
        (x) => x.rootEventId === sessionRootEventId,
      )!;
      const counted = fold.byRoot.get(sessionRootEventId)!;
      return {
        ...base,
        // Still possible for labor (V1-D10 as amended writes no row for an admin's own): an
        // event received while the caller was not an admin, or another admin's repair of
        // their hours. approval.decide answers `own_entry` for exactly these.
        ownEntry: e.workerId === user.id,
        subject: {
          kind: "labor_event" as const,
          eventId: e.id,
          type: e.type,
          worker: named(names, e.workerId),
          initiator: named(names, e.initiatorUserId),
          job: named(jobNames, e.jobId),
          clientTimestamp: e.clientTimestamp,
          serverTimestamp: e.serverTimestamp,
          clockSkewed: e.clockSkewed,
          clockSkewMs: e.clockSkewMs,
          timeSetByUser: e.timeSetByUser,
          capturedOffline: e.capturedOffline,
          attestationLevel: e.attestationLevel,
          correctsEventId: e.correctsEventId,
          voidsEventId: e.voidsEventId,
          effect,
          session: {
            rootEventId: s.rootEventId,
            workDate: workDate(s.startedAt, company.timezone),
            state: s.state,
            complete: s.complete,
            structuralWorkedMs: s.workedMs,
            accounting: counted.accounting,
            eligibleWorkedMs: counted.eligibleWorkedMs,
          },
        },
      };
    }
  });
  return { timezone: company.timezone, items, next };
}
