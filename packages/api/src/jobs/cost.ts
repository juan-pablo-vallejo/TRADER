// Job cost to date (PRD, Office review and job cost: approved labor at the rate in force on
// each work date plus priced materials, with what is pending or unpriced beside it, never
// folded in). The arithmetic of money is here and nowhere else: integer cents with their
// currency, no float, and a total only ever within one currency (invariant 3).
//
// A labor line is one worker's rounded hours on the job on one work date (labor/hours.ts)
// times the rate in force that day, rounded half-up to the cent; the job's labor cost is the
// sum of its lines, so every total reconciles to the lines shown (owner, 2026-11-12). This is
// what the job cost the contractor: it informs the office and is never a price (V1-D14), and
// it is no pay calculation — payroll computes pay from the exported hours.
//
// job.cost reads one job: the hours that count are labor/day-hours.ts's cells for this job,
// each priced at the rate in force on its work date (roster/rate-on.ts); a receipt counts by
// materials/approval.ts and is priced by what the office entered, its total as stored. In the
// total: approved, ended labor that has a rate, and receipts that count and are priced.
// Beside it, in no total: approved hours with no rate in force that day, pending labor,
// sessions rejected or still open, receipts that count but are not priced, pending receipts.
// Plain reads under RLS: no lock, no write, no audit row. The labor ledger with its decisions
// is one statement; rates and receipts are read after it and may be newer. No limit: a total
// to date that left something out would be wrong. Consumed by routers/job.ts.
import {
  jobStatus,
  materials,
  payRates,
  users,
  workSessionEvents,
} from "@trader/db/schema";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";
import { companyZone, readDayHours } from "../labor/day-hours";
import { receiptAccounting } from "../materials/approval";
import { effectiveMaterial } from "../materials/effective";
import { receiptStandings } from "../materials/standing";
import { rateOn } from "../roster/rate-on";
import { readJob } from "./list";

// Hundredths of an hour at an hourly rate in cents, to the cent, half-up.
export function lineCents(hundredths: number, hourlyRateCents: number): number {
  const product = hundredths * hourlyRateCents;
  if (
    !Number.isSafeInteger(hundredths) ||
    !Number.isSafeInteger(hourlyRateCents) ||
    hundredths < 0 ||
    hourlyRateCents < 0 ||
    !Number.isSafeInteger(product + 50)
  ) {
    throw new Error(
      `a labor line is whole, non-negative and exact: ${hundredths} × ${hourlyRateCents}`,
    );
  }
  return Math.floor((product + 50) / 100);
}

export type Money = { currency: string; cents: number };

// Totals by currency, in currency order. Amounts in different currencies are never added.
export function byCurrency(amounts: readonly Money[]): Money[] {
  const totals = new Map<string, number>();
  for (const { currency, cents } of amounts) {
    const sum = (totals.get(currency) ?? 0) + cents;
    if (!Number.isSafeInteger(cents) || !Number.isSafeInteger(sum)) {
      throw new Error(`a total is a whole number of cents: ${currency}`);
    }
    totals.set(currency, sum);
  }
  return [...totals]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([currency, cents]) => ({ currency, cents }));
}

export const costInput = z.strictObject({ jobId: z.uuid() });

const money = z.strictObject({ currency: z.string(), cents: z.number().int() });

export const costOutput = z.strictObject({
  job: z.strictObject({
    id: z.uuid(),
    name: z.string(),
    status: z.enum(jobStatus.enumValues),
  }),
  // The zone every work date here was judged in.
  timezone: z.string(),
  labor: z.strictObject({
    // One per worker and work date with approved hours, by date then worker id.
    lines: z.array(
      z.strictObject({
        worker: z.strictObject({ id: z.uuid(), name: z.string() }),
        workDate: z.iso.date(),
        // Hundredths of an hour, as labor.hours answers them.
        hundredths: z.number().int(),
        // The rate in force on the work date; null when the worker had none yet.
        rate: z
          .strictObject({ hourlyRateCents: z.number().int(), currency: z.string() })
          .nullable(),
        // Null exactly when the rate is: unrated hours have no cost, not a cost of zero.
        cents: z.number().int().nullable(),
      }),
    ),
    approvedHundredths: z.number().int(),
    // The sum of the rated lines, by currency.
    totals: z.array(money),
    // Approved hours with no rate in force on their day: in no total.
    unrated: z.strictObject({ hundredths: z.number().int(), lines: z.number().int() }),
    // Waiting for a decision: in no total. Priced the same way, where a rate is in force.
    pending: z.strictObject({
      hundredths: z.number().int(),
      sessions: z.number().int(),
      totals: z.array(money),
      unratedHundredths: z.number().int(),
    }),
    rejectedSessions: z.number().int(),
    // Sessions that count but have no clock-out yet: nothing of theirs is above.
    openSessions: z.number().int(),
  }),
  materials: z.strictObject({
    // Receipts that count and are priced, by currency, and how many.
    totals: z.array(money),
    receipts: z.number().int(),
    // Receipts that count and nobody has priced: in no total.
    unpriced: z.number().int(),
    // Receipts waiting for a decision: in no total.
    pending: z.strictObject({
      totals: z.array(money),
      receipts: z.number().int(),
      unpriced: z.number().int(),
    }),
    rejected: z.number().int(),
    voided: z.number().int(),
  }),
  // Job cost to date: labor.totals plus materials.totals, by currency, and nothing else.
  total: z.array(money),
});

