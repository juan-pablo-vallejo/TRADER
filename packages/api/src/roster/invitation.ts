// An invitation's sends: `roster.sendInvitation` emails it, `roster.noteInvitation` records
// that the admin opened the ready text on their own phone to send it. Both write one row of
// invitation_sends, which the roster reads back as where the invitation stands (list.ts).
//
// The email is the words of the text message (contract/invitation.ts) with the link to
// where the app is got, which is the host's to say and never a request's: TRADER sends this
// from the address its invoices go from, so what it says and where it points are fixed here.
// It goes only to the person's own address as the roster holds it, read under a lock; the
// request names a person, never an address. Only someone who has not signed in is invited,
// and no more than a few times a day, so the office cannot be made to mail anyone at all.
//
// The id is the browser's. A request sent twice is one send; an id that belongs to another
// person's send is refused. The mail goes before the row is written, as an invoice's does
// (invoices/send.ts): the mail service is given the same id and treats a repeat of it as
// the same message.
import {
  invitationParagraphs,
  invitationSubject,
  type InvitationChannel,
} from "../contract/invitation";
import { companies, invitationSends, users } from "@trader/db/schema";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import { lockUsersShare } from "../core/locks";
import { MAIL_FAILURES, type Mailer } from "../core/mailer";
import type { AppUser } from "../core/resolve-user";

// A person is emailed their invitation at most this often: enough to send it again when it
// went astray, and no use to anyone trying to fill an inbox.
export const INVITATION_EMAILS_A_DAY = 5;

export const invitationInput = z.strictObject({
  // The send's own id, made by the browser.
  id: z.uuid({ version: "v7" }),
  userId: z.uuid(),
});

// Why nothing was sent or noted. `company_closed`: this company invites nobody on this
// deployment (the Demo company in production; core/demo-door.ts).
const REFUSALS = [
  "id_conflict",
  "deactivated",
  "signed_in",
  "no_email",
  "no_number",
  "no_link",
  "too_many",
  "company_closed",
] as const;

const refusal = z.strictObject({
  result: z.literal("rejected"),
  code: z.enum(REFUSALS),
});
type Refusal = z.infer<typeof refusal>;
const refused = (code: Refusal["code"]): Refusal => ({ result: "rejected", code });

export const sendInvitationOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("sent") }),
  // The mail service did not take it: recorded, and said.
  z.strictObject({ result: z.literal("failed"), failure: z.enum(MAIL_FAILURES) }),
  // This id's send was already made: how it went then.
  z.strictObject({
    result: z.literal("duplicate"),
    outcome: z.enum(["sent", "failed"]),
  }),
  refusal,
]);

export const noteInvitationOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("noted") }),
  z.strictObject({ result: z.literal("duplicate") }),
  refusal,
]);

type Person = {
  name: string;
  email: string | null;
  signInPhone: string | null;
  signedIn: boolean;
  deactivatedAt: Date | null;
};

