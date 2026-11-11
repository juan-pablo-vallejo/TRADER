// job.create, update, assign and setStatus (PRD, Jobs and location; ARCHITECTURE, customers,
// jobs and crews API). A job is created under an active customer and, if staffed, an active
// crew, both held FOR SHARE so a deactivation in flight waits (customers/write.ts,
// crews/lock.ts). The job row is held FOR NO KEY UPDATE, which conflicts with the FOR SHARE
// every push takes on it (sync/scope.ts): a reassignment or a status change commits only after
// the push that read the job, and a later push sees it. `update` holds it FOR UPDATE instead: a
// customer change must exclude an invoice's KEY SHARE, since invoices reference
// (company_id, customer_id, id) and the change would otherwise fail 23503 under a concurrent
// invoice insert — untested here, as no invoice writer exists yet (Stage 7). `setStatus` writes
// any of the three statuses, `archived` reversible and reading no ledger: an open session on an
// archived or reassigned job ends through push as today; leaving `archived` re-judges the
// customer and the crew, so a deactivated one never regains a live job. Lock order: jobs,
// customers, crews, then the caller (lockActiveSelf). Consumed by routers/job.ts.
import { invoices, jobStatus, jobs } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { lockActiveSelf } from "../core/locks";
import type { Tx } from "../core/context";
import { lockCrewShare } from "../crews/lock";
import { lockCustomerShare, optionalText } from "../customers/write";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";
import { job, locationInput, readJob, type Job } from "./list";

export const createInput = z.strictObject({
  customerId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  address: optionalText(500),
  location: locationInput.nullable().default(null),
  crewId: z.uuid().nullable().default(null),
});

export type CreateInput = z.infer<typeof createInput>;

// A whole-record replace of the facts; the crew and the status have their own procedures,
// each a push-relevant fact with its own lock consequence.
export const updateInput = z.strictObject({
  jobId: z.uuid(),
  customerId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  address: optionalText(500),
  location: locationInput.nullable().default(null),
});

export type UpdateInput = z.infer<typeof updateInput>;

export const assignInput = z.strictObject({
  jobId: z.uuid(),
  crewId: z.uuid().nullable(),
});

export type AssignInput = z.infer<typeof assignInput>;

export const setStatusInput = z.strictObject({
  jobId: z.uuid(),
  status: z.enum(jobStatus.enumValues),
});

export type SetStatusInput = z.infer<typeof setStatusInput>;

const rejected = (code: string) =>
  z.strictObject({ result: z.literal("rejected"), code: z.literal(code) });

export const createOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("created"), job }),
  // The customer or the crew named is deactivated. Nothing is written.
  z.strictObject({
    result: z.literal("rejected"),
    code: z.enum(["customer_inactive", "crew_inactive"]),
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
export const assignOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("updated"), job }),
  // Already on that crew, or already unassigned. Nothing is written.
  z.strictObject({ result: z.literal("unchanged"), job }),
  rejected("crew_inactive"),
]);
export const setStatusOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("updated"), job }),
  z.strictObject({ result: z.literal("unchanged"), job }),
  // Leaving `archived` under a deactivated customer or crew. Nothing is written.
  z.strictObject({
    result: z.literal("rejected"),
    code: z.enum(["customer_inactive", "crew_inactive"]),
  }),
]);

type LockedJob = {
  id: string;
  customerId: string;
  crewId: string | null;
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
      crewId: jobs.crewId,
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

// The crew FOR SHARE, refused when deactivated.
async function crewActive(tx: Tx, crewId: string): Promise<boolean> {
  return (await lockCrewShare(tx, crewId)).deactivatedAt === null;
}

const refusal = <C extends string>(code: C) => ({ result: "rejected" as const, code });

export async function createJob(tx: Tx, user: AppUser, input: CreateInput) {
  if (!(await customerActive(tx, input.customerId)))
    return refusal("customer_inactive" as const);
  if (input.crewId !== null && !(await crewActive(tx, input.crewId))) {
    return refusal("crew_inactive" as const);
  }
  await lockActiveSelf(tx, user, "admin");
  const [row] = await tx
    .insert(jobs)
    .values({
      companyId: user.companyId,
      customerId: input.customerId,
      crewId: input.crewId,
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

export async function assignJob(tx: Tx, user: AppUser, input: AssignInput) {
  const target = await lockJob(tx, input.jobId, "no key update");
  if (input.crewId !== null && !(await crewActive(tx, input.crewId))) {
    return refusal("crew_inactive" as const);
  }
  await lockActiveSelf(tx, user, "admin");
  if (target.crewId === input.crewId)
    return answerWith(tx, "unchanged" as const, target.id);
  await tx.update(jobs).set({ crewId: input.crewId }).where(eq(jobs.id, target.id));
  return answerWith(tx, "updated" as const, target.id);
}

export async function setJobStatus(tx: Tx, user: AppUser, input: SetStatusInput) {
  const target = await lockJob(tx, input.jobId, "no key update");
  if (target.status === "archived" && input.status !== "archived") {
    // Leaving `archived`: the customer and the crew re-judged under FOR SHARE, so a
    // deactivation (which counts non-archived jobs under its own lock) either committed first
    // and is seen, or waits for this transaction.
    if (!(await customerActive(tx, target.customerId))) {
      return refusal("customer_inactive" as const);
    }
    if (target.crewId !== null && !(await crewActive(tx, target.crewId))) {
      return refusal("crew_inactive" as const);
    }
  }
  await lockActiveSelf(tx, user, "admin");
  if (target.status === input.status)
    return answerWith(tx, "unchanged" as const, target.id);
  await tx.update(jobs).set({ status: input.status }).where(eq(jobs.id, target.id));
  return answerWith(tx, "updated" as const, target.id);
}
