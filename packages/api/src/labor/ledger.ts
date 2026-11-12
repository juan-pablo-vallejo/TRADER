// labor.ledger (PRD, Office review: the office sees any worker's recorded day — sessions, the
// events behind them, what is pending and why). One worker's sessions whose work date falls in
// a range of days, each with every event behind it: the sources in effect, the ones a
// correction replaced, and its void. Raw facts are the rows as stored; derived state is the
// fold's (fold.ts) and the accounting's (approval.ts), computed here by the same functions the
// approval queue uses and never a second way. It also carries what labor.repair names: a
// correction's root is the event with no `correctsEventId` (or the one a correction names),
// the source it replaces is that root's event `in_effect`, and a void names `rootEventId`.
//
// Plain reads under RLS: no lock, no write, no audit row. The ledger and its decisions are one
// statement, so a session's accounting is one committed state; names and closeouts are read
// after and may be newer. The whole ledger is read whatever the range, because the fold is
// defined over all of it; the range selects sessions, and there is no limit, so nothing in the
// range is ever left out. No coordinates, cost, rate or rounded hours. Consumed by
// routers/labor.ts.
import {
  approvalReason,
  approvals,
  companies,
  dayCloseouts,
  jobs,
  jobStatus,
  userRole,
  users,
  workSessionEvents,
} from "@trader/db/schema";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { workDay } from "../assignments/write";
import type { Tx } from "../core/context";
import { forbidden } from "../core/trpc";
import { eventEffect, sessionApprovals, type Decision } from "./approval";
import { workDate } from "./work-date";

// The longest range one read covers: any month.
export const MAX_RANGE_DAYS = 31;

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;

// A range of work dates, both ends included: forward, and no longer than the bound. Refused
// past it, never truncated. Also labor/day-hours.ts's.
export const rangeWithinBound = (v: { from: string; to: string }) => {
  const days = dayNumber(v.to) - dayNumber(v.from);
  return days >= 0 && days < MAX_RANGE_DAYS;
};
export const RANGE_REFUSAL = {
  message: `A range runs forward and covers at most ${MAX_RANGE_DAYS} days.`,
  path: ["to"],
};

export const ledgerInput = z
  .strictObject({ workerId: z.uuid(), from: workDay, to: workDay })
  .refine(rangeWithinBound, RANGE_REFUSAL);

const person = z.strictObject({ id: z.uuid(), name: z.string() });

const event = z.strictObject({
  // As stored.
  id: z.uuid(),
  type: z.enum(["started", "paused", "resumed", "ended", "voided"]),
  // The row's own job: a session's job is its effective start's, below.
  job: z.strictObject({ id: z.uuid(), name: z.string() }),
  clientTimestamp: z.date(),
  serverTimestamp: z.date(),
  initiator: person,
  clockSkewed: z.boolean(),
  clockSkewMs: z.number().int(),
  timeSetByUser: z.boolean(),
  capturedOffline: z.boolean(),
  attestationLevel: z.enum(["biometric", "device_credential", "none"]),
  // Whether a location stamp was recorded; never the stamp.
  hasLocation: z.boolean(),
  correctsEventId: z.uuid().nullable(),
  voidsEventId: z.uuid().nullable(),
  // Derived: the source in effect for its root, one a later correction replaced, or the
  // session's void.
  effect: z.enum(["in_effect", "superseded", "void"]),
  // As stored; null is no approvals row, which is approved by default.
  approval: z
    .strictObject({
      id: z.uuid(),
      reasons: z.array(z.enum(approvalReason.enumValues)).min(1),
      decision: z.enum(["pending", "approved", "rejected"]),
      decidedAt: z.date().nullable(),
      decidedBy: person.nullable(),
    })
    .nullable(),
});

