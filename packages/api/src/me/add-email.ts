// me.sendEmailCode and me.addEmail: a person whose login has no email (invited by number
// alone) adds one from Me, and proves it is theirs first. Whoever holds an address can sign
// in as its person, so the email is the person's only once the code mailed to it comes back:
//
// - The caller's own row, and only while it has no email. An email the row already has is
//   the office's to change (people.setEmail), never its person's.
// - A code is six digits, sent to the email, good for CODE_LIFE_MS, and only its hash is
//   kept, with the email, on the person's row (users.email_claim*). A new code replaces the
//   last and is given at most once in RESEND_AFTER_MS; WRONG_TRIES wrong codes end the
//   claim, and a new code is needed.
// - With the right code the row takes the email, the change is recorded (address_changes,
//   by the person themselves), and the identity provider's login gains the email, verified,
//   and nothing else (core/identity.ts, addEmail): the person stays signed in. Anything the
//   provider will not do undoes all of it.
// - Another person of this company holds it: refused, and said so. Another login of the
//   provider holds it: refused, without saying whose.
// - Under the development identity nothing is mailed and every code is DEV_CODE, as the
//   phone's sign-in stand-in takes 123456 (the host says which: Context, emailCode).
import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { addressChanges, users } from "@trader/db/schema";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";

import type { Context, Tx } from "../core/context";
import { signInEmailSchema } from "../core/identity";
import { pgFailure } from "../core/pg-error";
import type { AppUser } from "../core/resolve-user";

export const CODE_LIFE_MS = 10 * 60_000;
export const RESEND_AFTER_MS = 60_000;
export const WRONG_TRIES = 5;

export const sendEmailCodeInput = z.strictObject({
  email: signInEmailSchema,
  // The mail is written in the language the person reads the app in.
  language: z.enum(["en", "es"]),
});
export const addEmailInput = z.strictObject({
  code: z.string().regex(/^[0-9]{6}$/),
});

const SEND_REFUSALS = ["has_email", "email_taken", "too_soon", "not_sent"] as const;
const ADD_REFUSALS = [
  "has_email",
  "no_code",
  "expired",
  "wrong_code",
  "too_many",
  "email_taken",
  "address_held",
] as const;
export const sendEmailCodeOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("sent") }),
  z.strictObject({ result: z.literal("rejected"), code: z.enum(SEND_REFUSALS) }),
]);
export const addEmailOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("added"), email: z.string() }),
  z.strictObject({ result: z.literal("rejected"), code: z.enum(ADD_REFUSALS) }),
]);
type AddRefusal = (typeof ADD_REFUSALS)[number];

const MAIL = {
  en: {
    subject: "Your TRADER code",
    text: (code: string) => [
      `Your code to add this email to TRADER is ${code}.`,
      "It works for 10 minutes. If you did not ask for it, ignore this email.",
    ],
  },
  es: {
    subject: "Tu código de TRADER",
    text: (code: string) => [
      `Tu código para añadir este correo a TRADER es ${code}.`,
      "Sirve durante 10 minutos. Si no lo pediste, ignora este correo.",
    ],
  },
} as const;

// The person and the code together: a code is never good for another row.
const hashOf = (userId: string, code: string) =>
  createHash("sha256").update(`${userId}:${code}`).digest("hex");

