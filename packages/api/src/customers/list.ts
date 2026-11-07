// customer.list (PRD, Target users: customers are the admin's). Every customer of the caller's
// company, deactivated ones included with their timestamp so the office can reactivate them,
// ordered by name, each with the count of its jobs not yet archived — what `deactivate`
// refuses on (write.ts). A plain read under RLS, no locks. Consumed by routers/customer.ts and
// by write.ts for the row each writer answers with.
import { customers } from "@trader/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../context";

export const customer = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  notes: z.string().nullable(),
  deactivatedAt: z.date().nullable(),
  // Jobs whose status is not `archived`: open and complete alike, since a complete job still
  // awaits invoicing. Zero is what `deactivate` requires.
  unarchivedJobs: z.number().int(),
});

export type Customer = z.infer<typeof customer>;

export const listOutput = z.array(customer);

// `archived` was created with the type (0000), so naming it in SQL is safe. The outer table is
// named in full: inside a select, Drizzle renders a column reference bare (`"id"`), which the
// subquery would resolve against jobs.
const columns = {
  id: customers.id,
  name: customers.name,
  address: customers.address,
  phone: customers.phone,
  email: customers.email,
  notes: customers.notes,
  deactivatedAt: customers.deactivatedAt,
  unarchivedJobs: sql<number>`(
    select count(*)::int from jobs j
    where j.customer_id = customers.id and j.status <> 'archived'
  )`,
};

export async function listCustomers(tx: Tx): Promise<Customer[]> {
  return tx
    .select(columns)
    .from(customers)
    .orderBy(asc(sql`lower(${customers.name})`), asc(customers.id));
}

// One visible customer, or undefined: another tenant's row is invisible under RLS.
export async function readCustomer(tx: Tx, id: string): Promise<Customer | undefined> {
  const [row] = await tx.select(columns).from(customers).where(eq(customers.id, id));
  return row;
}
