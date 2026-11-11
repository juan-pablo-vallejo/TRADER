// roster.setPayRate and roster.payRates (PRD, Labor: pay rates are effective-dated;
// ARCHITECTURE: effective-dated rates, no pay calculation in V1). The model is pay.ts as it
// stands: one row per (user, effective_from), no end date, the rate in force on a day the row
// with the greatest effective_from on or before it. This API only inserts: a second rate for
// the same day is `rate_exists` with the standing row, and no rate is ever updated or deleted,
// so the history a closed period relied on is never rewritten here (the closed-period rule is
// the pay-period task's). The unique index is the race guard; no row lock beyond the foreign
// key's. Consumed by routers/roster.ts and, for the rate in force, by list.ts.
import { companies, payRates } from "@trader/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";
import { readRosterUser } from "./list";

export const rate = z.strictObject({
  id: z.uuid(),
  effectiveFrom: z.iso.date(),
  hourlyRateCents: z.number().int(),
  currency: z.string(),
});

export type Rate = z.infer<typeof rate>;

export const setPayRateInput = z.strictObject({
  userId: z.uuid(),
  effectiveFrom: z.iso.date(),
  // Integer minor units (RULES); the column is integer (pay.ts).
  hourlyRateCents: z.number().int().min(0).max(2147483647),
  // ISO 4217, upper case; zod supplies USD (pay.ts).
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default("USD"),
});

export type SetPayRateInput = z.infer<typeof setPayRateInput>;

export const setPayRateOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("added"), rate }),
  // A rate for this worker from this day already exists; it stands. Nothing is written.
  z.strictObject({
    result: z.literal("rejected"),
    code: z.literal("rate_exists"),
    standing: rate,
  }),
]);

export type SetPayRateResult = z.infer<typeof setPayRateOutput>;

const columns = {
  id: payRates.id,
  effectiveFrom: payRates.effectiveFrom,
  hourlyRateCents: payRates.hourlyRateCents,
  currency: payRates.currency,
};

export async function setPayRate(
  tx: Tx,
  user: AppUser,
  input: SetPayRateInput,
): Promise<SetPayRateResult> {
  // Any visible user, deactivated included; a missing or foreign one is the gate's answer.
  if ((await readRosterUser(tx, input.userId)) === undefined) throw forbidden();
  const [added] = await tx
    .insert(payRates)
    .values({
      companyId: user.companyId,
      userId: input.userId,
      effectiveFrom: input.effectiveFrom,
      hourlyRateCents: input.hourlyRateCents,
      currency: input.currency,
    })
    .onConflictDoNothing({
      target: [payRates.companyId, payRates.userId, payRates.effectiveFrom],
    })
    .returning(columns);
  if (added !== undefined) return { result: "added", rate: added };
  const [standing] = await tx
    .select(columns)
    .from(payRates)
    .where(
      and(
        eq(payRates.userId, input.userId),
        eq(payRates.effectiveFrom, input.effectiveFrom),
      ),
    );
  if (standing === undefined) throw new Error("the conflicting pay rate is not visible");
  return { result: "rejected", code: "rate_exists", standing };
}

export const payRatesInput = z.strictObject({ userId: z.uuid() });

export const payRatesOutput = z.array(rate);

export async function listPayRates(tx: Tx, userId: string): Promise<Rate[]> {
  if ((await readRosterUser(tx, userId)) === undefined) throw forbidden();
  return tx
    .select(columns)
    .from(payRates)
    .where(eq(payRates.userId, userId))
    .orderBy(desc(payRates.effectiveFrom));
}

// The rate in force today for every user who has one: the greatest effective_from on or
// before today's date in companies.timezone (RULES: work dates are judged in it).
export async function currentRates(tx: Tx): Promise<Map<string, Rate>> {
  const rows = await tx
    .selectDistinctOn([payRates.userId], { userId: payRates.userId, ...columns })
    .from(payRates)
    .innerJoin(companies, eq(companies.id, payRates.companyId))
    .where(
      sql`${payRates.effectiveFrom} <= (now() at time zone ${companies.timezone})::date`,
    )
    .orderBy(payRates.userId, desc(payRates.effectiveFrom));
  return new Map(rows.map(({ userId, ...r }) => [userId, r]));
}
