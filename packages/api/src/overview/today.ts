// overview.today: the company's today as the Crew tab and the office read it. Admin only,
// at the gate. Each person with a shift today or a session begun today: their shifts, the
// clock's state and since when, and the time worked so far today; and, apart, every session
// still open from an earlier day. A plain read under RLS: no lock, no write.
//
// Sessions are the one fold's (labor/fold.ts), over the whole ledger of each person who
// could matter: anyone with an entry timed since yesterday, and anyone whose ledger holds
// more clock-ins than clock-outs, which is exactly an open session however old. Time worked
// is milliseconds as of `asOf`, the running interval of an open session included: a figure
// for a glance at the crew, never payroll's (labor/hours.ts rounds and counts ended
// sessions only).
//
// It also answers what the office's Today says of money: what customers owe, how many
// drafts wait, how many complete jobs have no invoice. Counts and sums, no list.
//
// What the answer means for a person (on the clock, late, done) is
// contract/crew.ts's to name, from this answer and the minute.
import { shifts, users, entries } from "@trader/db/schema";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import { groupBy } from "../core/group";
import type { AppUser } from "../core/resolve-user";
import { job, listJobs } from "../jobs/list";
import { sessionAccounting } from "../labor/accounting";
import { companyZone } from "../labor/day-hours";
import { workDate } from "../labor/work-date";
import { compareNames } from "../contract/order";

const wallTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const person = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  // What WhatsApp opens a chat with: the number they sign in with, else their contact phone.
  phone: z.string().nullable(),
});

const clock = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("off") }),
  z.strictObject({
    status: z.enum(["working", "paused"]),
    jobId: z.uuid(),
    // The open session's clock-in, and its day in the company's zone: earlier than `today`
    // when somebody forgot to clock out.
    since: z.date(),
    sinceDay: z.iso.date(),
  }),
]);

export const todayOutput = z.strictObject({
  timezone: z.string(),
  // The company's work date now, and the instant every figure here was computed at.
  today: z.iso.date(),
  asOf: z.date(),
  // By name, then id.
  people: z.array(
    z.strictObject({
      person,
      // Today's, in time order.
      shifts: z.array(
        z.strictObject({
          id: z.uuid(),
          jobId: z.uuid(),
          start: wallTime,
          end: wallTime,
          // Somebody clocked in on it: a clock-in locked it, or a session of theirs began
          // on its job today.
          clockedIn: z.boolean(),
        }),
      ),
      clock,
      // Time worked in sessions begun today, breaks left out, up to `asOf`.
      workedMs: z.number().int().nonnegative(),
      // The jobs of those sessions, for the list by job.
      workedJobIds: z.array(z.uuid()),
    }),
  ),
  // Sessions still open that began before today, oldest first.
  earlier: z.array(
    z.strictObject({
      person,
      jobId: z.uuid(),
      since: z.date(),
      sinceDay: z.iso.date(),
      state: z.enum(["working", "paused"]),
    }),
  ),
  // Every job named above, by name then id, with its location: the phone sets a jobsite's
  // place through `job.setLocation`.
  jobs: z.array(job),
  // What the office's Today says of money: counts and sums as the invoices stand, each
  // behind a link to its own list. Whole cents; a currency is never added to another.
  money: z.strictObject({
    // What customers owe, per currency: issued invoices, not void, with something still
    // owed after the payments that stand, and how many invoices that is.
    owed: z.array(
      z.strictObject({
        currency: z.string(),
        cents: z.number().int().nonnegative(),
        invoices: z.number().int().positive(),
      }),
    ),
    // The part of that past its due date on the company's today.
    overdue: z.array(
      z.strictObject({
        currency: z.string(),
        cents: z.number().int().nonnegative(),
        invoices: z.number().int().positive(),
      }),
    ),
    // Drafts: written, not issued.
    drafts: z.number().int().nonnegative(),
    // Jobs marked complete with no invoice that stands: no draft, and none issued that
    // was not voided.
    completeJobsNotInvoiced: z.number().int().nonnegative(),
  }),
});

