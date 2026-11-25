// job.create, update, setStatus and setLocation. A job is created under an active customer, held FOR SHARE
// so a deactivation in flight waits (customers/write.ts). The job row is held FOR NO KEY
// UPDATE, which conflicts with the FOR SHARE every push takes on it (sync/scope.ts): a status
// change commits only after the push that read the job, and a later push sees it. `update`
// holds it FOR UPDATE instead: a customer change must exclude an invoice's KEY SHARE, since
// invoices reference (company_id, customer_id, id). `setStatus` writes any of the three
// statuses, `archived` reversible and reading no ledger: an open session on an archived job
// ends through push as today; leaving `archived` re-judges the customer, so a deactivated one
// never regains a live job. Lock order: jobs, customers, then the caller (lockActiveSelf).
import { invoices, jobStatus, jobs } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { lockActiveSelf } from "../core/locks";
import type { Tx } from "../core/context";
import { lockCustomerShare, optionalText } from "../customers/write";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";
import { job, locationInput, readJob, type Job } from "./list";

// The new job's id is the office's, made when the form opens and kept on a retry: a resend
// whose answer was lost finds its own row and writes nothing.
export const createInput = z.strictObject({
  id: z.uuid({ version: "v7" }),
  customerId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  address: optionalText(500),
  notes: optionalText(2000),
  location: locationInput.nullable().default(null),
});

export type CreateInput = z.infer<typeof createInput>;

// A whole-record replace of the facts; the status has its own procedure.
export const updateInput = z.strictObject({
  jobId: z.uuid(),
  customerId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  address: optionalText(500),
  notes: optionalText(2000),
  location: locationInput.nullable().default(null),
});

export type UpdateInput = z.infer<typeof updateInput>;

// The phone's own write (M6): a jobsite's place, set where the admin stands, and nothing
// else. job.update is a whole-record replace, so a phone sending it would write back
// whatever facts it last read over what the office typed since.
export const setLocationInput = z.strictObject({
  jobId: z.uuid(),
  location: locationInput,
});

export type SetLocationInput = z.infer<typeof setLocationInput>;

export const setLocationOutput = z.strictObject({ result: z.literal("updated"), job });

export const setStatusInput = z.strictObject({
  jobId: z.uuid(),
  status: z.enum(jobStatus.enumValues),
});

type SetStatusInput = z.infer<typeof setStatusInput>;

export const createOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("created"), job }),
  // This id is already this job, as sent: a resend. Nothing is written.
  z.strictObject({ result: z.literal("duplicate"), job }),
  // The customer named is deactivated, or the id is held by other contents or by a row this
  // caller cannot see. Nothing is written.
  z.strictObject({
    result: z.literal("rejected"),
    code: z.enum(["customer_inactive", "id_conflict"]),
  }),
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
  // A resend is answered first, whatever has happened to its customer since: the job it
  // made is this one, as sent, location included; any other job under the id is a conflict.
  const held = await readJob(tx, input.id);
  if (held !== undefined) {
    return sameJob(held, input)
      ? { result: "duplicate" as const, job: held }
      : refusal("id_conflict" as const);
  }
  if (!(await customerActive(tx, input.customerId)))
    return refusal("customer_inactive" as const);
  await lockActiveSelf(tx, user, "admin");
  const [row] = await tx
    .insert(jobs)
    .values({
      id: input.id,
      companyId: user.companyId,
      customerId: input.customerId,
      name: input.name,
      address: input.address,
      notes: input.notes,
      ...locationColumns(input.location),
    })
    .onConflictDoNothing({ target: jobs.id })
    .returning({ id: jobs.id });
  if (row !== undefined) return answerWith(tx, "created" as const, row.id);
  // Taken meanwhile, or by a row this caller cannot see: either way, no job of this send.
  const raced = await readJob(tx, input.id);
  if (raced !== undefined && sameJob(raced, input)) {
    return { result: "duplicate" as const, job: raced };
  }
  return refusal("id_conflict" as const);
}

const sameJob = (held: Job, input: CreateInput) =>
  held.customer.id === input.customerId &&
  held.name === input.name &&
  held.address === input.address &&
  held.notes === input.notes &&
  JSON.stringify(held.location) === JSON.stringify(input.location);

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
      notes: input.notes,
      ...locationColumns(input.location),
    })
    .where(eq(jobs.id, target.id));
  return answerWith(tx, "updated" as const, target.id);
}

// FOR NO KEY UPDATE, as setStatus: the location is no key, and a push reading the job's
// place waits for it (sync/scope.ts).
export async function setJobLocation(tx: Tx, user: AppUser, input: SetLocationInput) {
  const target = await lockJob(tx, input.jobId, "no key update");
  await lockActiveSelf(tx, user, "admin");
  await tx
    .update(jobs)
    .set(locationColumns(input.location))
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
