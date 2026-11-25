// company.get and company.update: the caller's own company as the office's Settings shows
// it. The details print on an invoice (address, phone, email, how to pay, the terms in
// days); the two switches decide what the time clock does: whether a clock-in is judged by
// the schedule (sync/schedule.ts) and whether a tap is stamped with a location
// (sync/scope.ts). The zone is read and never written here: hours already recorded are
// placed on days by it. Admin only, at the gate.
//
// `update` writes the keys it is given and no others, so one switch is saved without
// resending the rest. The company's row is held FOR NO KEY UPDATE, then the caller
// (lockActiveSelf): companies before users, as everywhere. A push reads the switches with
// no lock, in its own record's transaction: a change counts for the records after it.
import { companies } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import { lockActiveSelf } from "../core/locks";
import type { AppUser } from "../core/resolve-user";

export const company = z.strictObject({
  name: z.string(),
  timezone: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  // A few lines, printed as typed under "How to pay".
  paymentInstructions: z.string().nullable(),
  // Days from issue to due. Zero is due on receipt.
  invoiceTermsDays: z.number().int(),
  scheduleEnforced: z.boolean(),
  locationStamps: z.boolean(),
});

export type Company = z.infer<typeof company>;

// Optional text is NULL at the boundary: blank, whitespace included, never reaches a column.
// No default, unlike customers' optionalText: a key left out here is a column left alone.
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v === "" ? null : v));

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const updateInput = z
  .strictObject({
    name: z.string().trim().min(1).max(200),
    address: text(500),
    phone: text(32),
    // Contact data, not identity: no uniqueness, no verification.
    email: z.preprocess(blankToNull, z.email().max(254).nullable()),
    paymentInstructions: text(2000),
    invoiceTermsDays: z.number().int().min(0).max(365),
    scheduleEnforced: z.boolean(),
    locationStamps: z.boolean(),
  })
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Nothing to change.",
  });

export type UpdateInput = z.infer<typeof updateInput>;

const columns = {
  name: companies.name,
  timezone: companies.timezone,
  address: companies.address,
  phone: companies.phone,
  email: companies.email,
  paymentInstructions: companies.paymentInstructions,
  invoiceTermsDays: companies.invoiceTermsDays,
  scheduleEnforced: companies.scheduleEnforced,
  locationStamps: companies.locationStamps,
};

export async function readCompany(tx: Tx, user: AppUser): Promise<Company> {
  const [row] = await tx
    .select(columns)
    .from(companies)
    .where(eq(companies.id, user.companyId));
  if (row === undefined) throw new Error("the caller's company is not visible");
  return row;
}

export async function updateCompany(
  tx: Tx,
  user: AppUser,
  input: UpdateInput,
): Promise<Company> {
  const [held] = await tx
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, user.companyId))
    .for("no key update");
  if (held === undefined) throw new Error("the caller's company is not visible");
  await lockActiveSelf(tx, user, "admin");
  // Only the keys given: `undefined` is a column drizzle leaves out of the SET.
  await tx
    .update(companies)
    .set({
      name: input.name,
      address: input.address,
      phone: input.phone,
      email: input.email,
      paymentInstructions: input.paymentInstructions,
      invoiceTermsDays: input.invoiceTermsDays,
      scheduleEnforced: input.scheduleEnforced,
      locationStamps: input.locationStamps,
    })
    .where(eq(companies.id, held.id));
  return readCompany(tx, user);
}
