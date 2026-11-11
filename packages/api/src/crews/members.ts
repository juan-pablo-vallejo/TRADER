// crew.addMember and crew.removeMember (PRD, Jobs and location: a worker's jobs are those of
// every crew they belong to; ARCHITECTURE, crew membership lifecycle). Membership is
// current-state: one row per (crew, user), added or removed, never dated, and push judges it
// at receipt. A transfer is an add to the new crew, then a removal from the old. Any active
// user may be a member, whatever their role; a deactivated one is refused (`user_inactive`) and
// a deactivated crew takes no one (`crew_inactive`). The foreman is never removed
// (`is_foreman`): the pointer must keep its member row, so the office changes the foreman
// first. Each write holds the crew row FOR NO KEY UPDATE (lock.ts), so it commits only after
// any push that read this membership. Consumed by routers/crew.ts.
import { crewMembers } from "@trader/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { lockActiveSelf } from "../core/locks";
import type { Tx } from "../core/context";
import type { AppUser } from "../core/resolve-user";
import { crew } from "./list";
import { lockCrewForWrite, lockUsersShare } from "./lock";
import { answerWith } from "./write";

export const memberInput = z.strictObject({ crewId: z.uuid(), userId: z.uuid() });

export type MemberInput = z.infer<typeof memberInput>;

export const addMemberOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("added"), crew }),
  // Already a member. Nothing is written.
  z.strictObject({ result: z.literal("unchanged"), crew }),
  z.strictObject({
    result: z.literal("rejected"),
    code: z.enum(["user_inactive", "crew_inactive"]),
  }),
]);
export const removeMemberOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("removed"), crew }),
  // Not a member. Nothing is written.
  z.strictObject({ result: z.literal("unchanged"), crew }),
  // The crew's foreman: change the foreman first.
  z.strictObject({ result: z.literal("rejected"), code: z.literal("is_foreman") }),
]);

export async function addMember(tx: Tx, user: AppUser, input: MemberInput) {
  const target = await lockCrewForWrite(tx, input.crewId);
  const member = (await lockUsersShare(tx, user, [input.userId])).get(input.userId)!;
  if (target.deactivatedAt !== null) {
    return { result: "rejected" as const, code: "crew_inactive" as const };
  }
  if (member.deactivatedAt !== null) {
    return { result: "rejected" as const, code: "user_inactive" as const };
  }
  const [added] = await tx
    .insert(crewMembers)
    .values({ companyId: user.companyId, crewId: target.id, userId: member.id })
    .onConflictDoNothing({ target: [crewMembers.crewId, crewMembers.userId] })
    .returning({ userId: crewMembers.userId });
  return answerWith(
    tx,
    added === undefined ? ("unchanged" as const) : ("added" as const),
    target.id,
  );
}

// Allowed on a deactivated crew: its roster may still be tidied.
export async function removeMember(tx: Tx, user: AppUser, input: MemberInput) {
  const target = await lockCrewForWrite(tx, input.crewId);
  await lockActiveSelf(tx, user, "admin");
  if (target.foremanUserId === input.userId) {
    return { result: "rejected" as const, code: "is_foreman" as const };
  }
  const [removed] = await tx
    .delete(crewMembers)
    .where(and(eq(crewMembers.crewId, target.id), eq(crewMembers.userId, input.userId)))
    .returning({ userId: crewMembers.userId });
  return answerWith(
    tx,
    removed === undefined ? ("unchanged" as const) : ("removed" as const),
    target.id,
  );
}
