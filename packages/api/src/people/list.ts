// people.list: the admin keeps the roster. Every user of the caller's
// company, deactivated ones included with their timestamp so the office can reactivate them,
// ordered by name. `invited` is "never signed in" (identity_subject still NULL); the subject
// itself is never output, as me.get never outputs it. Each person carries where their
// invitation stands and the sends it is worked out from (contract/invitation.ts,
// invitation_sends): worked out here on every read, never stored; and each time the office
// changed an address of theirs (address_changes). A plain read under RLS, no locks.
import { ROLES } from "../contract/enums";
import {
  INVITATION_CHANNELS,
  INVITATION_STATUSES,
  invitationStatus,
  type InvitationChannel,
} from "../contract/invitation";
import { addressChanges, invitationSends, users } from "@trader/db/schema";
import { asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import type { Tx } from "../core/context";
import { groupBy } from "../core/group";
import { byName } from "../core/order";

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

// One time the office changed an address the person signs in with: which, from what to
// what (null: there was none, or it was taken away), by whom and when.
const addressChange = z.strictObject({
  id: z.uuid(),
  field: z.enum(["email", "sign_in_phone"]),
  from: z.string().nullable(),
  to: z.string().nullable(),
  by: z.string(),
  at: z.date(),
});

export const person = z.strictObject({
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
  // Each change of their sign-in addresses, newest first.
  addressChanges: z.array(addressChange),
});

export type Person = z.infer<typeof person>;

export const listOutput = z.array(person);

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
  role: Person["role"];
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
  return (
    userId === undefined ? query : query.where(eq(invitationSends.userId, userId))
  ).orderBy(desc(invitationSends.createdAt), desc(invitationSends.id));
}

type Changed = z.infer<typeof addressChange> & { userId: string };

// The address changes of the people asked for, newest first.
async function changesOf(tx: Tx, userId?: string): Promise<Changed[]> {
  const admin = alias(users, "changed_by");
  const query = tx
    .select({
      id: addressChanges.id,
      userId: addressChanges.userId,
      field: addressChanges.field,
      from: addressChanges.oldValue,
      to: addressChanges.newValue,
      by: admin.name,
      at: addressChanges.createdAt,
    })
    .from(addressChanges)
    .innerJoin(admin, eq(admin.id, addressChanges.changedByUserId));
  const rows = await (
    userId === undefined ? query : query.where(eq(addressChanges.userId, userId))
  ).orderBy(desc(addressChanges.createdAt), desc(addressChanges.id));
  return rows.map((row) => ({
    ...row,
    field: row.field === "email" ? "email" : "sign_in_phone",
  }));
}

const channelOf = (send: Send): InvitationChannel =>
  send.channel === "email" ? "email" : "text";

const toUser = (row: Row, sends: Send[], changes: Changed[]): Person => ({
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
  addressChanges: changes.map(({ userId: _person, ...change }) => change),
});

export async function peopleList(tx: Tx): Promise<Person[]> {
  const rows = await tx
    .select(columns)
    .from(users)
    .orderBy(asc(byName(users.name)), asc(users.id));
  const byPerson = groupBy(await sendsOf(tx), (send) => send.userId);
  const changed = groupBy(await changesOf(tx), (change) => change.userId);
  return rows.map((row) =>
    toUser(row, byPerson.get(row.id) ?? [], changed.get(row.id) ?? []),
  );
}

// One visible user, or undefined: another tenant's row is invisible under RLS.
export async function readPerson(tx: Tx, id: string): Promise<Person | undefined> {
  const [row] = await tx.select(columns).from(users).where(eq(users.id, id));
  if (row === undefined) return undefined;
  return toUser(row, await sendsOf(tx, id), await changesOf(tx, id));
}