// The caller and the person, locked together in id order, then the person as the roster
// holds them: their addresses cannot change under a send. A person who is missing or
// another company's is FORBIDDEN (core/locks.ts).
async function lockPerson(tx: Tx, user: AppUser, userId: string): Promise<Person> {
  await lockUsersShare(tx, user, [userId]);
  const [person] = await tx
    .select({
      name: users.name,
      email: users.email,
      signInPhone: users.signInPhone,
      signedIn: sql<boolean>`${users.identitySubject} is not null`,
      deactivatedAt: users.deactivatedAt,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (person === undefined) throw new Error("a locked person is not visible");
  return person;
}

// A send already made under this id, if it is this person's by this way.
async function madeBefore(
  tx: Tx,
  input: z.infer<typeof invitationInput>,
  channel: InvitationChannel,
): Promise<{ mine: boolean; outcome: "sent" | "failed" } | undefined> {
  const [existing] = await tx
    .select({
      userId: invitationSends.userId,
      channel: invitationSends.channel,
      outcome: invitationSends.outcome,
    })
    .from(invitationSends)
    .where(eq(invitationSends.id, input.id));
  if (existing === undefined) return undefined;
  return {
    mine: existing.userId === input.userId && existing.channel === channel,
    outcome: existing.outcome === "sent" ? "sent" : "failed",
  };
}

// Who an invitation is for: someone the office still expects, who has not signed in.
const notInvitable = (person: Person): Refusal | null =>
  person.deactivatedAt !== null
    ? refused("deactivated")
    : person.signedIn
      ? refused("signed_in")
      : null;

async function record(
  tx: Tx,
  user: AppUser,
  row: Omit<typeof invitationSends.$inferInsert, "companyId" | "sentByUserId">,
): Promise<void> {
  const inserted = await tx
    .insert(invitationSends)
    .values({ ...row, companyId: user.companyId, sentByUserId: user.id })
    // The id is named: taken by a row this tenant cannot see, it is refused, and the
    // record of this send would be lost — so that is an error, not an answer.
    .onConflictDoNothing({ target: invitationSends.id })
    .returning({ id: invitationSends.id });
  if (inserted.length !== 1) throw new Error("a send could not be recorded under its id");
}

export async function sendInvitation(
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof invitationInput>,
  // The mail service, and where the app is got from on this host: null where the host
  // names no address of its own, and then nothing is sent.
  host: { mailer: Mailer; getAppUrl: string | null },
): Promise<z.infer<typeof sendInvitationOutput>> {
  const person = await lockPerson(tx, user, input.userId);
  const before = await madeBefore(tx, input, "email");
  if (before !== undefined) {
    return before.mine
      ? { result: "duplicate", outcome: before.outcome }
      : refused("id_conflict");
  }
  const no = notInvitable(person);
  if (no !== null) return no;
  if (person.email === null) return refused("no_email");
  if (host.getAppUrl === null) return refused("no_link");
  const recipient = person.email.trim().toLowerCase();

  const [recent] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(invitationSends)
    .where(
      and(
        eq(invitationSends.userId, input.userId),
        eq(invitationSends.channel, "email"),
        gt(invitationSends.createdAt, sql`now() - interval '1 day'`),
      ),
    );
  if ((recent?.count ?? 0) >= INVITATION_EMAILS_A_DAY) return refused("too_many");

  const [company] = await tx
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, user.companyId));
  if (company === undefined) throw new Error("the caller's company is not visible");

  const answer = await host.mailer.send({
    to: recipient,
    subject: invitationSubject(company.name),
    text: invitationParagraphs({
      name: person.name,
      company: company.name,
      url: host.getAppUrl,
      by: "email",
    }),
    idempotencyKey: input.id,
  });
  await record(tx, user, {
    id: input.id,
    userId: input.userId,
    channel: "email",
    recipient,
    outcome: answer.ok ? "sent" : "failed",
    failure: answer.ok ? null : answer.failure,
    providerMessageId: answer.ok ? answer.messageId : null,
  });
  return answer.ok ? { result: "sent" } : { result: "failed", failure: answer.failure };
}

// The admin opened the ready text on their own phone. TRADER sent nothing and cannot know
// that they did: what is recorded is that it was opened to send, to the number the roster
// holds, which is all "sent by text" has ever meant here.
export async function noteInvitation(
  tx: Tx,
  user: AppUser,
  input: z.infer<typeof invitationInput>,
): Promise<z.infer<typeof noteInvitationOutput>> {
  const person = await lockPerson(tx, user, input.userId);
  const before = await madeBefore(tx, input, "text");
  if (before !== undefined) {
    return before.mine ? { result: "duplicate" } : refused("id_conflict");
  }
  const no = notInvitable(person);
  if (no !== null) return no;
  if (person.signInPhone === null) return refused("no_number");
  await record(tx, user, {
    id: input.id,
    userId: input.userId,
    channel: "text",
    recipient: person.signInPhone,
    outcome: "sent",
  });
  return { result: "noted" };
}
