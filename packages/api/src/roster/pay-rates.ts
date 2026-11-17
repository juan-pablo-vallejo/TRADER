// roster.setPayRate and roster.payRates (PRD, Labor: pay rates are effective-dated;
// ARCHITECTURE: effective-dated rates, no pay calculation in V1). The model is pay.ts as it
// stands: one row per (user, effective_from), no end date, the rate in force on a day the row
// with the greatest effective_from on or before it. This API only inserts: a second rate for
// the same day is `rate_exists` with the standing row, and no rate is ever updated or deleted,
// so a rate once read is never rewritten here. A rate may be dated inside a closed pay period
// (owner, 2026-11-12): a close stores hours and reads no rate, so it changes job cost to date
// and nothing a close stored. The unique index is the race guard; no row lock beyond the
// foreign key's. An added rate leaves one audit row (core/audit.ts). Consumed by routers/roster.ts
// alone; the rate in force today is current-rates.ts.
import { payRates } from "@trader/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { recordAudit } from "../core/audit";
import type { Tx } from "../core/context";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";
import { rate, rateColumns, type Rate } from "./current-rates";
import { readRosterUser } from "./list";

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
    .returning(rateColumns);
  if (added !== undefined) {
    await recordAudit(tx, user, {
      action: "pay_rates.add",
      entityId: added.id,
      after: {
        user_id: input.userId,
        effective_from: added.effectiveFrom,
        hourly_rate_cents: added.hourlyRateCents,
        currency: added.currency,
      },
    });
    return { result: "added", rate: added };
  }
  const [standing] = await tx
    .select(rateColumns)
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
    .select(rateColumns)
    .from(payRates)
    .where(eq(payRates.userId, userId))
    .orderBy(desc(payRates.effectiveFrom));
}
