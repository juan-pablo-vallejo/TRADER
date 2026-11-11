// crew.create, update, setForeman, deactivate and reactivate (PRD, Jobs and location: a crew has
// a foreman; ARCHITECTURE, customers, jobs and crews API; crew membership lifecycle). The
// foreman is an active user with the foreman role and a member row — cross-row facts no
// constraint can state (crews.ts), enforced here at creation and at a foreman change, which
// adds the new foreman as a member and leaves the old one a member until removed. A crew with a
// job not yet archived cannot be deactivated (`jobs_assigned`): its jobs are reassigned or
// archived first, so a crew's deactivation never silently unstaffs live work. A deactivated
// crew takes no foreman change (`crew_inactive`); it may still be renamed. Every write holds the
// crew row FOR NO KEY UPDATE (lock.ts) and re-reads the caller after it. Consumed by
// routers/crew.ts.
import { crewMembers, crews } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { lockActiveSelf } from "../core/locks";
import type { Tx } from "../core/context";
import type { AppUser } from "../core/resolve-user";
import { crew, readCrew, type Crew } from "./list";
import { lockCrewForWrite, lockUsersShare, type LockedUser } from "./lock";

export const createInput = z.strictObject({
  name: z.string().trim().min(1).max(120),
  foremanUserId: z.uuid(),
});

export type CreateInput = z.infer<typeof createInput>;

export const updateInput = z.strictObject({
  crewId: z.uuid(),
  name: z.string().trim().min(1).max(120),
});

export type UpdateInput = z.infer<typeof updateInput>;

export const setForemanInput = z.strictObject({ crewId: z.uuid(), userId: z.uuid() });

export type SetForemanInput = z.infer<typeof setForemanInput>;

export const targetInput = z.strictObject({ crewId: z.uuid() });

export type TargetInput = z.infer<typeof targetInput>;

// The user named as foreman is deactivated, or does not hold the foreman role. Nothing is
// written.
const foremanRejection = z.strictObject({
  result: z.literal("rejected"),
  code: z.enum(["user_inactive", "not_a_foreman"]),
});

export const createOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("created"), crew }),
  foremanRejection,
]);
export const updateOutput = z.strictObject({ result: z.literal("updated"), crew });
export const setForemanOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("updated"), crew }),
  // Already the foreman. Nothing is written.
  z.strictObject({ result: z.literal("unchanged"), crew }),
  z.strictObject({
    result: z.literal("rejected"),
    // `crew_inactive`: a deactivated crew takes no foreman change; reactivate it first.
    code: z.enum(["user_inactive", "not_a_foreman", "crew_inactive"]),
  }),
]);
export const deactivateOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("updated"), crew }),
  z.strictObject({ result: z.literal("unchanged"), crew }),
  // Jobs on this crew are not archived. Nothing is written.
  z.strictObject({
    result: z.literal("rejected"),
    code: z.literal("jobs_assigned"),
    jobCount: z.number().int(),
  }),
]);
export const reactivateOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("updated"), crew }),
  z.strictObject({ result: z.literal("unchanged"), crew }),
]);

// The row after the locks, as the office sees it. Consumed here and by members.ts.
export async function answerWith<R extends string>(
  tx: Tx,
  result: R,
  id: string,
): Promise<{ result: R; crew: Crew }> {
  const row = await readCrew(tx, id);
  if (row === undefined) throw new Error("a locked crews row is not visible");
  return { result, crew: row };
}

// Why a user cannot be the foreman, or null. Consumed here and by members.ts for the member
// rule's first half.
export const foremanRefusal = (u: LockedUser) =>
  u.deactivatedAt !== null
    ? ("user_inactive" as const)
    : u.role !== "foreman"
      ? ("not_a_foreman" as const)
      : null;

// The foreman's member row; a no-op when present. The primary key is the conflict target.
async function ensureMember(tx: Tx, companyId: string, crewId: string, userId: string) {
  await tx
    .insert(crewMembers)
    .values({ companyId, crewId, userId })
    .onConflictDoNothing({ target: [crewMembers.crewId, crewMembers.userId] });
}

export async function createCrew(tx: Tx, user: AppUser, input: CreateInput) {
  // No crew row yet: the new foreman and the caller, users rows FOR SHARE, are the only locks.
  const foreman = (await lockUsersShare(tx, user, [input.foremanUserId])).get(
    input.foremanUserId,
  )!;
  const refusal = foremanRefusal(foreman);
  if (refusal !== null) return { result: "rejected" as const, code: refusal };
  const [row] = await tx
    .insert(crews)
    .values({ companyId: user.companyId, name: input.name, foremanUserId: foreman.id })
    .returning({ id: crews.id });
  if (row === undefined) throw new Error("the inserted crews row is not visible");
  await ensureMember(tx, user.companyId, row.id, foreman.id);
  return answerWith(tx, "created" as const, row.id);
}

export async function updateCrew(tx: Tx, user: AppUser, input: UpdateInput) {
  const target = await lockCrewForWrite(tx, input.crewId);
  await lockActiveSelf(tx, user, "admin");
  await tx.update(crews).set({ name: input.name }).where(eq(crews.id, target.id));
  return answerWith(tx, "updated" as const, target.id);
}

export async function setForeman(tx: Tx, user: AppUser, input: SetForemanInput) {
  const target = await lockCrewForWrite(tx, input.crewId);
  const next = (await lockUsersShare(tx, user, [input.userId])).get(input.userId)!;
  if (target.deactivatedAt !== null) {
    return { result: "rejected" as const, code: "crew_inactive" as const };
  }
  if (target.foremanUserId === next.id)
    return answerWith(tx, "unchanged" as const, target.id);
  const refusal = foremanRefusal(next);
  if (refusal !== null) return { result: "rejected" as const, code: refusal };
  await tx.update(crews).set({ foremanUserId: next.id }).where(eq(crews.id, target.id));
  await ensureMember(tx, user.companyId, target.id, next.id);
  return answerWith(tx, "updated" as const, target.id);
}

export async function deactivateCrew(tx: Tx, user: AppUser, input: TargetInput) {
  const target = await lockCrewForWrite(tx, input.crewId);
  await lockActiveSelf(tx, user, "admin");
  if (target.deactivatedAt !== null)
    return answerWith(tx, "unchanged" as const, target.id);
  // Read after the lock: a job assigned under FOR SHARE on this row is counted or waits.
  const { rows } = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n from jobs where crew_id = ${target.id} and status <> 'archived'
  `);
  const jobCount = rows[0]?.n ?? 0;
  if (jobCount > 0) {
    return { result: "rejected" as const, code: "jobs_assigned" as const, jobCount };
  }
  // The database's clock, as created_at is stamped; updated_at follows through the ORM.
  await tx
    .update(crews)
    .set({ deactivatedAt: sql`now()` })
    .where(eq(crews.id, target.id));
  return answerWith(tx, "updated" as const, target.id);
}

export async function reactivateCrew(tx: Tx, user: AppUser, input: TargetInput) {
  const target = await lockCrewForWrite(tx, input.crewId);
  await lockActiveSelf(tx, user, "admin");
  if (target.deactivatedAt === null)
    return answerWith(tx, "unchanged" as const, target.id);
  await tx.update(crews).set({ deactivatedAt: null }).where(eq(crews.id, target.id));
  return answerWith(tx, "updated" as const, target.id);
}
