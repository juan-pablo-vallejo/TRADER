// overview.get: what waits for the office today, as counts (PRD, Office review and job cost;
// DESIGN, Overview; ARCHITECTURE, 2026-11-15, office overview). It only counts what the
// office's own screens read — the approval queue, the labor derivation's open sessions, the
// refused-entry lines inside their retention, the week's shifts, the invoices still owed —
// under the caller's tenant
// and nothing else: no figure of money or hours, no other company, no write, no lock.
//
// Open sessions come from the one labor derivation (labor/day-hours.ts), folded over every
// worker who has an event: the same sessions the reconciliation view shows as open, never a
// second rule. The week is the company's own: Monday to Sunday around today in its zone.
// Consumed by routers/overview.ts.
import {
  approvals,
  jobAssignments,
  syncDiagnostics,
  workSessionEvents,
} from "@trader/db/schema";
import { and, gte, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import type { AppUser } from "../core/resolve-user";
import { companyZone, readDayHours } from "../labor/day-hours";
import { workDate } from "../labor/work-date";
import { RETENTION_DAYS } from "../sync/diagnostics";

const count = z.number().int().nonnegative();

export const overviewOutput = z.strictObject({
  timezone: z.string(),
  // Today's work date in that zone, and the Monday of its week.
  today: z.iso.date(),
  weekStart: z.iso.date(),
  approvalsPending: count,
  openSessions: count,
  // Lines the office can still read: inside the retention period.
  refusedEntries: count,
  shiftsThisWeek: count,
  // Issued invoices, not void, with something still owed.
  invoicesOwed: count,
});

const dayAfter = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export async function overview(
  tx: Tx,
  user: AppUser,
): Promise<z.infer<typeof overviewOutput>> {
  const timezone = await companyZone(tx, user.companyId);
  const today = workDate(new Date(), timezone);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const weekStart = dayAfter(today, -((weekday + 6) % 7));

  const approvalsPending = await tx.$count(approvals, isNull(approvals.decision));
  const refusedEntries = await tx.$count(
    syncDiagnostics,
    sql`${syncDiagnostics.createdAt} >= now() - make_interval(days => ${RETENTION_DAYS})`,
  );
  const shiftsThisWeek = await tx.$count(
    jobAssignments,
    and(
      gte(jobAssignments.workDate, weekStart),
      lte(jobAssignments.workDate, dayAfter(weekStart, 6)),
    ),
  );
  const owed = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n from invoices i
    where i.number is not null and i.voided_at is null
      and i.tax_cents
        + coalesce((select sum(l.amount_cents) from invoice_line_items l
            where l.invoice_id = i.id), 0)
        > coalesce((select sum(p.amount_cents) from invoice_payments p
            where p.invoice_id = i.id and p.reverses_payment_id is null
              and not exists (select 1 from invoice_payments r
                where r.reverses_payment_id = p.id)), 0)
  `);
  const workers = await tx
    .selectDistinct({ id: workSessionEvents.workerId })
    .from(workSessionEvents);
  const cells = await readDayHours(
    tx,
    workers.map((w) => w.id),
    timezone,
  );
  const openSessions = cells.reduce((n, cell) => n + cell.openSessions, 0);

  return {
    timezone,
    today,
    weekStart,
    approvalsPending,
    openSessions,
    refusedEntries,
    shiftsThisWeek,
    invoicesOwed: owed.rows[0]?.n ?? 0,
  };
}