const sameHash = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// The caller's own row, held for the call: two sends, or a send and a check, take turns.
async function lockOwn(tx: Tx, user: AppUser) {
  const [row] = await tx
    .select({
      email: users.email,
      signInPhone: users.signInPhone,
      subject: users.identitySubject,
      claim: users.emailClaim,
      hash: users.emailClaimCodeHash,
      sentAt: users.emailClaimSentAt,
      tries: users.emailClaimTries,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .for("update");
  if (row === undefined) throw new Error("the caller's own row is not visible");
  return row;
}

// Another person of this company has the email, without regard to case.
async function taken(tx: Tx, user: AppUser, email: string) {
  const [other] = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(ne(users.id, user.id), sql`lower(${users.email}) = lower(${email})`))
    .limit(1);
  return other !== undefined;
}

const clearClaim = {
  emailClaim: null,
  emailClaimCodeHash: null,
  emailClaimSentAt: null,
  emailClaimTries: 0,
};

export async function sendEmailCode(
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof sendEmailCodeInput>,
  ctx: Pick<Context, "mailer" | "emailCode">,
): Promise<z.infer<typeof sendEmailCodeOutput>> {
  const row = await lockOwn(tx, user);
  if (row.email !== null) return { result: "rejected", code: "has_email" };
  const now = Date.now();
  if (row.sentAt !== null && now - row.sentAt.getTime() < RESEND_AFTER_MS) {
    return { result: "rejected", code: "too_soon" };
  }
  if (await taken(tx, user, input.email)) {
    return { result: "rejected", code: "email_taken" };
  }
  const code = ctx.emailCode ?? String(randomInt(0, 1_000_000)).padStart(6, "0");
  const sentAt = new Date(now);
  await tx
    .update(users)
    .set({
      emailClaim: input.email,
      emailClaimCodeHash: hashOf(user.id, code),
      emailClaimSentAt: sentAt,
      emailClaimTries: 0,
    })
    .where(eq(users.id, user.id));
  if (ctx.emailCode !== null) return { result: "sent" };
  const mail = MAIL[input.language];
  const sent = await ctx.mailer.send({
    to: input.email,
    subject: mail.subject,
    text: mail.text(code),
    idempotencyKey: `email-code:${user.id}:${sentAt.getTime()}`,
  });
  if (!sent.ok) {
    // A code nobody received is no claim: the next send is not held back by it.
    await tx.update(users).set(clearClaim).where(eq(users.id, user.id));
    return { result: "rejected", code: "not_sent" };
  }
  return { result: "sent" };
}

// Thrown inside the savepoint so that it is rolled back, and caught just outside it.
class Refused extends Error {
  constructor(readonly code: AddRefusal) {
    super(code);
  }
}

export async function addEmail(
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof addEmailInput>,
  ctx: Pick<Context, "directory">,
): Promise<z.infer<typeof addEmailOutput>> {
  const row = await lockOwn(tx, user);
  if (row.email !== null) return { result: "rejected", code: "has_email" };
  if (row.claim === null || row.hash === null || row.sentAt === null) {
    return { result: "rejected", code: "no_code" };
  }
  if (row.tries >= WRONG_TRIES) return { result: "rejected", code: "too_many" };
  if (Date.now() - row.sentAt.getTime() > CODE_LIFE_MS) {
    return { result: "rejected", code: "expired" };
  }
  if (!sameHash(row.hash, hashOf(user.id, input.code))) {
    const tries = row.tries + 1;
    await tx.update(users).set({ emailClaimTries: tries }).where(eq(users.id, user.id));
    return { result: "rejected", code: tries >= WRONG_TRIES ? "too_many" : "wrong_code" };
  }
  const email = row.claim;
  try {
    await tx.transaction(async (sp) => {
      try {
        await sp
          .update(users)
          .set({ email, ...clearClaim })
          .where(eq(users.id, user.id));
      } catch (error) {
        const pg = pgFailure(error);
        if (pg.code === "23505" && pg.constraint === "users_company_id_lower_email_idx") {
          throw new Refused("email_taken");
        }
        throw error;
      }
      await sp.insert(addressChanges).values({
        companyId: user.companyId,
        userId: user.id,
        field: "email",
        oldValue: null,
        newValue: email,
        changedByUserId: user.id,
      });
      // Last, and inside the savepoint: a provider that will not, or cannot be reached,
      // leaves the row as it was and the claim standing.
      const answer = await ctx.directory.addEmail({
        id: user.id,
        subject: row.subject,
        email,
      });
      if (answer === "held") throw new Refused("address_held");
      // No login is the row's: the caller is signed in, so it is the development identity's
      // or a test's, where the row is the whole of it.
    });
  } catch (error) {
    if (error instanceof Refused) return { result: "rejected", code: error.code };
    throw error;
  }
  return { result: "added", email };
}
