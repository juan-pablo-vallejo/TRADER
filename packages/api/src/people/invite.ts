// people.invite: accounts are by invitation only; a new user starts as a worker unless the
// invitation names another role. An invitation is a users row with a sign-in address — a
// mobile number, an email, or both — the name and the role, identity_subject
// NULL: the first sign-in the provider verified for either address binds it
// (resolve-user.ts). The person is then admitted at the identity provider (identity.ts,
// IdentityDirectory), inside this transaction: if the provider cannot be told, nothing was
// invited. No message is sent to the person. Each address is unique per company
// (users.ts), so two unique indexes can refuse the insert and one ON CONFLICT target would
// cover one of them: the statement names none, so no conflict is ever raised and the
// transaction is never aborted, and a read then says which address is held. The id is the
// office's own uuidv7 when it sends one (M10), so a retry after a dropped response finds its
// own row and answers as the first call did; without one it is the database's.
import { ROLES } from "../contract/enums";
import { sql } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import {
  signInEmailSchema,
  signInPhoneSchema,
  type IdentityDirectory,
} from "../core/identity";
import { lockActiveSelf } from "../core/locks";
import type { AppUser } from "../core/resolve-user";
import { readPerson, person } from "./list";

// A number as an admin types it: ten digits, or eleven starting with 1, with any spacing and
// punctuation; a number written with another country's prefix is refused, not reinterpreted.
// Stored as it will be matched, in E.164 (signInPhoneSchema).
export const invitedPhone = z
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
// against. A mobile number, an email, or both: one of the two, as the column's own rule has
// it (users_sign_in_address_present). A person invited by email alone signs in by a code
// sent to it.
export const inviteInput = z
  .strictObject({
    // The invitation's id, made by the office: the same id again is a retry.
    id: z.uuid({ version: "v7" }),
    email: signInEmailSchema.optional(),
    phone: invitedPhone.optional(),
    name: z.string().trim().min(1).max(120),
    role: z.enum(ROLES).default("worker"),
  })
  .refine(
    (invitation) => invitation.email !== undefined || invitation.phone !== undefined,
    {
      path: ["phone"],
      message: "an invitation needs a mobile number or an email",
    },
  );

type InviteInput = z.infer<typeof inviteInput>;

export const inviteOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("invited"), user: person }),
  // Another user of this company already has that address, active or not. Nothing is
  // written. When both are held, the email is the one named.
  // `company_closed`: this company invites nobody on this deployment (the Demo company in
  // production; core/demo-door.ts, routers/roster.ts). Nothing is written.
  // `id_conflict`: the id is held by a row this caller cannot see. Nothing is written; the
  // office sends again under a new id.
  z.strictObject({
    result: z.literal("rejected"),
    code: z.enum(["email_taken", "phone_taken", "company_closed", "id_conflict"]),
  }),
]);

type InviteResult = z.infer<typeof inviteOutput>;

export async function peopleInvite(
  tx: Tx,
  user: AppUser,
  input: InviteInput,
  directory: IdentityDirectory,
): Promise<InviteResult> {
  // The caller, under a lock held to commit, as every office writer re-reads it.
  await lockActiveSelf(tx, user, "admin");
  const email = input.email ?? null;
  const phone = input.phone ?? null;
  const { rows } = await tx.execute<{ id: string }>(sql`
    INSERT INTO users (id, company_id, email, sign_in_phone, name, role)
    VALUES (${input.id}::uuid, ${user.companyId}, ${email},
      ${phone}, ${input.name}, ${input.role}::user_role)
    ON CONFLICT DO NOTHING
    RETURNING id
  `);
  const inserted = rows[0];
  if (inserted === undefined) {
    // A retry: the row is this company's own, written by the call whose answer was lost, so
    // it is answered as that call was (the person was admitted then). Held by a row this
    // tenant cannot see, it is no retry.
    const own = await readPerson(tx, input.id);
    if (own !== undefined) return { result: "invited", user: own };
    const { rows: unheld } = await tx.execute<{ free: boolean }>(sql`
      SELECT NOT EXISTS (
        SELECT 1 FROM users WHERE company_id = ${user.companyId}
          AND (lower(email) = lower(${email}) OR sign_in_phone = ${phone})
      ) AS free
    `);
    // Neither address is held here, so only the id stopped the insert.
    if (unheld[0]?.free === true) return { result: "rejected", code: "id_conflict" };
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
  const invited = await readPerson(tx, inserted.id);
  if (invited === undefined) throw new Error("the invited row is not visible");
  // Last, so a refusal above never reaches the provider, and awaited inside the transaction,
  // so a provider that cannot be told rolls the row back. The reverse
  // order of failure — the provider told, the commit lost — leaves a login that matches no
  // invitation and is refused; inviting again admits the same addresses and succeeds.
  await directory.admit({ id: inserted.id, email, phone });
  return { result: "invited", user: invited };
}
