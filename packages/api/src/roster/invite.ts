// roster.invite (PRD, Access: invitation-only accounts; a new user starts as a worker, roles
// are a deliberate roster action). An invitation is a users row with the email, the name and
// the role, identity_subject NULL: the first sign-in with that verified email binds it
// (resolve-user.ts). No mail is sent until Clerk's invitation (Stage 6). The email is unique
// per company without regard to case (users.ts); a second one answers `email_taken` through
// ON CONFLICT … DO NOTHING on the expression index — raw SQL, as the seed writes it, because
// Drizzle's onConflict names columns only — so the conflict is never raised and the
// transaction is never aborted. Consumed by routers/roster.ts.
import { userRole } from "@trader/db/schema";
import { sql } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../context";
import { verifiedIdentitySchema } from "../identity";
import type { AppUser } from "../resolve-user";
import { readRosterUser, rosterUser } from "./list";

// The email validated as a sign-in email is, since that is what it will be matched against.
export const inviteInput = z.strictObject({
  email: verifiedIdentitySchema.shape.email,
  name: z.string().trim().min(1).max(120),
  role: z.enum(userRole.enumValues).default("worker"),
});

export type InviteInput = z.infer<typeof inviteInput>;

export const inviteOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("invited"), user: rosterUser }),
  // Another user of this company already has the email, active or not. Nothing is written.
  z.strictObject({ result: z.literal("rejected"), code: z.literal("email_taken") }),
]);

export type InviteResult = z.infer<typeof inviteOutput>;

export async function rosterInvite(
  tx: Tx,
  user: AppUser,
  input: InviteInput,
): Promise<InviteResult> {
  const { rows } = await tx.execute<{ id: string }>(sql`
    INSERT INTO users (company_id, email, name, role)
    VALUES (${user.companyId}, ${input.email}, ${input.name}, ${input.role}::user_role)
    ON CONFLICT (company_id, lower(email)) DO NOTHING
    RETURNING id
  `);
  const inserted = rows[0];
  if (inserted === undefined) return { result: "rejected", code: "email_taken" };
  const invited = await readRosterUser(tx, inserted.id);
  if (invited === undefined) throw new Error("the invited row is not visible");
  return { result: "invited", user: invited };
}
