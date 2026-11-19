// job.create, update and setStatus. A job is created under an active customer, held FOR SHARE
// so a deactivation in flight waits (customers/write.ts). The job row is held FOR NO KEY
// UPDATE, which conflicts with the FOR SHARE every push takes on it (sync/scope.ts): a status
// change commits only after the push that read the job, and a later push sees it. `update`
// holds it FOR UPDATE instead: a customer change must exclude an invoice's KEY SHARE, since
// invoices reference (company_id, customer_id, id). `setStatus` writes any of the three
// statuses, `archived` reversible and reading no ledger: an open session on an archived job
// ends through push as today; leaving `archived` re-judges the customer, so a deactivated one
// never regains a live job. Lock order: jobs, customers, then the caller (lockActiveSelf).
// Consumed by routers/job.ts.
import { invoices, jobStatus, jobs } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { lockActiveSelf } from "../core/locks";
import type { Tx } from "../core/context";
import { lockCustomerShare, optionalText } from "../customers/write";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";
import { job, locationInput, readJob, type Job } from "./list";

export const createInput = z.strictObject({
  customerId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  address: optionalText(500),
  location: locationInput.nullable().default(null),
});

export type CreateInput = z.infer<typeof createInput>;

// A whole-record replace of the facts; the status has its own procedure.
export const updateInput = z.strictObject({
  jobId: z.uuid(),
  customerId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  address: optionalText(500),
  location: locationInput.nullable().default(null),
});

export type UpdateInput = z.infer<typeof updateInput>;

export const setStatusInput = z.strictObject({
  jobId: z.uuid(),
  status: z.enum(jobStatus.enumValues),
});

export type SetStatusInput = z.infer<typeof setStatusInput>;

export const createOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("created"), job }),
  // The customer named is deactivated. Nothing is written.
  z.strictObject({ result: z.literal("rejected"), code: z.literal("customer_inactive") }),
]);
export const updateOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("updated"), job }),
  // `has_invoices`: the job's customer is immutable once an invoice exists (jobs.ts).
  z.strictObject({
    result: z.literal("rejected"),
    code: z.enum(["customer_inactive", "has_invoices"]),
  }),
]);
export const setStatusOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("updated"), job }),
  z.strictObject({ result: z.literal("unchanged"), job }),
  // Leaving `archived` under a deactivated customer. Nothing is written.
  z.strictObject({ result: z.literal("rejected"), code: z.literal("customer_inactive") }),
]);

type LockedJob = {
  id: string;
  customerId: string;
  status: Job["status"];
};

// The job row, held to commit. A missing id and another tenant's (invisible under RLS) are one
// answer.
async function lockJob(
  tx: Tx,
  id: string,
  mode: "no key update" | "update",
): Promise<LockedJob> {
  const [row] = await tx
    .select({
      id: jobs.id,
      customerId: jobs.customerId,
      status: jobs.status,
    })
    .from(jobs)
    .where(eq(jobs.id, id))
    .for(mode);
  if (row === undefined) throw forbidden();
  return row;
}

async function answerWith<R extends string>(
  tx: Tx,
  result: R,
  id: string,
): Promise<{ result: R; job: Job }> {
  const row = await readJob(tx, id);
  if (row === undefined) throw new Error("a locked jobs row is not visible");
  return { result, job: row };
}

const locationColumns = (l: z.infer<typeof locationInput> | null) => ({
  locationLat: l?.lat ?? null,
  locationLng: l?.lng ?? null,
  locationRadiusM: l?.radiusM ?? null,
});

// The customer FOR SHARE, refused when deactivated.
async function customerActive(tx: Tx, customerId: string): Promise<boolean> {
  return (await lockCustomerShare(tx, customerId)).deactivatedAt === null;
}

const refusal = <C extends string>(code: C) => ({ result: "rejected" as const, code });

export async function createJob(tx: Tx, user: AppUser, input: CreateInput) {
  if (!(await customerActive(tx, input.customerId)))
    return refusal("customer_inactive" as const);
  await lockActiveSelf(tx, user, "admin");
  const [row] = await tx
    .insert(jobs)
    .values({
      companyId: user.companyId,
      customerId: input.customerId,
      name: input.name,
      address: input.address,
      ...locationColumns(input.location),
    })
    .returning({ id: jobs.id });
  if (row === undefined) throw new Error("the inserted jobs row is not visible");
  return answerWith(tx, "created" as const, row.id);
}

export async function updateJob(tx: Tx, user: AppUser, input: UpdateInput) {
  // FOR UPDATE: see the header. The lock's race with an invoice insert has no test until an
  // invoice writer exists.
  const target = await lockJob(tx, input.jobId, "update");
  if (target.customerId !== input.customerId) {
    if (!(await customerActive(tx, input.customerId))) {
      return refusal("customer_inactive" as const);
    }
    const invoiced = await tx.$count(invoices, eq(invoices.jobId, target.id));
    if (invoiced > 0) return refusal("has_invoices" as const);
  }
  await lockActiveSelf(tx, user, "admin");
  await tx
    .update(jobs)
    .set({
      customerId: input.customerId,
      name: input.name,
      address: input.address,
      ...locationColumns(input.location),
    })
    .where(eq(jobs.id, target.id));
  return answerWith(tx, "updated" as const, target.id);
}

export async function setJobStatus(tx: Tx, user: AppUser, input: SetStatusInput) {
  const target = await lockJob(tx, input.jobId, "no key update");
  if (target.status === "archived" && input.status !== "archived") {
    // Leaving `archived`: the customer re-judged under FOR SHARE, so a
    // deactivation (which counts non-archived jobs under its own lock) either committed first
    // and is seen, or waits for this transaction.
    if (!(await customerActive(tx, target.customerId))) {
      return refusal("customer_inactive" as const);
    }
  }
  await lockActiveSelf(tx, user, "admin");
  if (target.status === input.status)
    return answerWith(tx, "unchanged" as const, target.id);
  await tx.update(jobs).set({ status: input.status }).where(eq(jobs.id, target.id));
  return answerWith(tx, "updated" as const, target.id);
}
