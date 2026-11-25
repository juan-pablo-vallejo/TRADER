// people.setEmail and people.setSignInPhone: the office changes the address a worker signs
// in with — gives one, replaces one, takes one away while the other remains. Whoever
// holds the new address can sign in as that person, so the change is held to this:
//
// - A worker's only. An admin's addresses, the caller's own among them, are not the
//   office's to change.
// - The person's row and the provider's login change together. The row is written and the
//   change recorded first, inside a savepoint; the provider is told last, and anything it
//   will not do (the address is another login's, no login is this row's, it cannot be
//   reached) undoes both. The provider is never asked about an address: it is handed the
//   row and what the row now holds (core/identity.ts, readdress).
// - Asked for the address the row already has, it writes nothing here and still hands the
//   row to the provider: a change that stopped half-way there is finished by saving it
//   again.
// - It locks the caller's row and the person's, and no other: nobody else waits. The
//   person's own phone, sending a clock tap meanwhile, waits its two seconds and sends the
//   tap again (core/trpc.ts, SYNC_TIMEOUTS); nothing is lost.
//
// Each change is one row of address_changes.
import { addressChanges, users } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import { signInEmailSchema, type IdentityDirectory } from "../core/identity";
import { pgFailure } from "../core/pg-error";
import type { AppUser } from "../core/resolve-user";
import { forbidden, unauthorized } from "../core/trpc";
import { invitedPhone } from "./invite";
import { readPerson, person } from "./list";

// Null takes the address away.
export const setEmailInput = z.strictObject({
  userId: z.uuid(),
  email: signInEmailSchema.nullable(),
});
export const setSignInPhoneInput = z.strictObject({
  userId: z.uuid(),
  phone: invitedPhone.nullable(),
});

const REFUSALS = [
  // An admin's addresses, one's own included, are the owner's to change.
  "admin",
  "deactivated",
  // A person signs in with something: the one address they have stays.
  "last_address",
  // Someone in this company has it.
  "email_taken",
  "phone_taken",
  // The provider holds it under another login. Whose, it does not say, and neither do we.
  "address_held",
  // No login is this row's: none carries its tag, and it has never signed in.
  "no_login",
  "company_closed",
] as const;
type Refusal = (typeof REFUSALS)[number];

export const addressOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("changed"), user: person }),
  // The row already had it. `matched`: and the provider's login did not, and now does.
  z.strictObject({ result: z.literal("unchanged"), user: person }),
  z.strictObject({ result: z.literal("matched"), user: person }),
  z.strictObject({ result: z.literal("rejected"), code: z.enum(REFUSALS) }),
]);
type AddressResult = z.infer<typeof addressOutput>;

type Change =
  | { userId: string; field: "email"; value: string | null }
  | { userId: string; field: "sign_in_phone"; value: string | null };

// Thrown inside the savepoint so that it is rolled back, and caught just outside it.
class Refused extends Error {
  constructor(readonly code: Refusal) {
    super(code);
  }
}

const TAKEN: Record<string, Refusal | undefined> = {
  users_company_id_lower_email_idx: "email_taken",
  users_company_id_sign_in_phone_unique: "phone_taken",
};

// The caller FOR SHARE and the person FOR UPDATE, in id order as every writer of people
// takes users rows. A deactivated caller is UNAUTHORIZED and one who is no longer an admin
// FORBIDDEN, as everywhere; a person who is missing or another company's is FORBIDDEN.
async function lockBoth(tx: Tx, user: AppUser, userId: string) {
  const columns = {
    id: users.id,
    role: users.role,
    email: users.email,
    signInPhone: users.signInPhone,
    subject: users.identitySubject,
    deactivatedAt: users.deactivatedAt,
  };
  const read = async (id: string) => {
    const query = tx.select(columns).from(users).where(eq(users.id, id));
    const [row] = await (id === userId ? query.for("update") : query.for("share"));
    return row;
  };
  const rows = new Map<string, Awaited<ReturnType<typeof read>>>();
  for (const id of [...new Set([user.id, userId])].sort()) rows.set(id, await read(id));
  const self = rows.get(user.id);
  if (self === undefined || self.deactivatedAt !== null) throw unauthorized();
  if (self.role !== "admin") throw forbidden();
  const person = rows.get(userId);
  if (person === undefined) throw forbidden();
  return person;
}

async function setAddress(
  tx: Tx,
  user: AppUser,
  change: Change,
  directory: IdentityDirectory,
): Promise<AddressResult> {
  const person = await lockBoth(tx, user, change.userId);
  if (person.role === "admin") return { result: "rejected", code: "admin" };
  if (person.deactivatedAt !== null) return { result: "rejected", code: "deactivated" };
  const old = change.field === "email" ? person.email : person.signInPhone;
  const next = {
    email: change.field === "email" ? change.value : person.email,
    phone: change.field === "sign_in_phone" ? change.value : person.signInPhone,
  };
  if (next.email === null && next.phone === null) {
    return { result: "rejected", code: "last_address" };
  }
  const written = old !== change.value;
  let told: Awaited<ReturnType<IdentityDirectory["readdress"]>>;
  try {
    told = await tx.transaction(async (sp) => {
      if (written) {
        try {
          await sp
            .update(users)
            .set(
              change.field === "email"
                ? { email: change.value }
                : { signInPhone: change.value },
            )
            .where(eq(users.id, change.userId));
        } catch (error) {
          const pg = pgFailure(error);
          const code = pg.code === "23505" ? TAKEN[pg.constraint ?? ""] : undefined;
          if (code === undefined) throw error;
          throw new Refused(code);
        }
        await sp.insert(addressChanges).values({
          companyId: user.companyId,
          userId: change.userId,
          field: change.field,
          oldValue: old,
          newValue: change.value,
          changedByUserId: user.id,
        });
      }
      // Last, and inside the savepoint: a provider that will not, or cannot be reached,
      // leaves the person's row as it was.
      const answer = await directory.readdress({
        id: change.userId,
        subject: person.subject,
        email: next.email,
        phone: next.phone,
        fresh: written,
      });
      if (answer === "held") throw new Refused("address_held");
      if (answer === "no_login") throw new Refused("no_login");
      return answer;
    });
  } catch (error) {
    if (error instanceof Refused) return { result: "rejected", code: error.code };
    throw error;
  }
  const after = await readPerson(tx, change.userId);
  if (after === undefined) throw new Error("the changed row is not visible");
  return {
    result: written ? "changed" : told === "done" ? "matched" : "unchanged",
    user: after,
  };
}

export const peopleSetEmail = (
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof setEmailInput>,
  directory: IdentityDirectory,
) =>
  setAddress(
    tx,
    user,
    { userId: input.userId, field: "email", value: input.email },
    directory,
  );

export const peopleSetSignInPhone = (
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof setSignInPhoneInput>,
  directory: IdentityDirectory,
) =>
  setAddress(
    tx,
    user,
    { userId: input.userId, field: "sign_in_phone", value: input.phone },
    directory,
  );
