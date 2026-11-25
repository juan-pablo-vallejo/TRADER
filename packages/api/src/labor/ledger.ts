// labor.ledger: the office sees any worker's recorded day — sessions and the events behind
// them. One worker's sessions whose work date falls in
// a range of days, each with every event behind it: the sources in effect, the ones a
// correction replaced, and its void. Raw facts are the rows as stored; derived state is the
// fold's (fold.ts) and the accounting's (accounting.ts), computed here by the same functions
// the hours read uses and never a second way. It also carries what labor.correct names: a
// correction's root is the event with no `correctsEventId` (or the one a correction names),
// the source it replaces is that root's event `in_effect`, and a void names `rootEventId`.
//
// Plain reads under RLS: no lock, no write. The ledger is one
// statement, so a session's accounting is one committed state; names are read
// after and may be newer. The whole ledger is read whatever the range, because the fold is
// defined over all of it; the range selects sessions, and there is no limit, so nothing in the
// range is ever left out. No coordinates or rounded hours.
import { ROLES } from "../contract/enums";
import {
  entryFlag,
  companies,
  jobs,
  jobStatus,
  users,
  workSessionEvents,
} from "@trader/db/schema";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { workDay } from "../shifts/write";
import type { Tx } from "../core/context";
import { forbidden } from "../core/trpc";
import { eventEffect, sessionAccounting } from "./accounting";
import { workDate } from "./work-date";
import { MAX_RANGE_DAYS } from "../contract/limits";
import { daysBetween } from "../contract/calendar";

export { MAX_RANGE_DAYS };

// A range of work dates, both ends included: forward, and no longer than the bound. Refused
// past it, never truncated. Also labor/day-hours.ts's.
export const rangeWithinBound = (v: { from: string; to: string }) => {
  const days = daysBetween(v.from, v.to);
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
  // Whether a location stamp was recorded; never the stamp.
  hasLocation: z.boolean(),
  correctsEventId: z.uuid().nullable(),
  voidsEventId: z.uuid().nullable(),
  // Derived: the source in effect for its root, one a later correction replaced, or the
  // session's void.
  effect: z.enum(["in_effect", "superseded", "void"]),
  // As stored with the entry: why the office should look at it. Empty when nothing applies.
  flags: z.array(z.enum(entryFlag.enumValues)),
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
  accounting: z.enum(["eligible", "voided"]),
  eligibleWorkedMs: z.number().int(),
  // A source in effect is a correction.
  corrected: z.boolean(),
  // By recorded time, then receipt, then id.
  events: z.array(event),
});

export const ledgerOutput = z.strictObject({
  worker: z.strictObject({
    id: z.uuid(),
    name: z.string(),
    role: z.enum(ROLES),
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

type LedgerOutput = z.infer<typeof ledgerOutput>;
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

  const ledger = await tx
    .select()
    .from(workSessionEvents)
    .where(eq(workSessionEvents.workerId, worker.id));

  const { structural, byRoot } = sessionAccounting(ledger);
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
  const eventsOf = new Map<
    string,
    { row: (typeof ledger)[number]; effect: LedgerEvent["effect"] }[]
  >();
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
      .map(({ row, effect }) => ({
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
        hasLocation: row.locationLat !== null,
        correctsEventId: row.correctsEventId,
        voidsEventId: row.voidsEventId,
        effect,
        flags: row.flags,
      }));
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