export type CostOutput = z.infer<typeof costOutput>;

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export async function jobCost(
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof costInput>,
): Promise<CostOutput> {
  // A job that is not visible (another tenant's, under RLS) is the one FORBIDDEN.
  const job = await readJob(tx, input.jobId);
  if (job === undefined) throw forbidden();
  const timezone = await companyZone(tx, user.companyId);

  // Everyone with a session on the job: a session's job is its effective start's, and that
  // row — the start, or the correction that moved the session here — names this job.
  const workerIds = (
    await tx
      .selectDistinct({ id: workSessionEvents.workerId })
      .from(workSessionEvents)
      .where(eq(workSessionEvents.jobId, job.id))
  ).map((r) => r.id);
  const cells = (await readDayHours(tx, workerIds, timezone))
    .filter((c) => c.jobId === job.id)
    .sort((a, b) => compare(a.workDate, b.workDate) || compare(a.workerId, b.workerId));

  const people = [...new Set(cells.map((c) => c.workerId))];
  const rateRows =
    people.length === 0
      ? []
      : await tx
          .select({
            userId: payRates.userId,
            effectiveFrom: payRates.effectiveFrom,
            hourlyRateCents: payRates.hourlyRateCents,
            currency: payRates.currency,
          })
          .from(payRates)
          .where(inArray(payRates.userId, people));
  const nameRows =
    people.length === 0
      ? []
      : await tx
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, people));
  const names = new Map(nameRows.map((r) => [r.id, r.name]));
  const rateFor = (workerId: string, day: string) =>
    rateOn(
      rateRows.filter((r) => r.userId === workerId),
      day,
    );

  const lines: CostOutput["labor"]["lines"] = [];
  const counted: Money[] = [];
  const waiting: Money[] = [];
  const labor = {
    approvedHundredths: 0,
    unrated: { hundredths: 0, lines: 0 },
    pending: { hundredths: 0, sessions: 0, unratedHundredths: 0 },
    rejectedSessions: 0,
    openSessions: 0,
  };
  for (const c of cells) {
    const rate = rateFor(c.workerId, c.workDate);
    if (c.approvedMs > 0) {
      const name = names.get(c.workerId);
      if (name === undefined) throw new Error(`a worker is not visible: ${c.workerId}`);
      const cents =
        rate === null ? null : lineCents(c.approvedHundredths, rate.hourlyRateCents);
      lines.push({
        worker: { id: c.workerId, name },
        workDate: c.workDate,
        hundredths: c.approvedHundredths,
        rate:
          rate === null
            ? null
            : { hourlyRateCents: rate.hourlyRateCents, currency: rate.currency },
        cents,
      });
      labor.approvedHundredths += c.approvedHundredths;
      if (rate === null || cents === null) {
        labor.unrated.hundredths += c.approvedHundredths;
        labor.unrated.lines++;
      } else counted.push({ currency: rate.currency, cents });
    }
    if (c.pendingSessions > 0) {
      labor.pending.sessions += c.pendingSessions;
      labor.pending.hundredths += c.pendingHundredths;
      if (rate === null) labor.pending.unratedHundredths += c.pendingHundredths;
      else {
        waiting.push({
          currency: rate.currency,
          cents: lineCents(c.pendingHundredths, rate.hourlyRateCents),
        });
      }
    }
    labor.rejectedSessions += c.rejectedSessions;
    labor.openSessions += c.openSessions;
  }

  // Every receipt of the job, each judged as material.list judges it.
  const receipts = await tx
    .select({
      id: materials.id,
      description: materials.description,
      quantity: materials.quantity,
      unit: materials.unit,
      costCents: materials.costCents,
      currency: materials.currency,
    })
    .from(materials)
    .where(eq(materials.jobId, job.id));
  const standings = await receiptStandings(
    tx,
    receipts.map((m) => m.id),
  );
  const priced: Money[] = [];
  const pendingPriced: Money[] = [];
  const stock = {
    receipts: 0,
    unpriced: 0,
    pending: { receipts: 0, unpriced: 0 },
    rejected: 0,
    voided: 0,
  };
  for (const m of receipts) {
    const accounting = receiptAccounting(
      standings.decisionOf(m.id),
      effectiveMaterial(m, standings.correctionsOf(m.id)),
    );
    // Both columns or neither (materials_cost_complete).
    const cost =
      m.costCents === null || m.currency === null
        ? null
        : { currency: m.currency, cents: m.costCents };
    if (accounting === "voided") stock.voided++;
    else if (accounting === "rejected") stock.rejected++;
    else if (accounting === "pending") {
      stock.pending.receipts++;
      if (cost === null) stock.pending.unpriced++;
      else pendingPriced.push(cost);
    } else if (cost === null) stock.unpriced++;
    else {
      stock.receipts++;
      priced.push(cost);
    }
  }

  const laborTotals = byCurrency(counted);
  const materialTotals = byCurrency(priced);
  return {
    job: { id: job.id, name: job.name, status: job.status },
    timezone,
    labor: {
      lines,
      approvedHundredths: labor.approvedHundredths,
      totals: laborTotals,
      unrated: labor.unrated,
      pending: { ...labor.pending, totals: byCurrency(waiting) },
      rejectedSessions: labor.rejectedSessions,
      openSessions: labor.openSessions,
    },
    materials: {
      totals: materialTotals,
      receipts: stock.receipts,
      unpriced: stock.unpriced,
      pending: { ...stock.pending, totals: byCurrency(pendingPriced) },
      rejected: stock.rejected,
      voided: stock.voided,
    },
    total: byCurrency([...laborTotals, ...materialTotals]),
  };
}
