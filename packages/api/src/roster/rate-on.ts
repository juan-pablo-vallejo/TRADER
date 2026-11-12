// The rate in force on a work date (packages/db pay.ts: one row per rate change, no end
// date): of one person's rates, the one with the greatest effective_from on or before that
// day; null when none had started, which is unpriced, never zero. Pure, in a file of its own
// so a pure consumer loads no query. Days are YYYY-MM-DD, which order as text. A rate inside
// a closed period is the pay-period task's rule. Consumed by jobs/cost.ts.
export function rateOn<R extends { effectiveFrom: string }>(
  rates: readonly R[],
  day: string,
): R | null {
  let inForce: R | null = null;
  for (const r of rates) {
    if (r.effectiveFrom > day) continue;
    if (inForce === null || r.effectiveFrom > inForce.effectiveFrom) inForce = r;
  }
  return inForce;
}
