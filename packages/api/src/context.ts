import { companies, getDb, users, type Db } from "@trader/db";
import { eq } from "drizzle-orm";

/**
 * Name given to a just-in-time user row when the caller supplied no profile.
 *
 * `users.name` is NOT NULL and this package deliberately cannot ask Clerk (see
 * `AuthIdentity`), so a placeholder is unavoidable. Exported so Phase 2 roster
 * management can highlight rows still carrying it, rather than the string being
 * duplicated at the call site.
 */
export const PROVISIONAL_USER_NAME = "Unnamed worker";

/**
 * A caller whose token has *already been verified*, by the Next.js route handler.
 *
 * This package never talks to Clerk. Verification belongs at the HTTP edge where
 * Clerk's helpers already run; keeping it out of here means the API has no Clerk
 * dependency and every procedure is testable by passing a fake subject.
 */
export type AuthIdentity = {
  clerkUserId: string;
  /**
   * Consulted **only** when the row is created. It never touches an existing
   * row, so an admin's later correction is not overwritten on next sign-in.
   */
  profile?: { name?: string; phone?: string };
};

export type AppUser = typeof users.$inferSelect;

export type Context = {
  db: Db;
  /** Null when the request carried no verified identity. */
  user: AppUser | null;
};

export type CreateContextOptions = {
  auth: AuthIdentity | null;
  /** Injectable for tests; defaults to the process-wide connection. */
  db?: Db;
};

export async function createContext(opts: CreateContextOptions): Promise<Context> {
  const db = opts.db ?? getDb();
  if (!opts.auth) return { db, user: null };
  return { db, user: await resolveUser(db, opts.auth) };
}

/**
 * Finds the caller's row, creating it on first sign-in (SPEC provisioning
 * decision: default role `worker`; admins are promoted deliberately by seed).
 *
 * **There is deliberately no `onConflictDoUpdate` here.** An update clause on
 * this path is a standing hazard: `packages/db/src/seed.ts` legitimately writes
 * `role` in its upsert, and the same shape copied into a request path would
 * rewrite `role` — or `active` — on every sign-in. That would demote an admin
 * the moment they logged in, and would silently undo a deactivation. Select
 * first, insert only when missing, and let a conflict do nothing: with no `set`
 * clause in the file, there is nothing for a later edit to corrupt.
 */
async function resolveUser(db: Db, auth: AuthIdentity): Promise<AppUser> {
  // 1. The hot path: every request after the first.
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, auth.clerkUserId))
    .limit(1);
  if (existing[0]) return existing[0];

  // 2. First sign-in. v1 is single-tenant, so the sole seeded company is the
  //    only possible answer. V2 multi-tenancy replaces this with explicit
  //    assignment (invite or organisation claim); see DECISIONS.md.
  //
  //    Ordered rather than an unqualified `limit(1)`: without ORDER BY, Postgres
  //    may return any row, so a stray second company would attach users to an
  //    arbitrary tenant — non-deterministically, which is the worst way to find
  //    out. Oldest-first means the seeded company always wins.
  const [company] = await db
    .select()
    .from(companies)
    .orderBy(companies.createdAt)
    .limit(1);
  if (!company) {
    throw new Error(
      "Cannot provision a user: no company row exists. Run `pnpm db:seed` before the first sign-in.",
    );
  }

  // 3. Create. On conflict do nothing — see the note above.
  const [created] = await db
    .insert(users)
    .values({
      companyId: company.id,
      clerkUserId: auth.clerkUserId,
      role: "worker",
      name: auth.profile?.name?.trim() || PROVISIONAL_USER_NAME,
      phone: auth.profile?.phone ?? null,
    })
    .onConflictDoNothing({ target: users.clerkUserId })
    .returning();
  if (created) return created;

  // 4. Nothing came back, so a concurrent first request won the race between
  //    steps 1 and 3. Its row is the winner; read it.
  const [raced] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, auth.clerkUserId))
    .limit(1);
  if (!raced) {
    throw new Error(
      `Failed to provision user for ${auth.clerkUserId}: insert conflicted but no row was found.`,
    );
  }
  return raced;
}
