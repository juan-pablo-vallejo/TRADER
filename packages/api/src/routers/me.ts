// The signed-in caller's own record: the first consumer of the protected procedure. Takes no
// input, so nothing a client sends can name whose record it reads. The output is validated
// and narrowed: no identity subject, no deactivation state (a deactivated caller never
// reaches here).
import { userRole } from "@trader/db/schema";
import { z } from "zod";

import { protectedProcedure, router } from "../trpc";

const meOutput = z.strictObject({
  id: z.uuid(),
  companyId: z.uuid(),
  role: z.enum(userRole.enumValues),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
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
});
