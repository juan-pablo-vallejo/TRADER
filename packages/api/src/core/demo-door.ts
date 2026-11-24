// The Demo sign-in: the one way in that sends no text message. Apple's beta review, and
// anyone shown the product, signs in as a person of the Demo company with that person's
// number and one code the owner keeps (the host's environment; never the repository).
//
// It admits nobody else. A number is let through only when it is the sign-in number of an
// active person of the one company the host names (`companyId`), and that company is flagged
// as the Demo company in the database (companies.demo, which the owner alone sets: M8): the
// Demo company in production, the fixture company on staging. D Sierra's people are in another company, so
// no code, right or wrong, signs anyone in as one of them. What comes back is a single-use
// ticket from the identity provider for that one person's own login (M9: the row's bound
// subject; only an invitation not yet signed in is found by its number), which the phone
// redeems as an ordinary session: from there every request is judged as any other.
//
// One answer for every refusal, so a caller learns nothing of which part was wrong: no
// door on this host, a wrong code, a number that is not a Demo person's, a provider that
// did not answer. The code is compared in constant time. Request rates are the firewall's
// (apps/web, edge.ts); the code is long enough that guessing it is not a plan.
// Consumed by routers/demo.ts; the door itself is the host's (apps/web, clerk-demo.ts).
import { createHash, timingSafeEqual } from "node:crypto";

import type { Db } from "@trader/db";
import { companies, users } from "@trader/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { signInPhoneSchema } from "./identity";
import { PROTECTED_TIMEOUTS, runtimeRoleChecked } from "./trpc";

export type DemoDoor = {
  // The code a caller must present. Never logged, never answered.
  code: string;
  // The one company whose people the door admits.
  companyId: string;
  // A single-use sign-in ticket for the admitted person: their login (`subject`, the row's
  // identity_subject), or, for an invitation not yet signed in (null), whoever holds `phone`
  // at the identity provider. Null when it has none to give. May throw: the network, never
  // a verdict.
  ticket(person: { phone: string; subject: string | null }): Promise<string | null>;
};

// The company that reaches nobody outside this deployment: the door's company, in
// production (the host says when: apps/web, clerk-demo.ts). Its code is shared by design,
// so whoever holds it can sign in as any of its people, its admin included, and must be
// harmless: its invoices are emailed only to `allowed` (the deployment's allow-list;
// blank is nobody), and it invites nobody (roster/invite.ts), since an invitation makes a
// login for any number. Null everywhere else, staging included: no rule changes there.
export type ClosedCompany = { companyId: string; allowed: readonly string[] };

export const isClosed = (closed: ClosedCompany | null, companyId: string): boolean =>
  closed !== null && closed.companyId === companyId;

export const demoSignInInput = z.strictObject({
  phone: signInPhoneSchema,
  code: z.string().min(1).max(128),
});

export const demoSignInOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("ticket"), ticket: z.string() }),
  z.strictObject({ result: z.literal("refused") }),
]);

export type DemoSignInResult = z.infer<typeof demoSignInOutput>;

const REFUSED: DemoSignInResult = { result: "refused" };

// Equal digests, compared in constant time: the comparison's length says nothing of the
// code's, and its time nothing of where the two part.
const sameSecret = (given: string, kept: string): boolean => {
  const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();
  return timingSafeEqual(digest(given), digest(kept));
};

// The active person of the door's company whose sign-in number `phone` is, when that
// company is flagged Demo: their login (null for an invitation), or undefined for nobody. A
// transaction of its own, as the application's role, with that company as its tenant and
// no identity: row-level security shows it that company's people and nobody else's.
async function demoPerson(
  db: Db,
  door: DemoDoor,
  phone: string,
): Promise<{ subject: string | null } | undefined> {
  await runtimeRoleChecked(db);
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      select set_config('app.identity_subject', '', true),
        set_config('app.identity_email', '', true),
        set_config('app.identity_phone', '', true),
        set_config('app.company_id', ${door.companyId}, true),
        set_config('lock_timeout', ${PROTECTED_TIMEOUTS.lockTimeout}, true),
        set_config('statement_timeout', ${PROTECTED_TIMEOUTS.statementTimeout}, true)
    `);
    const found = await tx
      .select({ subject: users.identitySubject })
      .from(users)
      .innerJoin(companies, eq(companies.id, users.companyId))
      .where(
        and(
          eq(users.companyId, door.companyId),
          eq(companies.demo, true),
          eq(users.signInPhone, phone),
          isNull(users.deactivatedAt),
        ),
      );
    return found.length === 1 ? found[0] : undefined;
  });
}

export async function demoSignIn(
  db: Db,
  door: DemoDoor | null,
  input: z.infer<typeof demoSignInInput>,
  onFailure: (error: unknown) => void,
): Promise<DemoSignInResult> {
  if (door === null) return REFUSED;
  if (!sameSecret(input.code, door.code)) return REFUSED;
  const person = await demoPerson(db, door, input.phone);
  if (person === undefined) return REFUSED;
  try {
    const ticket = await door.ticket({ phone: input.phone, subject: person.subject });
    return ticket === null ? REFUSED : { result: "ticket", ticket };
  } catch (error) {
    // The provider did not answer. Reported, and refused like anything else.
    onFailure(error);
    return REFUSED;
  }
}
