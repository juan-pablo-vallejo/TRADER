// The signed-in caller's own record: the first consumer of the protected procedure. Nothing
// `get` takes can name whose record it reads. A phone that signed in by its Face ID or
// fingerprint key says when the key was made: a key older than a change to the person's
// sign-in address is refused as a deactivated person is, and the phone drops it, so a lost
// phone's key stops once the office changes the address. Clerk's token does not say how a
// session began, so the phone's word is what there is. The output is
// validated and narrowed: no identity subject, no deactivation state (a deactivated caller
// never reaches here). `update` writes the caller's `name` and
// `phone` and nothing else: email, role, company and identity are not in its input and are
// never self-written; an email changes through the identity provider's verified flow.
// `signInPhone` is the number the roster invited (users.ts): read here, written by no one
// through this router.
import { ROLES } from "../contract/enums";
import { addressChanges, users } from "@trader/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";

import { instant } from "../contract/instant";
import { protectedProcedure, router, unauthorized } from "../core/trpc";

const meOutput = z.strictObject({
  id: z.uuid(),
  companyId: z.uuid(),
  role: z.enum(ROLES),
  name: z.string(),
  // Null for a person invited by number alone; then `signInPhone` is never null.
  email: z.string().nullable(),
  phone: z.string().nullable(),
  signInPhone: z.string().nullable(),
});

// Contact data, typed by hand: trimmed, bounded, an empty phone stored as NULL.
const updateInput = z.strictObject({
  name: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .trim()
    .max(32)
    .nullable()
    .transform((p) => (p === "" ? null : p)),
});

// Null or absent: a sign-in by a code, Google or Apple, as a build that names no key sends it.
const getInput = z.strictObject({ keyMadeAt: instant }).nullish();

export const meRouter = router({
  get: protectedProcedure
    .input(getInput)
    .output(meOutput)
    .query(async ({ ctx, input }) => {
      if (input != null) {
        const [changed] = await ctx.tx
          .select({ id: addressChanges.id })
          .from(addressChanges)
          .where(
            and(
              eq(addressChanges.userId, ctx.user.id),
              gt(addressChanges.createdAt, input.keyMadeAt),
            ),
          )
          .limit(1);
        if (changed !== undefined) throw unauthorized();
      }
      return {
        id: ctx.user.id,
        companyId: ctx.user.companyId,
        role: ctx.user.role,
        name: ctx.user.name,
        email: ctx.user.email,
        phone: ctx.user.phone,
        signInPhone: ctx.user.signInPhone,
      };
    }),
  update: protectedProcedure
    .input(updateInput)
    .output(meOutput)
    .mutation(async ({ ctx, input }) => {
      // Own row, last writer wins; updated_at follows through the ORM.
      const [row] = await ctx.tx
        .update(users)
        .set({ name: input.name, phone: input.phone })
        .where(eq(users.id, ctx.user.id))
        .returning({ name: users.name, phone: users.phone });
      if (row === undefined) throw new Error("the caller's own row is not visible");
      return {
        id: ctx.user.id,
        companyId: ctx.user.companyId,
        role: ctx.user.role,
        name: row.name,
        email: ctx.user.email,
        phone: row.phone,
        signInPhone: ctx.user.signInPhone,
      };
    }),
});
