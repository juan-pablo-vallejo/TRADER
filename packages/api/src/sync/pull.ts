// sync.pull (ARCHITECTURE, Sync protocol; sync.pull of 2026-11-05): a per-user snapshot of the
// caller's own entries and the reference data the push admits, never anyone else's labor. Devices hold only their user's own entries offline; crew views are online-only
// (PRD, Sync and offline). One protected transaction; under READ COMMITTED each statement reads
// its own committed state, so the snapshot may combine moments, and the next pull converges. Consumed by routers/sync.ts.
import {
  companies,
  crewMembers,
  crews,
  jobs,
  users,
  workSessionEvents,
} from "@trader/db/schema";
import { and, asc, eq, inArray, isNull, ne, or } from "drizzle-orm";

import { loadDays } from "../assignments/day";
import type { Tx } from "../core/context";
import { replay } from "../labor/fold";
import { readWorkerEvents } from "../labor/timeline";
import { deriveSessions, workDate } from "../labor/work-date";
import type { AppUser } from "../core/resolve-user";
import type { PullOutput } from "../contract/pull";

// ARCHITECTURE, sync.pull: today and the 13 days before it in the company's zone, plus any
// open session whatever its age.
export const WINDOW_DAYS = 14;

export { pullInput, pullOutput, type PullOutput } from "../contract/pull";

// The caller's shifts are read from the Monday of the current week for this many days: this
// week whole, and the next, so Sunday evening already shows Monday.
export const SHIFT_DAYS = 14;

