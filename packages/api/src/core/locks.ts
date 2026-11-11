// The caller, re-read under a lock held to commit: resolution read it without one. A
// deactivated caller is UNAUTHORIZED, as at resolution; a changed role is FORBIDDEN. Users
// come after jobs, customers and crews in the global lock order (ARCHITECTURE, Concurrency),
// so a writer takes its entity locks first and this last. Consumed by every office writer and
// by closeout/scope.ts.
import { users } from "@trader/db/schema";
import { eq } from "drizzle-orm";

import type { Tx } from "./context";
import type { AppUser } from "./resolve-user";
import { forbidden, unauthorized } from "./trpc";

export async function lockActiveSelf(
  tx: Tx,
  user: AppUser,
  role: AppUser["role"],
): Promise<void> {
  const [self] = await tx
    .select({ role: users.role, deactivatedAt: users.deactivatedAt })
    .from(users)
    .where(eq(users.id, user.id))
    .for("share");
  if (self === undefined || self.deactivatedAt !== null) throw unauthorized();
  if (self.role !== role) throw forbidden();
}
