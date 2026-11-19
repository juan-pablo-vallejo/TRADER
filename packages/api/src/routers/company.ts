// The company's own settings. Admin only, at the gate: a worker learns what concerns them
// from the pull (sync/pull.ts) and nothing here.
import { company, readCompany, updateCompany, updateInput } from "../company/settings";
import { roleProcedure, router } from "../core/trpc";

export const companyRouter = router({
  get: roleProcedure("admin")
    .output(company)
    .query(({ ctx }) => readCompany(ctx.tx, ctx.user)),
  update: roleProcedure("admin")
    .input(updateInput)
    .output(company)
    .mutation(({ ctx, input }) => updateCompany(ctx.tx, ctx.user, input)),
});
