// roster.setRole (PRD, Access: roles are a deliberate roster action). One user's role, judged
// under lock.ts's locks: demoting the last active admin is `rejected` `last_admin`, so a
// company can never lose its last admin to a demotion, two admins racing included. An admin may
// demote themself while another remains; their call commits and the next is FORBIDDEN. The
// same role again is `unchanged` and writes nothing. A change leaves one audit row
// (core/audit.ts). Consumed by routers/roster.ts.
import { userRole, users } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { recordAudit } from "../core/audit";
import type { Tx } from "../core/context";
import type { AppUser } from "../core/resolve-user";
import { readRosterUser, rosterUser, type RosterUser } from "./list";
import { isActiveAdmin, lockRosterRows } from "./lock";

export const setRoleInput = z.strictObject({
  userId: z.uuid(),
  role: z.enum(userRole.enumValues),
});

export type SetRoleInput = z.infer<typeof setRoleInput>;

export const changeOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("updated"), user: rosterUser }),
  // Already so. Nothing is written.
  z.strictObject({ result: z.literal("unchanged"), user: rosterUser }),
  // The target is the company's last active admin. Nothing is written.
  z.strictObject({ result: z.literal("rejected"), code: z.literal("last_admin") }),
]);

export type ChangeResult = z.infer<typeof changeOutput>;

// The row after the locks, as the roster shows it. Consumed here and by deactivation.ts.
export async function answerWith<R extends "updated" | "unchanged">(
  tx: Tx,
  result: R,
  id: string,
): Promise<{ result: R; user: RosterUser }> {
  const user = await readRosterUser(tx, id);
  if (user === undefined) throw new Error("a locked users row is not visible");
  return { result, user };
}

export async function setRole(
  tx: Tx,
  user: AppUser,
  input: SetRoleInput,
): Promise<ChangeResult> {
  const { target, otherActiveAdmins } = await lockRosterRows(tx, user, input.userId);
  if (target.role === input.role) return answerWith(tx, "unchanged", target.id);
  if (isActiveAdmin(target) && otherActiveAdmins === 0) {
    return { result: "rejected", code: "last_admin" };
  }
  await tx.update(users).set({ role: input.role }).where(eq(users.id, target.id));
  await recordAudit(tx, user, {
    action: "users.set_role",
    entityId: target.id,
    before: { role: target.role },
    after: { role: input.role },
  });
  return answerWith(tx, "updated", target.id);
}
