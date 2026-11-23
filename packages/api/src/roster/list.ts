// roster.list: the admin keeps the roster. Every user of the caller's
// company, deactivated ones included with their timestamp so the office can reactivate them,
// ordered by name. `invited` is "never signed in" (identity_subject still NULL); the subject
// itself is never output, as me.get never outputs it. Each person carries where their
// invitation stands and the sends it is worked out from (contract/invitation.ts,
// invitation_sends): worked out here on every read, never stored. A plain read under RLS,
// no locks. Consumed by routers/roster.ts, and by invite.ts, role.ts and deactivation.ts for
// the row they answer with.
import { ROLES } from "../contract/enums";
import {
  INVITATION_CHANNELS,
  INVITATION_STATUSES,
  invitationStatus,
  type InvitationChannel,
} from "../contract/invitation";
import { invitationSends, users } from "@trader/db/schema";
import { asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import type { Tx } from "../core/context";

// One time an invitation went out: by which way, when, who sent it, and how it went. A
// text is the admin's own message, noted when they opened it to send; an email is
// TRADER's, with the mail service's answer. The address it went to stays in the record and
// is not output: the panel shows the person's own.
const invitationSend = z.strictObject({
  id: z.uuid(),
  channel: z.enum(INVITATION_CHANNELS),
  at: z.date(),
  by: z.string(),
  outcome: z.enum(["sent", "failed"]),
  failure: z.string().nullable(),
});

export const rosterUser = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  // Null for a person invited by number alone.
  email: z.string().nullable(),
  phone: z.string().nullable(),
  // The number the person signs in with (users.ts), or null: invited by email alone.
  signInPhone: z.string().nullable(),
  role: z.enum(ROLES),
  // Whether their clock taps are stamped with a location; null is "as the company".
  locationStamps: z.boolean().nullable(),
  invited: z.boolean(),
  // When the office invited them: when their row was made.
  invitedAt: z.date(),
  deactivatedAt: z.date().nullable(),
  // Where their invitation stands, and each send, newest first.
  invitation: z.strictObject({
    status: z.enum(INVITATION_STATUSES),
    sends: z.array(invitationSend),
  }),
});

export type RosterUser = z.infer<typeof rosterUser>;

export const listOutput = z.array(rosterUser);

const columns = {
  id: users.id,
  name: users.name,
  email: users.email,
  phone: users.phone,
  signInPhone: users.signInPhone,
  role: users.role,
  locationStamps: users.locationStamps,
  bound: sql<boolean>`${users.identitySubject} is not null`,
  invitedAt: users.createdAt,
  deactivatedAt: users.deactivatedAt,
};

type Row = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  signInPhone: string | null;
  role: RosterUser["role"];
  locationStamps: boolean | null;
  bound: boolean;
  invitedAt: Date;
  deactivatedAt: Date | null;
};

type Send = {
  id: string;
  userId: string;
  channel: string;
  recipient: string;
  outcome: string;
  failure: string | null;
  at: Date;
  by: string;
};

// The sends of the people asked for, newest first. One company's only, under RLS.
async function sendsOf(tx: Tx, userId?: string): Promise<Send[]> {
  const sender = alias(users, "sender");
  const query = tx
    .select({
      id: invitationSends.id,
      userId: invitationSends.userId,
      channel: invitationSends.channel,
      recipient: invitationSends.recipient,
      outcome: invitationSends.outcome,
      failure: invitationSends.failure,
      at: invitationSends.createdAt,
      by: sender.name,
    })
    .from(invitationSends)
    .innerJoin(sender, eq(sender.id, invitationSends.sentByUserId));
  const rows = await (
    userId === undefined ? query : query.where(eq(invitationSends.userId, userId))
  ).orderBy(desc(invitationSends.createdAt), desc(invitationSends.id));
  return rows;
}

const channelOf = (send: Send): InvitationChannel =>
  send.channel === "email" ? "email" : "text";

const toUser = (row: Row, sends: Send[]): RosterUser => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  signInPhone: row.signInPhone,
  role: row.role,
  locationStamps: row.locationStamps,
  invited: !row.bound,
  invitedAt: row.invitedAt,
  deactivatedAt: row.deactivatedAt,
  invitation: {
    status: invitationStatus({
      signedIn: row.bound,
      email: row.email,
      signInPhone: row.signInPhone,
      sends: sends.map((send) => ({
        channel: channelOf(send),
        recipient: send.recipient,
        outcome: send.outcome,
      })),
    }),
    sends: sends.map((send) => ({
      id: send.id,
      channel: channelOf(send),
      at: send.at,
      by: send.by,
      outcome: send.outcome === "sent" ? "sent" : "failed",
      failure: send.failure,
    })),
  },
});

export async function rosterList(tx: Tx): Promise<RosterUser[]> {
  const rows = await tx
    .select(columns)
    .from(users)
    .orderBy(asc(sql`lower(${users.name})`), asc(users.id));
  const byPerson = new Map<string, Send[]>();
  for (const send of await sendsOf(tx)) {
    byPerson.set(send.userId, [...(byPerson.get(send.userId) ?? []), send]);
  }
  return rows.map((row) => toUser(row, byPerson.get(row.id) ?? []));
}

// One visible user, or undefined: another tenant's row is invisible under RLS.
export async function readRosterUser(
  tx: Tx,
  id: string,
): Promise<RosterUser | undefined> {
  const [row] = await tx.select(columns).from(users).where(eq(users.id, id));
  if (row === undefined) return undefined;
  return toUser(row, await sendsOf(tx, id));
}
