// labor.export: payroll hours for any range of work dates, as a file. One row per worker,
// work date and job with hours that have ended; the figure is that cell's own
// (labor/hours.ts: the day's total on the job, rounded once, half-up to the hundredth) and
// nothing here adds or rounds. Each row carries the flags of the entries behind it, so
// whoever runs payroll sees what the office may still want to look at. Hours only: no rate,
// no pay. There is no pay period: the same range asked again later answers what the ledger
// says then, and nothing is frozen by an export. Names are today's; ids are in the file so a
// renamed person or job is still the same one. A read: no write.
import { z } from "zod";

import { workDay } from "../assignments/write";
import type { Tx } from "../core/context";
import { csv, hoursText, text } from "../core/csv";
import type { AppUser } from "../core/resolve-user";
import { readHours, type HoursOutput } from "./day-hours";

// Any range that runs forward: a year of payroll is one file.
export const exportInput = z
  .strictObject({ from: workDay, to: workDay })
  .refine((v) => v.from <= v.to, {
    message: "A range runs forward.",
    path: ["to"],
  });

export const exportOutput = z.strictObject({
  filename: z.string(),
  csv: z.string(),
  // What the file adds up to, for the office to check against the screen.
  hundredths: z.number().int(),
  // What the range still holds that the office may want to settle first: entries that
  // carry a flag, and sessions with no clock-out, whose time is in no row of the file.
  flaggedEntries: z.number().int(),
  openSessions: z.number().int(),
});

export const PAYROLL_COLUMNS = [
  "employee",
  "employee_id",
  "work_date",
  "job",
  "job_id",
  "hours",
  "flags",
] as const;

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// Pure: the file of what the hours read answered. By employee name, then work date, then job.
export function payrollCsv(cells: HoursOutput["cells"]): string {
  const rows = cells
    .filter((c) => c.hundredths > 0)
    .sort(
      (a, b) =>
        compare(a.worker.name.toLowerCase(), b.worker.name.toLowerCase()) ||
        compare(a.worker.id, b.worker.id) ||
        compare(a.workDate, b.workDate) ||
        compare(a.job.name.toLowerCase(), b.job.name.toLowerCase()) ||
        compare(a.job.id, b.job.id),
    )
    .map((c) => [
      text(c.worker.name),
      c.worker.id,
      c.workDate,
      text(c.job.name),
      c.job.id,
      hoursText(c.hundredths),
      c.flags.join(" "),
    ]);
  return csv([[...PAYROLL_COLUMNS], ...rows]);
}

export async function exportHours(
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof exportInput>,
): Promise<z.infer<typeof exportOutput>> {
  const read = await readHours(tx, user, input);
  return {
    filename: `payroll-hours-${input.from}-to-${input.to}.csv`,
    csv: payrollCsv(read.cells),
    hundredths: read.totals.hundredths,
    flaggedEntries: read.totals.flaggedEntries,
    openSessions: read.totals.openSessions,
  };
}
