// What the job page shows beside a job's cost and never inside it (PRD, Office review and
// job cost: "with what is still pending or unpriced beside it, never folded in"). Pure, and
// no arithmetic: every figure is a field of `job.cost`'s answer (jobs/cost.ts), carried as
// the server gave it; this module only decides which lines there are to show, in one order.
// Consumed by job-detail-screen.tsx.
import type { AppRouter } from "@trader/api";
import type { inferRouterOutputs } from "@trpc/server";

export type JobCost = inferRouterOutputs<AppRouter>["job"]["cost"];
type Money = JobCost["total"];

export type Apart =
  // Approved hours with no pay rate in force on their day.
  | { kind: "unrated"; hundredths: number; lines: number }
  // Labor waiting for a decision, and what it would cost where a rate is in force.
  | {
      kind: "pendingLabor";
      hundredths: number;
      sessions: number;
      totals: Money;
      unratedHundredths: number;
    }
  | { kind: "rejectedSessions"; count: number }
  | { kind: "openSessions"; count: number }
  // Receipts that count and nobody has priced.
  | { kind: "unpricedReceipts"; count: number }
  // Receipts waiting for a decision, priced or not.
  | { kind: "pendingReceipts"; receipts: number; totals: Money; unpriced: number }
  | { kind: "rejectedReceipts"; count: number }
  | { kind: "voidedReceipts"; count: number };

// One line per figure that is not zero: labor first, then receipts.
export function apartFrom(cost: JobCost): Apart[] {
  const { labor, materials } = cost;
  const lines: Apart[] = [];
  if (labor.unrated.lines > 0) lines.push({ kind: "unrated", ...labor.unrated });
  if (labor.pending.sessions > 0) lines.push({ kind: "pendingLabor", ...labor.pending });
  if (labor.rejectedSessions > 0) {
    lines.push({ kind: "rejectedSessions", count: labor.rejectedSessions });
  }
  if (labor.openSessions > 0) {
    lines.push({ kind: "openSessions", count: labor.openSessions });
  }
  if (materials.unpriced > 0) {
    lines.push({ kind: "unpricedReceipts", count: materials.unpriced });
  }
  if (materials.pending.receipts > 0) {
    lines.push({ kind: "pendingReceipts", ...materials.pending });
  }
  if (materials.rejected > 0) {
    lines.push({ kind: "rejectedReceipts", count: materials.rejected });
  }
  if (materials.voided > 0) {
    lines.push({ kind: "voidedReceipts", count: materials.voided });
  }
  return lines;
}

// A job nobody has recorded anything on: no hours that count, no receipt that counts, and
// nothing beside them.
export const nothingRecorded = (cost: JobCost) =>
  cost.labor.lines.length === 0 &&
  cost.materials.receipts === 0 &&
  apartFrom(cost).length === 0;
