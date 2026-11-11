// Customers (PRD, Target users: the admin's). Admin only, at the gate; the target's visibility
// and the unarchived-jobs rule are judged inside each writer under its locks.
import { listCustomers, listOutput } from "../customers/list";
import {
  createCustomer,
  createInput,
  createOutput,
  deactivateCustomer,
  deactivateOutput,
  reactivateCustomer,
  reactivateOutput,
  targetInput,
  updateCustomer,
  updateInput,
  updateOutput,
} from "../customers/write";
import { roleProcedure, router } from "../core/trpc";

export const customerRouter = router({
  list: roleProcedure("admin")
    .output(listOutput)
    .query(({ ctx }) => listCustomers(ctx.tx)),
  create: roleProcedure("admin")
    .input(createInput)
    .output(createOutput)
    .mutation(({ ctx, input }) => createCustomer(ctx.tx, ctx.user, input)),
  update: roleProcedure("admin")
    .input(updateInput)
    .output(updateOutput)
    .mutation(({ ctx, input }) => updateCustomer(ctx.tx, ctx.user, input)),
  deactivate: roleProcedure("admin")
    .input(targetInput)
    .output(deactivateOutput)
    .mutation(({ ctx, input }) => deactivateCustomer(ctx.tx, ctx.user, input)),
  reactivate: roleProcedure("admin")
    .input(targetInput)
    .output(reactivateOutput)
    .mutation(({ ctx, input }) => reactivateCustomer(ctx.tx, ctx.user, input)),
});
