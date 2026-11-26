// The signed-in caller's own record: the first consumer of the protected procedure. Nothing
// `get` takes can name whose record it reads. A phone that signed in by its Face ID or
// fingerprint key says when the key was made: a key older than a change to the person's
// sign-in address is refused as a deactivated person is, and the phone drops it, so a lost
// phone's key stops once the office changes the address. Clerk's token does not say how a
// session began, so the phone's word is what there is. The output is
// validated and narrowed: no identity subject, no deactivation state (a deactivated caller
// never reaches here). `update` writes the caller's `name` and
// `phone` and nothing else: email, role, company and identity are not in its input and are
// never self-written. A worker's name is the office's: `update` refuses a worker, whose Me
// shows the name and both addresses greyed. `sendEmailCode` and `addEmail` let a person
// whose login has no email add one, proved by a code mailed to it (me/add-email.ts).
// `signInPhone` is the number the office invited (users.ts): read here, written by no one
// through this router.
import { ROLES } from "../contract/enums";
import { addressChanges, users } from "@trader/db/schema";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { z } from "zod";

import { instant } from "../contract/instant";
import { CLOCK_SKEW_TOLERANCE_MS } from "../contract/limits";
import { forbidden, protectedProcedure, router, unauthorized } from "../core/trpc";
import {
  addEmail,
  addEmailInput,
  addEmailOutput,
  sendEmailCode,
  sendEmailCodeInput,
  sendEmailCodeOutput,
} from "../me/add-email";

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
        // The key's date is the phone's clock: one later than this server's, past the
        // tolerance a clock is allowed, says nothing, and is taken as the oldest.
        const ahead = input.keyMadeAt.getTime() > Date.now() + CLOCK_SKEW_TOLERANCE_MS;
        const keyMadeAt = ahead ? new Date(0) : input.keyMadeAt;
        const [changed] = await ctx.tx
          .select({ id: addressChanges.id })
          .from(addressChanges)
          .where(
            and(
              eq(addressChanges.userId, ctx.user.id),
              // An email the person added themselves leaves their own key standing.
              ne(addressChanges.changedByUserId, ctx.user.id),
              gt(addressChanges.createdAt, keyMadeAt),
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
      // A worker's name and addresses are the office's to change.
      if (ctx.user.role !== "admin") throw forbidden();
      // Own row, last writer wins; updated_at follows through the ORM. The write itself
      // re-checks the role and the person as it takes the row: an admin made a worker, or
      // deactivated, meanwhile writes nothing.
      const [row] = await ctx.tx
        .update(users)
        .set({ name: input.name, phone: input.phone })
        .where(
          and(
            eq(users.id, ctx.user.id),
            eq(users.role, "admin"),
            isNull(users.deactivatedAt),
          ),
        )
        .returning({ name: users.name, phone: users.phone });
      if (row === undefined) throw forbidden();
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
  sendEmailCode: protectedProcedure
    .input(sendEmailCodeInput)
    .output(sendEmailCodeOutput)
    .mutation(({ ctx, input }) => sendEmailCode(ctx.tx, ctx.user, input, ctx)),
  addEmail: protectedProcedure
    .input(addEmailInput)
    .output(addEmailOutput)
    .mutation(({ ctx, input }) => addEmail(ctx.tx, ctx.user, input, ctx)),
});