type TodayOutput = z.infer<typeof todayOutput>;

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export async function overviewToday(
  tx: Tx,
  user: AppUser,
  now: Date = new Date(),
): Promise<TodayOutput> {
  const timezone = await companyZone(tx, user.companyId);
  const today = workDate(now, timezone);

  const shiftRows = await tx
    .select({
      id: shifts.id,
      userId: shifts.userId,
      jobId: shifts.jobId,
      start: shifts.expectedStart,
      end: shifts.expectedEnd,
      lockedAt: shifts.lockedAt,
    })
    .from(shifts)
    .where(eq(shifts.workDate, today))
    .orderBy(asc(shifts.expectedStart), asc(shifts.id));

  // Who has a session that could show: an entry timed since yesterday covers every session
  // begun today in any zone, and more starts than ends (roots only: a correction or a void
  // is neither) is an open session, however long ago it began.
  const active = await tx.execute<{ id: string }>(sql`
    select worker_id as id from entries
    group by worker_id
    having max(client_timestamp) >= ${today}::date - 1
      or count(*) filter (where type = 'started' and corrects_event_id is null)
       > count(*) filter (where type = 'ended' and corrects_event_id is null)
  `);
  const workerIds = active.rows.map((r) => r.id);
  const ledger =
    workerIds.length === 0
      ? []
      : await tx.select().from(entries).where(inArray(entries.workerId, workerIds));
  const ledgers = groupBy(ledger, (row) => row.workerId);

  type Clock = z.infer<typeof clock>;
  type Worked = { clock: Clock; workedMs: number; jobIds: Set<string>; begun: boolean };
  const worked = new Map<string, Worked>();
  const earlier: { userId: string; jobId: string; since: Date; sinceDay: string }[] = [];
  const earlierState = new Map<string, "working" | "paused">();
  for (const [workerId, rows] of ledgers) {
    const mine: Worked = {
      clock: { status: "off" },
      workedMs: 0,
      jobIds: new Set(),
      begun: false,
    };
    for (const s of sessionAccounting(rows).structural.sessions) {
      const day = workDate(s.startedAt, timezone);
      if (!s.complete && s.state !== "ended") {
        mine.clock = {
          status: s.state,
          jobId: s.jobId,
          since: s.startedAt,
          sinceDay: day,
        };
        if (day < today) {
          earlier.push({
            userId: workerId,
            jobId: s.jobId,
            since: s.startedAt,
            sinceDay: day,
          });
          earlierState.set(workerId, s.state);
        }
      }
      if (day !== today || s.voided) continue;
      mine.begun = true;
      mine.jobIds.add(s.jobId);
      // Closed intervals are the fold's. An open session that is working has one more,
      // still running: from its clock-in to now, less the time already counted either way.
      const running =
        !s.complete && s.state === "working"
          ? Math.max(0, now.getTime() - s.startedAt.getTime() - s.workedMs - s.breakMs)
          : 0;
      mine.workedMs += s.workedMs + running;
    }
    worked.set(workerId, mine);
  }

  const shiftsOf = groupBy(shiftRows, (row) => row.userId);
  const shown = new Set([
    ...shiftsOf.keys(),
    ...[...worked].filter(([, w]) => w.begun).map(([id]) => id),
  ]);
  const named = new Set([...shown, ...earlier.map((e) => e.userId)]);
  const personRows =
    named.size === 0
      ? []
      : await tx
          .select({
            id: users.id,
            name: users.name,
            phone: users.phone,
            signInPhone: users.signInPhone,
          })
          .from(users)
          .where(inArray(users.id, [...named]));
  const personOf = new Map(
    personRows.map((p) => [
      p.id,
      // The number the office has on file first: a contact phone nobody can change any more
      // must not stand before it.
      { id: p.id, name: p.name, phone: p.signInPhone ?? p.phone },
    ]),
  );
  const who = (id: string) => {
    const found = personOf.get(id);
    if (found === undefined) throw new Error(`a referenced person is not visible: ${id}`);
    return found;
  };

  const people = [...shown]
    .map((id) => {
      const mine = worked.get(id);
      return {
        person: who(id),
        shifts: (shiftsOf.get(id) ?? []).map((s) => ({
          id: s.id,
          jobId: s.jobId,
          start: s.start.slice(0, 5),
          end: s.end.slice(0, 5),
          clockedIn: s.lockedAt !== null || (mine?.jobIds.has(s.jobId) ?? false),
        })),
        clock: mine?.clock ?? ({ status: "off" } as const),
        workedMs: mine?.workedMs ?? 0,
        workedJobIds: [...(mine?.jobIds ?? [])].sort(compare),
      };
    })
    .sort(
      (a, b) =>
        compareNames(a.person.name, b.person.name) || compare(a.person.id, b.person.id),
    );

  const jobIds = new Set<string>();
  for (const p of people) {
    for (const s of p.shifts) jobIds.add(s.jobId);
    for (const id of p.workedJobIds) jobIds.add(id);
    if (p.clock.status !== "off") jobIds.add(p.clock.jobId);
  }
  for (const e of earlier) jobIds.add(e.jobId);
  const listed =
    jobIds.size === 0 ? [] : (await listJobs(tx)).filter((j) => jobIds.has(j.id));
  if (listed.length !== jobIds.size) throw new Error("a referenced job is not visible");

  // Money. What is owed is derived as the invoice list derives it (invoices/read.ts): the
  // stored line amounts and tax, less the payments that stand.
  const owed = await tx.execute<{
    currency: string;
    cents: string;
    invoices: number;
    overdue: string;
    overdue_invoices: number;
  }>(sql`
    select x.currency, sum(x.owed)::bigint as cents, count(*)::int as invoices,
      coalesce(sum(x.owed) filter (where x.due_on < ${today}::date), 0)::bigint as overdue,
      (count(*) filter (where x.due_on < ${today}::date))::int as overdue_invoices
    from (
      select i.currency, i.due_on,
        i.tax_cents
          + coalesce((select sum(l.amount_cents) from invoice_line_items l
              where l.invoice_id = i.id), 0)
          - coalesce((select sum(p.amount_cents) from invoice_payments p
              where p.invoice_id = i.id and p.reverses_payment_id is null
                and not exists (select 1 from invoice_payments r
                  where r.reverses_payment_id = p.id)), 0) as owed
      from invoices i
      where i.number is not null and i.voided_at is null
    ) x
    where x.owed > 0
    group by x.currency
    order by x.currency
  `);
  const counts = await tx.execute<{ drafts: number; uninvoiced: number }>(sql`
    select
      (select count(*)::int from invoices i where i.number is null) as drafts,
      (select count(*)::int from jobs j
        where j.status = 'complete'
          and not exists (select 1 from invoices i
            where i.job_id = j.id and i.voided_at is null)) as uninvoiced
  `);

  return {
    timezone,
    today,
    asOf: now,
    people,
    earlier: earlier
      .sort(
        (a, b) => a.since.getTime() - b.since.getTime() || compare(a.userId, b.userId),
      )
      .map((e) => ({
        person: who(e.userId),
        jobId: e.jobId,
        since: e.since,
        sinceDay: e.sinceDay,
        state: earlierState.get(e.userId) ?? "working",
      })),
    jobs: listed.sort((a, b) => compareNames(a.name, b.name) || compare(a.id, b.id)),
    money: {
      owed: owed.rows.map((r) => ({
        currency: r.currency,
        cents: Number(r.cents),
        invoices: r.invoices,
      })),
      overdue: owed.rows
        .filter((r) => r.overdue_invoices > 0)
        .map((r) => ({
          currency: r.currency,
          cents: Number(r.overdue),
          invoices: r.overdue_invoices,
        })),
      drafts: counts.rows[0]?.drafts ?? 0,
      completeJobsNotInvoiced: counts.rows[0]?.uninvoiced ?? 0,
    },
  };
}
