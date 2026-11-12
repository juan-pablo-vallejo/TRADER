// Pay periods: the calendar the office opens and corrects (pay-periods/periods.ts), one
// period's hours, adjustments and what is unresolved (read.ts), and the close (close.ts).
// Admin only, at the gate: payroll is the office's, and no device calls these.
import { closeInput, closeOutput, closePeriod } from "../pay-periods/close";
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
import { readInput, readOutput, readPeriod } from "../pay-periods/read";
import { roleProcedure, router } from "../core/trpc";

export const payPeriodRouter = router({
  close: roleProcedure("admin")
    .input(closeInput)
    .output(closeOutput)
    .mutation(({ ctx, input }) => closePeriod(ctx.tx, ctx.user, input)),
  list: roleProcedure("admin")
    .output(listOutput)
    .query(({ ctx }) => listPeriods(ctx.tx, ctx.user)),
  open: roleProcedure("admin")
    .input(openInput)
    .output(openOutput)
    .mutation(({ ctx, input }) => openPeriod(ctx.tx, ctx.user, input)),
  read: roleProcedure("admin")
    .input(readInput)
    .output(readOutput)
    .query(({ ctx, input }) => readPeriod(ctx.tx, ctx.user, input)),
  update: roleProcedure("admin")
    .input(updateInput)
    .output(updateOutput)
    .mutation(({ ctx, input }) => updatePeriod(ctx.tx, ctx.user, input)),
});
