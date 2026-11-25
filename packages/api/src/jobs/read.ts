// job.read: where one job stands, in one call, for the office's job page. Admin only, at
// the gate. A plain read under RLS: no lock, no write.
//
// Four steps, each derived here and never stored: Scheduled (a shift on it today or
// later), Hours recorded (a session on it that counts, ended or still open), Invoiced (an
// issued invoice of its own that is not void), Paid (invoiced, and nothing owed on those
// invoices). Then its people: everyone with a shift on it this week, on it now, or with
// hours on it to date, each with their hours on this job and the number that reaches them.
// Then its invoices as the list shows them, and the job's own facts.
//
// Hours are the one labor derivation's (labor/day-hours.ts), summed and never rounded
// again, as job.list's are (jobs/hours.ts). The week is the company's own, Monday to
// Sunday.
import { jobAssignments, users, workSessionEvents } from "@trader/db/schema";
import { and, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";
import { jobInvoices, listOutput } from "../invoices/read";
import { companyZone, readDayHours } from "../labor/day-hours";
import { workDate } from "../labor/work-date";
import { job, readJob } from "./list";
import { compareNames } from "../contract/order";

export const readInput = z.strictObject({ jobId: z.uuid() });

const hundredths = z.number().int().nonnegative();

export const readOutput = z.strictObject({
  job,
  timezone: z.string(),
  today: z.iso.date(),
  // The Monday the week's figures start on.
  weekStart: z.iso.date(),
  steps: z.strictObject({
    scheduled: z.boolean(),
    hoursRecorded: z.boolean(),
    invoiced: z.boolean(),
    paid: z.boolean(),
  }),
  hours: z.strictObject({ week: hundredths, toDate: hundredths }),
  // By name, then id.
  people: z.array(
    z.strictObject({
      person: z.strictObject({
        id: z.uuid(),
        name: z.string(),
        // Their contact phone, else the number they sign in with.
        phone: z.string().nullable(),
      }),
      scheduledThisWeek: z.boolean(),
      // On the clock or on a break on this job now.
      onItNow: z.boolean(),
      hours: z.strictObject({ week: hundredths, toDate: hundredths }),
    }),
  ),
  // This job's invoices, as the list orders them: drafts first, then by number, newest
  // first.
  invoices: listOutput,
});

const dayAfter = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export async function readJobPage(
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof readInput>,
  now: Date = new Date(),
): Promise<z.infer<typeof readOutput>> {
  const found = await readJob(tx, input.jobId);
  // Missing, or another tenant's and so invisible: one answer.
  if (found === undefined) throw forbidden();

  const timezone = await companyZone(tx, user.companyId);
  const today = workDate(now, timezone);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const weekStart = dayAfter(today, -((weekday + 6) % 7));
  const weekEnd = dayAfter(weekStart, 6);

  // Shifts on this job from the week's Monday on: this week's people, and whether any is
  // today or later.
  const shifts = await tx
    .select({ userId: jobAssignments.userId, workDate: jobAssignments.workDate })
    .from(jobAssignments)
    .where(
      and(eq(jobAssignments.jobId, found.id), gte(jobAssignments.workDate, weekStart)),
    );
  const scheduled = shifts.some((s) => s.workDate >= today);
  const thisWeek = new Set(
    shifts.filter((s) => s.workDate <= weekEnd).map((s) => s.userId),
  );

  // Everyone who has an entry on this job: their whole ledgers are folded, since a session
  // is the fold's, and only their cells on this job are kept.
  const workers = await tx
    .selectDistinct({ id: workSessionEvents.workerId })
    .from(workSessionEvents)
    .where(eq(workSessionEvents.jobId, found.id));
  const cells = (
    await readDayHours(
      tx,
      workers.map((w) => w.id),
      timezone,
    )
  ).filter((c) => c.jobId === found.id);

  type Sum = { week: number; toDate: number; open: boolean };
  const byPerson = new Map<string, Sum>();
  for (const cell of cells) {
    const sum = byPerson.get(cell.workerId) ?? { week: 0, toDate: 0, open: false };
    sum.toDate += cell.hundredths;
    if (cell.workDate >= weekStart && cell.workDate <= weekEnd)
      sum.week += cell.hundredths;
    if (cell.openSessions > 0) sum.open = true;
    byPerson.set(cell.workerId, sum);
  }
  const total = [...byPerson.values()].reduce(
    (sum, p) => ({ week: sum.week + p.week, toDate: sum.toDate + p.toDate }),
    { week: 0, toDate: 0 },
  );

  const ids = [...new Set([...thisWeek, ...byPerson.keys()])];
  const rows =
    ids.length === 0
      ? []
      : await tx
          .select({
            id: users.id,
            name: users.name,
            phone: users.phone,
            signInPhone: users.signInPhone,
          })
          .from(users)
          .where(inArray(users.id, ids));
  const people = rows
    .map((u) => {
      const sum = byPerson.get(u.id);
      return {
        person: { id: u.id, name: u.name, phone: u.phone ?? u.signInPhone },
        scheduledThisWeek: thisWeek.has(u.id),
        onItNow: sum?.open ?? false,
        hours: { week: sum?.week ?? 0, toDate: sum?.toDate ?? 0 },
      };
    })
    .sort(
      (a, b) =>
        compareNames(a.person.name, b.person.name) || compare(a.person.id, b.person.id),
    );

  const invoices = await jobInvoices(tx, found.id, now);
  const standing = invoices.filter((i) => i.state === "issued");

  return {
    job: found,
    timezone,
    today,
    weekStart,
    steps: {
      scheduled,
      // A cell exists only for a session that counts: ended, or still open.
      hoursRecorded: cells.length > 0,
      invoiced: standing.length > 0,
      paid: standing.length > 0 && standing.every((i) => i.owedCents === 0),
    },
    hours: total,
    people,
    invoices,
  };
}
