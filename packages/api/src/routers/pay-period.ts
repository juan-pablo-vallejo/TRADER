// Pay periods (pay-periods/periods.ts): the calendar the office opens and corrects. Admin
// only, at the gate: payroll is the office's, and no device calls these.
import {
  listOutput,
  listPeriods,
  openInput,
  openOutput,
  openPeriod,
  updateInput,
  updateOutput,
  updatePeriod,
} from "../pay-periods/periods";
import { roleProcedure, router } from "../core/trpc";

export const payPeriodRouter = router({
  list: roleProcedure("admin")
    .output(listOutput)
    .query(({ ctx }) => listPeriods(ctx.tx, ctx.user)),
  open: roleProcedure("admin")
    .input(openInput)
    .output(openOutput)
    .mutation(({ ctx, input }) => openPeriod(ctx.tx, ctx.user, input)),
  update: roleProcedure("admin")
    .input(updateInput)
    .output(updateOutput)
    .mutation(({ ctx, input }) => updatePeriod(ctx.tx, ctx.user, input)),
});