// YYYY-MM-DD minus `days`, on the calendar (no zone: a date is a date).
function daysBefore(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function pullSnapshot(tx: Tx, user: AppUser): Promise<PullOutput> {
  const serverNow = new Date();
  const [company] = await tx
    .select({
      name: companies.name,
      timezone: companies.timezone,
      scheduleEnforced: companies.scheduleEnforced,
    })
    .from(companies)
    .where(eq(companies.id, user.companyId));
  if (company === undefined) throw new Error("the caller's company is not visible");
  const from = daysBefore(workDate(serverNow, company.timezone), WINDOW_DAYS - 1);

  // Crews the caller is in or leads, active.
  const memberOf = tx
    .select({ crewId: crewMembers.crewId })
    .from(crewMembers)
    .where(eq(crewMembers.userId, user.id));
  const myCrews = await tx
    .select({ id: crews.id, name: crews.name, foremanUserId: crews.foremanUserId })
    .from(crews)
    .where(
      and(
        isNull(crews.deactivatedAt),
        or(eq(crews.foremanUserId, user.id), inArray(crews.id, memberOf)),
      ),
    )
    .orderBy(asc(crews.id));

  const jobColumns = {
    id: jobs.id,
    name: jobs.name,
    address: jobs.address,
    status: jobs.status,
  };
  const notArchived = ne(jobs.status, "archived");
  const crewIds = myCrews.map((c) => c.id);
  const jobRows =
    user.role === "admin"
      ? await tx.select(jobColumns).from(jobs).where(notArchived).orderBy(asc(jobs.id))
      : crewIds.length === 0
        ? []
        : await tx
            .select(jobColumns)
            .from(jobs)
            .where(and(notArchived, inArray(jobs.crewId, crewIds)))
            .orderBy(asc(jobs.id));

  // Led crews need the foreman role as well as the pointer: a foreman demoted by the roster
  // keeps the pointer until the office changes it (ARCHITECTURE, crew membership lifecycle)
  // and must stop receiving member names at once.
  const led =
    user.role === "foreman" ? myCrews.filter((c) => c.foremanUserId === user.id) : [];
  const memberRows =
    led.length === 0
      ? []
      : await tx
          .select({ crewId: crewMembers.crewId, id: users.id, name: users.name })
          .from(crewMembers)
          .innerJoin(users, eq(users.id, crewMembers.userId))
          .where(
            and(
              inArray(
                crewMembers.crewId,
                led.map((c) => c.id),
              ),
              isNull(users.deactivatedAt),
            ),
          )
          .orderBy(asc(users.id));
  const ledCrews = led.map((c) => ({
    id: c.id,
    name: c.name,
    members: memberRows
      .filter((m) => m.crewId === c.id)
      .map((m) => ({ id: m.id, name: m.name })),
  }));

  // The caller's labor, folded whole (the fold needs the whole ledger), then windowed.
  const ledger = await readWorkerEvents(tx, user.id);
  const kept = deriveSessions(ledger, company.timezone).filter(
    (s) => !s.complete || s.workDate >= from,
  );
  const sessionRoots = new Set(kept.map((s) => s.rootEventId));
  const { winners, sessionOf } = replay(ledger);
  const roots = new Set(
    [...winners]
      .filter(([, source]) => sessionRoots.has(sessionOf.get(source) ?? ""))
      .map(([root]) => root),
  );
  const ownEvents = ledger.filter(
    (e) =>
      roots.has(e.id) ||
      (e.correctsEventId !== null && roots.has(e.correctsEventId)) ||
      (e.voidsEventId !== null && sessionRoots.has(e.voidsEventId)),
  );

  // Each entry's flags, as stored with it.
  const flagRows =
    ownEvents.length === 0
      ? []
      : await tx
          .select({ id: workSessionEvents.id, flags: workSessionEvents.flags })
          .from(workSessionEvents)
          .where(
            inArray(
              workSessionEvents.id,
              ownEvents.map((e) => e.id),
            ),
          );
  const flagsOf = new Map(flagRows.map((r) => [r.id, r.flags]));

  // The caller's own shifts and the hours each is the eligible one, a day at a time.
  const today = workDate(serverNow, company.timezone);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = daysBefore(today, (weekday + 6) % 7);
  const ownDays = await loadDays(tx, monday, daysBefore(monday, 1 - SHIFT_DAYS), [
    user.id,
  ]);
  const shiftJobIds = [
    ...new Set([...ownDays.values()].flatMap((d) => d.shifts.map((s) => s.jobId))),
  ];
  const shiftJobs =
    shiftJobIds.length === 0
      ? []
      : await tx
          .select({ id: jobs.id, name: jobs.name, address: jobs.address })
          .from(jobs)
          .where(inArray(jobs.id, shiftJobIds));
  const shiftJob = new Map(shiftJobs.map((j) => [j.id, j]));
  const shifts = [...ownDays.values()]
    .flatMap((day) => {
      return day.shifts.map((s) => {
        const job = shiftJob.get(s.jobId);
        if (job === undefined) throw new Error("a shift's job is not visible");
        return {
          id: s.id,
          workDate: day.workDate,
          start: s.start,
          end: s.end,
          job,
          locked: s.lockedStart !== null,
        };
      });
    })
    .sort(
      (a, b) =>
        a.workDate.localeCompare(b.workDate) ||
        a.start.localeCompare(b.start) ||
        a.id.localeCompare(b.id),
    );

  return {
    serverNow,
    me: { id: user.id, role: user.role, name: user.name },
    company: { name: company.name, timezone: company.timezone },
    scheduleEnforced: company.scheduleEnforced,
    shifts,
    jobs: jobRows,
    ledCrews,
    sessions: kept.map((s) => ({
      rootEventId: s.rootEventId,
      jobId: s.jobId,
      workDate: s.workDate,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      state: s.state,
      workedMs: s.workedMs,
      breakMs: s.breakMs,
      voided: s.voided,
    })),
    events: ownEvents.map((e) => ({
      id: e.id,
      type: e.type,
      jobId: e.jobId,
      clientTimestamp: e.clientTimestamp,
      serverTimestamp: e.serverTimestamp,
      clockSkewed: e.clockSkewed,
      correctsEventId: e.correctsEventId,
      voidsEventId: e.voidsEventId,
      flags: flagsOf.get(e.id) ?? [],
    })),
  };
}