const session = z.strictObject({
  // The `started` row's id: what a void names.
  rootEventId: z.uuid(),
  workDate: z.iso.date(),
  job: z.strictObject({
    id: z.uuid(),
    name: z.string(),
    status: z.enum(jobStatus.enumValues),
  }),
  startedAt: z.date(),
  endedAt: z.date().nullable(),
  state: z.enum(["working", "paused", "ended"]),
  complete: z.boolean(),
  // The fold's; an open session counts its closed intervals only.
  structuralWorkedMs: z.number().int(),
  breakMs: z.number().int(),
  accounting: z.enum(["eligible", "pending", "rejected", "voided"]),
  eligibleWorkedMs: z.number().int(),
  // A source in effect is a correction.
  corrected: z.boolean(),
  // A closeout holds this session's job on its start's day, in the closeout's own zone.
  closedOut: z.boolean(),
  // By recorded time, then receipt, then id.
  events: z.array(event),
});

export const ledgerOutput = z.strictObject({
  worker: z.strictObject({
    id: z.uuid(),
    name: z.string(),
    role: z.enum(userRole.enumValues),
    active: z.boolean(),
  }),
  // The zone every work date here was judged in.
  timezone: z.string(),
  // The worker's open session whatever its date: it refuses every later clock-in, so the
  // office is told of it even when the range does not hold it.
  openSession: z
    .strictObject({ rootEventId: z.uuid(), workDate: z.iso.date() })
    .nullable(),
  // In timeline order.
  sessions: z.array(session),
});

export type LedgerOutput = z.infer<typeof ledgerOutput>;
type LedgerEvent = z.infer<typeof event>;

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function named(names: Map<string, string>, id: string) {
  const name = names.get(id);
  if (name === undefined) throw new Error(`a referenced row is not visible: ${id}`);
  return { id, name };
}

