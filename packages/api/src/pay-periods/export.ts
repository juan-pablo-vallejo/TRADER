// payPeriod.export: the payroll-hours file of a closed pay period (PRD, Invoicing and
// exports: payroll hours, its own file; ARCHITECTURE, V1-D18 and the 2026-11-15 scope row).
// Hours only — no rate, no pay, no overtime: TRADER exports approved hours and payroll
// computes pay. One row for each employee, job and work date of the period's own approved
// hours, then one for each adjustment it carries from earlier periods, with its original
// work date and its sign. The figures are `payPeriod.read`'s, which for a closed period are
// the lines its close stored: the file is the same bytes whatever is approved, corrected or
// repaired afterwards, and its totals are the reconciliation view's. An open period has no
// file: its hours can still change. Names are today's; ids are in the file so a renamed
// person or job is still the same one. A read: no write, no audit row.
// Consumed by routers/pay-period.ts.
import { z } from "zod";

import type { Tx } from "../core/context";
import { csv, hoursText, text } from "../core/csv";
import type { AppUser } from "../core/resolve-user";
import { readInput, readPeriod, type ReadOutput } from "./read";

export const exportInput = readInput;

export const exportOutput = z.discriminatedUnion("result", [
  z.strictObject({
    result: z.literal("exported"),
    filename: z.string(),
    csv: z.string(),
    // What the file adds up to, for the office to check against the screen.
    approvedHundredths: z.number().int(),
    adjustmentHundredths: z.number().int(),
  }),
  z.strictObject({ result: z.literal("rejected"), code: z.literal("not_closed") }),
]);

export const PAYROLL_COLUMNS = [
  "period_start",
  "period_end",
  "kind",
  "employee",
  "employee_id",
  "job",
  "job_id",
  "work_date",
  "hours",
] as const;

// Pure: the file of what a closed period's read answered.
export function payrollCsv(
  read: Pick<ReadOutput, "period" | "approved" | "adjustments">,
) {
  const row = (
    kind: "hours" | "adjustment",
    l: ReadOutput["approved"]["cells"][number],
  ) => [
    read.period.startsOn,
    read.period.endsOn,
    kind,
    text(l.worker.name),
    l.worker.id,
    text(l.job.name),
    l.job.id,
    l.workDate,
    hoursText(l.hundredths),
  ];
  return csv([
    [...PAYROLL_COLUMNS],
    ...read.approved.cells.map((l) => row("hours", l)),
    ...read.adjustments.lines.map((l) => row("adjustment", l)),
  ]);
}

export async function exportPeriod(
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof exportInput>,
): Promise<z.infer<typeof exportOutput>> {
  // Another tenant's period, or none: `readPeriod` answers FORBIDDEN.
  const read = await readPeriod(tx, user, input);
  if (read.period.closed === null) return { result: "rejected", code: "not_closed" };
  return {
    result: "exported",
    filename: `payroll-hours-${read.period.startsOn}-to-${read.period.endsOn}.csv`,
    csv: payrollCsv(read),
    approvedHundredths: read.approved.total,
    adjustmentHundredths: read.adjustments.total,
  };
}
