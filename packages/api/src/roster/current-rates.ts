// The shape of one pay rate and the rate in force today (packages/db pay.ts: one row per
// rate change, no end date). A leaf of its own: list.ts answers each person with their rate
// and pay-rates.ts checks the person through list.ts, so neither may load the other for
// this. Consumed by list.ts and pay-rates.ts.
import { companies, payRates } from "@trader/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";

export const rate = z.strictObject({
  id: z.uuid(),
  effectiveFrom: z.iso.date(),
  hourlyRateCents: z.number().int(),
  currency: z.string(),
});

export type Rate = z.infer<typeof rate>;

export const rateColumns = {
  id: payRates.id,
  effectiveFrom: payRates.effectiveFrom,
  hourlyRateCents: payRates.hourlyRateCents,
  currency: payRates.currency,
};

// The rate in force today for every user who has one: the greatest effective_from on or
// before today's date in companies.timezone (RULES: work dates are judged in it).
export async function currentRates(tx: Tx): Promise<Map<string, Rate>> {
  const rows = await tx
    .selectDistinctOn([payRates.userId], { userId: payRates.userId, ...rateColumns })
    .from(payRates)
    .innerJoin(companies, eq(companies.id, payRates.companyId))
    .where(
      sql`${payRates.effectiveFrom} <= (now() at time zone ${companies.timezone})::date`,
    )
    .orderBy(payRates.userId, desc(payRates.effectiveFrom));
  return new Map(rows.map(({ userId, ...r }) => [userId, r]));
}
