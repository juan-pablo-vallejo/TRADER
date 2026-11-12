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
