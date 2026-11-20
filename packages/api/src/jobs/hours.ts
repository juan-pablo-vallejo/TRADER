// job.list as the office's Jobs screen reads it: every job, each with the hours recorded on
// it this week and to date. The figures are the one labor derivation's
// (labor/day-hours.ts): the cells of a worker, a job and a day, each rounded once, summed
// here per job and never rounded again, so a job's hours are the same figure Hours and the
// payroll file would add up to. Time of a session still open is in neither figure. This
// week is the company's own: Monday to Sunday around today in its zone. A plain read: no
// lock, no write. Every reader of `job.list` gets the figures, the screens that only need
// names among them: one answer, one cache. Consumed by routers/job.ts.
import { workSessionEvents } from "@trader/db/schema";
import { z } from "zod";

import type { Tx } from "../core/context";
import type { AppUser } from "../core/resolve-user";
import { companyZone, readDayHours } from "../labor/day-hours";
import { workDate } from "../labor/work-date";
import { job, listJobs } from "./list";

export const jobWithHours = job.extend({
  // Integer hundredths of an hour, as everywhere.
  hours: z.strictObject({
    week: z.number().int().nonnegative(),
    toDate: z.number().int().nonnegative(),
  }),
});

export const listWithHoursOutput = z.array(jobWithHours);

const dayAfter = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export async function listJobsWithHours(
  tx: Tx,
  user: AppUser,
  now: Date = new Date(),
): Promise<z.infer<typeof listWithHoursOutput>> {
  const rows = await listJobs(tx);
  const timezone = await companyZone(tx, user.companyId);
  const today = workDate(now, timezone);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const weekStart = dayAfter(today, -((weekday + 6) % 7));
  const weekEnd = dayAfter(weekStart, 6);

  const workers = await tx
    .selectDistinct({ id: workSessionEvents.workerId })
    .from(workSessionEvents);
  const cells = await readDayHours(
    tx,
    workers.map((w) => w.id),
    timezone,
  );
  const sums = new Map<string, { week: number; toDate: number }>();
  for (const cell of cells) {
    const sum = sums.get(cell.jobId) ?? { week: 0, toDate: 0 };
    sum.toDate += cell.hundredths;
    if (cell.workDate >= weekStart && cell.workDate <= weekEnd)
      sum.week += cell.hundredths;
    sums.set(cell.jobId, sum);
  }
  return rows.map((row) => ({
    ...row,
    hours: sums.get(row.id) ?? { week: 0, toDate: 0 },
  }));
}
