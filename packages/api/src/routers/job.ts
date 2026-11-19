// Jobs. Admin only, at the gate; the customer and invoice rules
// and the target's visibility are judged inside each writer under its locks.
import { listJobs, listOutput } from "../jobs/list";
import {
  createInput,
  createJob,
  createOutput,
  setJobStatus,
  setStatusInput,
  setStatusOutput,
  updateInput,
  updateJob,
  updateOutput,
} from "../jobs/write";
import { roleProcedure, router } from "../core/trpc";

export const jobRouter = router({
  list: roleProcedure("admin")
    .output(listOutput)
    .query(({ ctx }) => listJobs(ctx.tx)),
  create: roleProcedure("admin")
    .input(createInput)
    .output(createOutput)
    .mutation(({ ctx, input }) => createJob(ctx.tx, ctx.user, input)),
  update: roleProcedure("admin")
    .input(updateInput)
    .output(updateOutput)
    .mutation(({ ctx, input }) => updateJob(ctx.tx, ctx.user, input)),
  setStatus: roleProcedure("admin")
    .input(setStatusInput)
    .output(setStatusOutput)
    .mutation(({ ctx, input }) => setJobStatus(ctx.tx, ctx.user, input)),
});
