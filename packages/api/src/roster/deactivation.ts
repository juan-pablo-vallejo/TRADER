// roster.deactivate and roster.reactivate (ARCHITECTURE: deactivated_at, state derived). A
// deactivated account resolves to no user from its next call on (resolve-user.ts); its bound
// identity_subject is kept, so reactivation — deactivated_at back to NULL and nothing else —
// lets the same login in again, and an unbound invitation becomes the one invitation again.
// Deactivating the last active admin is `rejected` `last_admin` under lock.ts's locks. Neither
// pseudonymizes: PRD's account deletion is Stage 8's. Consumed by routers/roster.ts.
import { users } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import type { AppUser } from "../core/resolve-user";
import { rosterUser } from "./list";
import { isActiveAdmin, lockRosterRows } from "./lock";
import { answerWith, type ChangeResult } from "./role";

export const targetInput = z.strictObject({ userId: z.uuid() });

export type TargetInput = z.infer<typeof targetInput>;

export const reactivateOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("updated"), user: rosterUser }),
  z.strictObject({ result: z.literal("unchanged"), user: rosterUser }),
]);

export type ReactivateResult = z.infer<typeof reactivateOutput>;

export async function deactivate(
  tx: Tx,
  user: AppUser,
  input: TargetInput,
): Promise<ChangeResult> {
  const { target, otherActiveAdmins } = await lockRosterRows(tx, user, input.userId);
  if (target.deactivatedAt !== null) return answerWith(tx, "unchanged", target.id);
  if (isActiveAdmin(target) && otherActiveAdmins === 0) {
    return { result: "rejected", code: "last_admin" };
  }
  // The database's clock, as created_at is stamped; updated_at follows through the ORM.
  await tx
    .update(users)
    .set({ deactivatedAt: sql`now()` })
    .where(eq(users.id, target.id));
  return answerWith(tx, "updated", target.id);
}

export async function reactivate(
  tx: Tx,
  user: AppUser,
  input: TargetInput,
): Promise<ReactivateResult> {
  const { target } = await lockRosterRows(tx, user, input.userId);
  if (target.deactivatedAt === null) return answerWith(tx, "unchanged", target.id);
  await tx.update(users).set({ deactivatedAt: null }).where(eq(users.id, target.id));
  return answerWith(tx, "updated", target.id);
}
