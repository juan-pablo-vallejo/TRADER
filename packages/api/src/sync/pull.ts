// sync.pull: a per-user snapshot of the caller's own entries and the reference data the push
// admits, never anyone else's labor. One protected transaction; under READ COMMITTED each
// statement reads its own committed state, so the snapshot may combine moments, and the next
// pull converges.
import { companies, jobs, users, entries } from "@trader/db/schema";
import { asc, eq, inArray, ne } from "drizzle-orm";

import { loadDays } from "../shifts/day";
import type { Tx } from "../core/context";
import { replay } from "../labor/fold";
import { readWorkerEvents } from "../labor/timeline";
import { deriveSessions, workDate } from "../labor/work-date";
import type { AppUser } from "../core/resolve-user";
import type { PullOutput } from "../contract/pull";
import { stampsOn } from "./scope";
import { addDays, mondayOf } from "../contract/calendar";

// Today and the 13 days before it in the company's zone, plus any
// open session whatever its age.
const WINDOW_DAYS = 14;

export { pullInput, pullOutput, type PullOutput } from "../contract/pull";

// The caller's shifts are read from the Monday of the current week for this many days: this
// week whole, and the next, so Sunday evening already shows Monday.
const SHIFT_DAYS = 14;

export async function pullSnapshot(tx: Tx, user: AppUser): Promise<PullOutput> {
  const serverNow = new Date();
  const [company] = await tx
    .select({
      name: companies.name,
      timezone: companies.timezone,
      scheduleEnforced: companies.scheduleEnforced,
      phone: companies.phone,
      locationStamps: companies.locationStamps,
    })
    .from(companies)
    .where(eq(companies.id, user.companyId));
  if (company === undefined) throw new Error("the caller's company is not visible");
  const [self] = await tx
    .select({ locationStamps: users.locationStamps })
    .from(users)
    .where(eq(users.id, user.id));
  if (self === undefined) throw new Error("the caller's own row is not visible");
  const today = workDate(serverNow, company.timezone);
  const from = addDays(today, 1 - WINDOW_DAYS);

  // Every job a start may name: not archived. Under the schedule the phone offers the
  // shift's own job; without it, the person picks from these.
  const jobRows = await tx
    .select({
      id: jobs.id,
      name: jobs.name,
      address: jobs.address,
      notes: jobs.notes,
      status: jobs.status,
    })
    .from(jobs)
    .where(ne(jobs.status, "archived"))
    .orderBy(asc(jobs.id));

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
          .select({ id: entries.id, flags: entries.flags })
          .from(entries)
          .where(
            inArray(
              entries.id,
              ownEvents.map((e) => e.id),
            ),
          );
  const flagsOf = new Map(flagRows.map((r) => [r.id, r.flags]));

  // The caller's own shifts and the hours each is the eligible one, a day at a time.
  const monday = mondayOf(today);
  const ownDays = await loadDays(tx, monday, addDays(monday, SHIFT_DAYS - 1), [user.id]);
  const shiftJobIds = [
    ...new Set([...ownDays.values()].flatMap((d) => d.shifts.map((s) => s.jobId))),
  ];
  const shiftJobs =
    shiftJobIds.length === 0
      ? []
      : await tx
          .select({
            id: jobs.id,
            name: jobs.name,
            address: jobs.address,
            notes: jobs.notes,
          })
          .from(jobs)
          .where(inArray(jobs.id, shiftJobIds));
  const shiftJob = new Map(shiftJobs.map((j) => [j.id, j]));
  const ownShifts = [...ownDays.values()]
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
    company: { name: company.name, timezone: company.timezone, phone: company.phone },
    scheduleEnforced: company.scheduleEnforced,
    locationStamps: stampsOn(self.locationStamps, company.locationStamps),
    shifts: ownShifts,
    jobs: jobRows,
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
