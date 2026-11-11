// The signed-in caller's own record: the first consumer of the protected procedure. `get`
// takes no input, so nothing a client sends can name whose record it reads. The output is
// validated and narrowed: no identity subject, no deactivation state (a deactivated caller
// never reaches here). `update` (ARCHITECTURE, own profile) writes the caller's `name` and
// `phone` and nothing else: email, role, company and identity are not in its input and are
// never self-written; an email changes through the identity provider's verified flow.
import { userRole, users } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../core/trpc";

const meOutput = z.strictObject({
  id: z.uuid(),
  companyId: z.uuid(),
  role: z.enum(userRole.enumValues),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
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

export const meRouter = router({
  get: protectedProcedure.output(meOutput).query(({ ctx }) => ({
    id: ctx.user.id,
    companyId: ctx.user.companyId,
    role: ctx.user.role,
    name: ctx.user.name,
    email: ctx.user.email,
    phone: ctx.user.phone,
  })),
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
      };
    }),
});
