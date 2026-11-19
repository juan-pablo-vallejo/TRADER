// The Demo sign-in: the one way in that sends no text message. Apple's beta review, and
// anyone shown the product, signs in as a person of the Demo company with that person's
// number and one code the owner keeps (the host's environment; never the repository).
//
// It admits nobody else. A number is let through only when it is the sign-in number of an
// active person of the one company the host names (`companyId`): the Demo company in
// production, the fixture company on staging. D Sierra's people are in another company, so
// no code, right or wrong, signs anyone in as one of them. What comes back is a single-use
// ticket from the identity provider for that one person, which the phone redeems as an
// ordinary session: from there every request is judged as any other.
//
// One answer for every refusal, so a caller learns nothing of which part was wrong: no
// door on this host, a wrong code, a number that is not a Demo person's, a provider that
// did not answer. The code is compared in constant time. Request rates are the firewall's
// (apps/web, edge.ts); the code is long enough that guessing it is not a plan.
// Consumed by routers/demo.ts; the door itself is the host's (apps/web, clerk-demo.ts).
import { createHash, timingSafeEqual } from "node:crypto";

import type { Db } from "@trader/db";
import { users } from "@trader/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { signInPhoneSchema } from "./identity";
import { PROTECTED_TIMEOUTS, runtimeRoleChecked } from "./trpc";

export type DemoDoor = {
  // The code a caller must present. Never logged, never answered.
  code: string;
  // The one company whose people the door admits.
  companyId: string;
  // A single-use sign-in ticket for the person who holds `phone` at the identity provider,
  // or null when it has none to give. May throw: the network, never a verdict.
  ticket(phone: string): Promise<string | null>;
};

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

// Whether `phone` is the sign-in number of an active person of the door's company. A
// transaction of its own, as the application's role, with that company as its tenant and
// no identity: row-level security shows it that company's people and nobody else's.
async function isDemoPerson(db: Db, door: DemoDoor, phone: string): Promise<boolean> {
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
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.companyId, door.companyId),
          eq(users.signInPhone, phone),
          isNull(users.deactivatedAt),
        ),
      );
    return found.length === 1;
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
  if (!(await isDemoPerson(db, door, input.phone))) return REFUSED;
  try {
    const ticket = await door.ticket(input.phone);
    return ticket === null ? REFUSED : { result: "ticket", ticket };
  } catch (error) {
    // The provider did not answer. Reported, and refused like anything else.
    onFailure(error);
    return REFUSED;
  }
}