export async function workerLedger(
  tx: Tx,
  input: z.infer<typeof ledgerInput>,
): Promise<LedgerOutput> {
  // A person who is missing or another tenant's is the one answer every office procedure
  // gives, never an empty ledger that could be read as "nothing recorded".
  const [worker] = await tx
    .select({
      id: users.id,
      companyId: users.companyId,
      name: users.name,
      role: users.role,
      deactivatedAt: users.deactivatedAt,
    })
    .from(users)
    .where(eq(users.id, input.workerId));
  if (worker === undefined) throw forbidden();

  const [company] = await tx
    .select({ timezone: companies.timezone })
    .from(companies)
    .where(eq(companies.id, worker.companyId));
  if (company === undefined) throw new Error("a user's company is not visible");
  const { timezone } = company;

  // The ledger with each event's approval, in one statement.
  const rows = await tx
    .select({ event: workSessionEvents, approval: approvals })
    .from(workSessionEvents)
    .leftJoin(approvals, eq(approvals.eventId, workSessionEvents.id))
    .where(eq(workSessionEvents.workerId, worker.id));
  const ledger = rows.map((r) => r.event);
  const decisions = new Map<string, Decision>(
    rows.flatMap((r) => (r.approval === null ? [] : [[r.event.id, r.approval.decision]])),
  );
  const approvalOf = new Map(
    rows.flatMap((r) => (r.approval === null ? [] : [[r.event.id, r.approval]])),
  );

  const { structural, byRoot } = sessionApprovals(ledger, decisions);
  const dated = structural.sessions.map((s) => ({
    s,
    workDate: workDate(s.startedAt, timezone),
  }));
  const kept = dated.filter((d) => d.workDate >= input.from && d.workDate <= input.to);
  const keptRoots = new Set(kept.map((d) => d.s.rootEventId));
  const last = dated.at(-1);
  const openSession =
    last !== undefined && !last.s.complete
      ? { rootEventId: last.s.rootEventId, workDate: last.workDate }
      : null;

  // Every event of the kept sessions, whatever its own time: a correction or a void belongs
  // to the session of the root it names.
  const eventsOf = new Map<string, { row: (typeof ledger)[number]; effect: string }[]>();
  for (const row of ledger) {
    const { sessionRootEventId, effect } = eventEffect(structural, row);
    if (!keptRoots.has(sessionRootEventId)) continue;
    const list = eventsOf.get(sessionRootEventId) ?? [];
    list.push({ row, effect });
    eventsOf.set(sessionRootEventId, list);
  }
  const shown = [...eventsOf.values()].flat().map((e) => e.row);

  const people = new Set<string>();
  const jobIds = new Set<string>(kept.map((d) => d.s.jobId));
  for (const row of shown) {
    people.add(row.initiatorUserId);
    jobIds.add(row.jobId);
    const decidedBy = approvalOf.get(row.id)?.decidedByUserId;
    if (decidedBy != null) people.add(decidedBy);
  }
  const names = new Map(
    people.size === 0
      ? []
      : (
          await tx
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(inArray(users.id, [...people]))
        ).map((r) => [r.id, r.name]),
  );
  const jobRows =
    jobIds.size === 0
      ? []
      : await tx
          .select({ id: jobs.id, name: jobs.name, status: jobs.status })
          .from(jobs)
          .where(inArray(jobs.id, [...jobIds]));
  const jobNames = new Map(jobRows.map((j) => [j.id, j.name]));
  const jobStatusOf = new Map(jobRows.map((j) => [j.id, j.status]));

  // Closeouts that could hold a kept session: the day in a closeout's own zone is within one
  // day of the day in the company's. The exact test is closedOn's (closeout/day.ts), in code.
  const sessionJobs = [...new Set(kept.map((d) => d.s.jobId))];
  const closeouts =
    sessionJobs.length === 0
      ? []
      : await tx
          .select({
            jobId: dayCloseouts.jobId,
            workDate: dayCloseouts.workDate,
            timezone: dayCloseouts.timezone,
          })
          .from(dayCloseouts)
          .where(
            and(
              inArray(dayCloseouts.jobId, sessionJobs),
              gte(dayCloseouts.workDate, sql`${input.from}::date - 1`),
              lte(dayCloseouts.workDate, sql`${input.to}::date + 1`),
            ),
          );

  const corrections = new Set(
    ledger.filter((e) => e.correctsEventId !== null).map((e) => e.id),
  );

  const sessions = kept.map(({ s, workDate: day }) => {
    const counted = byRoot.get(s.rootEventId)!;
    const events: LedgerEvent[] = (eventsOf.get(s.rootEventId) ?? [])
      .sort(
        (a, b) =>
          a.row.clientTimestamp.getTime() - b.row.clientTimestamp.getTime() ||
          a.row.serverTimestamp.getTime() - b.row.serverTimestamp.getTime() ||
          compareIds(a.row.id, b.row.id),
      )
      .map(({ row, effect }) => {
        const a = approvalOf.get(row.id);
        return {
          id: row.id,
          type: row.type,
          job: named(jobNames, row.jobId),
          clientTimestamp: row.clientTimestamp,
          serverTimestamp: row.serverTimestamp,
          initiator: named(names, row.initiatorUserId),
          clockSkewed: row.clockSkewed,
          clockSkewMs: row.clockSkewMs,
          timeSetByUser: row.timeSetByUser,
          capturedOffline: row.capturedOffline,
          attestationLevel: row.attestationLevel,
          hasLocation: row.locationLat !== null,
          correctsEventId: row.correctsEventId,
          voidsEventId: row.voidsEventId,
          effect: effect as LedgerEvent["effect"],
          approval:
            a === undefined
              ? null
              : {
                  id: a.id,
                  reasons: a.reasons,
                  decision: a.decision ?? ("pending" as const),
                  decidedAt: a.decidedAt,
                  decidedBy:
                    a.decidedByUserId === null ? null : named(names, a.decidedByUserId),
                },
        };
      });
    return {
      rootEventId: s.rootEventId,
      workDate: day,
      job: { ...named(jobNames, s.jobId), status: jobStatusOf.get(s.jobId)! },
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      state: s.state,
      complete: s.complete,
      structuralWorkedMs: s.workedMs,
      breakMs: s.breakMs,
      accounting: counted.accounting,
      eligibleWorkedMs: counted.eligibleWorkedMs,
      corrected: s.eventSourceIds.some((id) => corrections.has(id)),
      closedOut: closeouts.some(
        (c) => c.jobId === s.jobId && workDate(s.startedAt, c.timezone) === c.workDate,
      ),
      events,
    };
  });

  return {
    worker: {
      id: worker.id,
      name: worker.name,
      role: worker.role,
      active: worker.deactivatedAt === null,
    },
    timezone,
    openSession,
    sessions,
  };
}
