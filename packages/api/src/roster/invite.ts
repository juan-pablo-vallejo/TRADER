// roster.invite (PRD, Access: invitation-only accounts; a new user starts as a worker, roles
// are a deliberate roster action). An invitation is a users row with a sign-in address — the
// mobile number, and an email when one is given — the name and the role, identity_subject
// NULL: the first sign-in the provider verified for either address binds it
// (resolve-user.ts). The person is then admitted at the identity provider (identity.ts,
// IdentityDirectory), inside this transaction: if the provider cannot be told, nothing was
// invited. No message is sent to the person. Each address is unique per company
// (users.ts), so two unique indexes can refuse the insert and one ON CONFLICT target would
// cover one of them: the statement names none, so no conflict is ever raised and the
// transaction is never aborted, and a read then says which address is held. The id is the
// database's own uuidv7(), so the only conflicts there can be are those two. An invitation
// leaves one audit row (core/audit.ts). Consumed by routers/roster.ts.
import { userRole } from "@trader/db/schema";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { recordAudit } from "../core/audit";
import type { Tx } from "../core/context";
import {
  signInEmailSchema,
  signInPhoneSchema,
  type IdentityDirectory,
} from "../core/identity";
import type { AppUser } from "../core/resolve-user";
import { readRosterUser, rosterUser } from "./list";

// A number as an admin types it: ten digits, or eleven starting with 1, with any spacing and
// punctuation; a number written with another country's prefix is refused, not reinterpreted.
// Stored as it will be matched, in E.164 (signInPhoneSchema).
const invitedPhone = z
  .string()
  .trim()
  .max(32)
  .transform((typed) => {
    const digits = typed.replace(/\D/g, "");
    if (typed.startsWith("+") || digits.length === 11) return `+${digits}`;
    return `+1${digits}`;
  })
  .pipe(signInPhoneSchema);

// Each address validated as a sign-in address is, since that is what it will be matched
// against. The number is required of every new invitation: the provider holds no login
// without one (ARCHITECTURE, invitation at the provider). Rows invited by email alone
// before that stay as they are; the column's own rule is still one address of the two.
export const inviteInput = z.strictObject({
  email: signInEmailSchema.optional(),
  phone: invitedPhone,
  name: z.string().trim().min(1).max(120),
  role: z.enum(userRole.enumValues).default("worker"),
});

export type InviteInput = z.infer<typeof inviteInput>;

export const inviteOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("invited"), user: rosterUser }),
  // Another user of this company already has that address, active or not. Nothing is
  // written. When both are held, the email is the one named.
  z.strictObject({
    result: z.literal("rejected"),
    code: z.enum(["email_taken", "phone_taken"]),
  }),
]);

export type InviteResult = z.infer<typeof inviteOutput>;

export async function rosterInvite(
  tx: Tx,
  user: AppUser,
  input: InviteInput,
  directory: IdentityDirectory,
): Promise<InviteResult> {
  const email = input.email ?? null;
  const phone = input.phone;
  const { rows } = await tx.execute<{ id: string }>(sql`
    INSERT INTO users (company_id, email, sign_in_phone, name, role)
    VALUES (${user.companyId}, ${email}, ${phone}, ${input.name}, ${input.role}::user_role)
    ON CONFLICT DO NOTHING
    RETURNING id
  `);
  const inserted = rows[0];
  if (inserted === undefined) {
    // The row that won is committed or this transaction's own, and a users row is never
    // deleted, so it is there to read.
    const { rows: held } = await tx.execute<{ email_taken: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM users
        WHERE company_id = ${user.companyId} AND lower(email) = lower(${email})
      ) AS email_taken
    `);
    return {
      result: "rejected",
      code: held[0]?.email_taken === true ? "email_taken" : "phone_taken",
    };
  }
  // The row names who was invited; the audit row repeats no address and no name.
  await recordAudit(tx, user, {
    action: "users.invite",
    entityId: inserted.id,
    after: { role: input.role },
  });
  const invited = await readRosterUser(tx, inserted.id);
  if (invited === undefined) throw new Error("the invited row is not visible");
  // Last, so a refusal above never reaches the provider, and awaited inside the transaction,
  // so a provider that cannot be told rolls the row and its audit row back. The reverse
  // order of failure — the provider told, the commit lost — leaves a login that matches no
  // invitation and is refused; inviting again admits the same addresses and succeeds.
  await directory.admit({ email, phone });
  return { result: "invited", user: invited };
}
