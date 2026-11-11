// customer.create, update, deactivate and reactivate (PRD, Jobs and location: jobs belong to a
// customer; ARCHITECTURE, customers, jobs and crews API). Contact fields are free text, blank
// stored as NULL; nothing is unique but the id. A customer with a job not yet archived cannot
// be deactivated (`jobs_unarchived`): a customer with live work is not retired, and a complete
// job still awaits invoicing. Judged under the customer row FOR NO KEY UPDATE, which a job
// writer's FOR SHARE on the customer (jobs/write.ts) conflicts with, so a job never lands under
// a customer being deactivated. Every writer re-reads the caller under lock after its rows
// (lockActiveSelf): users come after customers in the lock order. Consumed by
// routers/customer.ts; `lockCustomerShare` by jobs/write.ts.
import { customers } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { lockActiveSelf } from "../closeout/scope";
import type { Tx } from "../core/context";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";
import { customer, readCustomer, type Customer } from "./list";

// Optional text is NULL at the boundary: blank, whitespace included, never reaches a column.
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v === "" ? null : v))
    .default(null);

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const createInput = z.strictObject({
  name: z.string().trim().min(1).max(200),
  address: optionalText(500),
  phone: optionalText(32),
  // Contact data, not identity: no uniqueness, no verification.
  email: z.preprocess(blankToNull, z.email().max(254).nullable().default(null)),
  notes: optionalText(2000),
});

export type CreateInput = z.infer<typeof createInput>;

// A whole-record replace, as me.update is.
export const updateInput = createInput.extend({ customerId: z.uuid() });

export type UpdateInput = z.infer<typeof updateInput>;

export const targetInput = z.strictObject({ customerId: z.uuid() });

export type TargetInput = z.infer<typeof targetInput>;

export const createOutput = z.strictObject({ result: z.literal("created"), customer });
export const updateOutput = z.strictObject({ result: z.literal("updated"), customer });
export const deactivateOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("updated"), customer }),
  // Already so. Nothing is written.
  z.strictObject({ result: z.literal("unchanged"), customer }),
  // Jobs of this customer are not archived. Nothing is written.
  z.strictObject({
    result: z.literal("rejected"),
    code: z.literal("jobs_unarchived"),
    unarchivedJobs: z.number().int(),
  }),
]);
export const reactivateOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("updated"), customer }),
  z.strictObject({ result: z.literal("unchanged"), customer }),
]);

type Locked = { id: string; deactivatedAt: Date | null };

// The customer row, held to commit. A missing id and another tenant's (invisible under RLS)
// are one answer.
async function lockCustomer(tx: Tx, id: string, mode: "no key update" | "share") {
  const [row] = await tx
    .select({ id: customers.id, deactivatedAt: customers.deactivatedAt })
    .from(customers)
    .where(eq(customers.id, id))
    .for(mode);
  if (row === undefined) throw forbidden();
  return row;
}

// A job writer's view: the customer FOR SHARE, so a deactivation waits for it. Consumed by
// jobs/write.ts.
export const lockCustomerShare = (tx: Tx, id: string): Promise<Locked> =>
  lockCustomer(tx, id, "share");

async function answerWith<R extends string>(
  tx: Tx,
  result: R,
  id: string,
): Promise<{ result: R; customer: Customer }> {
  const row = await readCustomer(tx, id);
  if (row === undefined) throw new Error("a locked customers row is not visible");
  return { result, customer: row };
}

const fields = (input: CreateInput) => ({
  name: input.name,
  address: input.address,
  phone: input.phone,
  email: input.email,
  notes: input.notes,
});

export async function createCustomer(tx: Tx, user: AppUser, input: CreateInput) {
  await lockActiveSelf(tx, user, "admin");
  const [row] = await tx
    .insert(customers)
    .values({ companyId: user.companyId, ...fields(input) })
    .returning({ id: customers.id });
  if (row === undefined) throw new Error("the inserted customers row is not visible");
  return answerWith(tx, "created" as const, row.id);
}

// Allowed on a deactivated customer: contact details may still be corrected.
export async function updateCustomer(tx: Tx, user: AppUser, input: UpdateInput) {
  const target = await lockCustomer(tx, input.customerId, "no key update");
  await lockActiveSelf(tx, user, "admin");
  await tx.update(customers).set(fields(input)).where(eq(customers.id, target.id));
  return answerWith(tx, "updated" as const, target.id);
}

export async function deactivateCustomer(tx: Tx, user: AppUser, input: TargetInput) {
  const target = await lockCustomer(tx, input.customerId, "no key update");
  await lockActiveSelf(tx, user, "admin");
  if (target.deactivatedAt !== null)
    return answerWith(tx, "unchanged" as const, target.id);
  // Read after the lock, so a job created under FOR SHARE on this row is counted or waits.
  const { rows } = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n from jobs
    where customer_id = ${target.id} and status <> 'archived'
  `);
  const unarchivedJobs = rows[0]?.n ?? 0;
  if (unarchivedJobs > 0) {
    return {
      result: "rejected" as const,
      code: "jobs_unarchived" as const,
      unarchivedJobs,
    };
  }
  // The database's clock, as created_at is stamped; updated_at follows through the ORM.
  await tx
    .update(customers)
    .set({ deactivatedAt: sql`now()` })
    .where(eq(customers.id, target.id));
  return answerWith(tx, "updated" as const, target.id);
}

export async function reactivateCustomer(tx: Tx, user: AppUser, input: TargetInput) {
  const target = await lockCustomer(tx, input.customerId, "no key update");
  await lockActiveSelf(tx, user, "admin");
  if (target.deactivatedAt === null)
    return answerWith(tx, "unchanged" as const, target.id);
  await tx
    .update(customers)
    .set({ deactivatedAt: null })
    .where(eq(customers.id, target.id));
  return answerWith(tx, "updated" as const, target.id);
}
