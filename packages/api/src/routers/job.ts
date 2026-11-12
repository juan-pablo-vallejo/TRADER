// Jobs (PRD, Jobs and location). Admin only, at the gate; the customer, crew and invoice rules
// and the target's visibility are judged inside each writer under its locks. `cost` is the
// office's read of what a job has cost to date (jobs/cost.ts): rates and receipt costs are
// nobody else's to read.
import { costInput, costOutput, jobCost } from "../jobs/cost";
import { listJobs, listOutput } from "../jobs/list";
import {
  assignInput,
  assignJob,
  assignOutput,
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
  cost: roleProcedure("admin")
    .input(costInput)
    .output(costOutput)
    .query(({ ctx, input }) => jobCost(ctx.tx, ctx.user, input)),
  create: roleProcedure("admin")
    .input(createInput)
    .output(createOutput)
    .mutation(({ ctx, input }) => createJob(ctx.tx, ctx.user, input)),
  update: roleProcedure("admin")
    .input(updateInput)
    .output(updateOutput)
    .mutation(({ ctx, input }) => updateJob(ctx.tx, ctx.user, input)),
  assign: roleProcedure("admin")
    .input(assignInput)
    .output(assignOutput)
    .mutation(({ ctx, input }) => assignJob(ctx.tx, ctx.user, input)),
  setStatus: roleProcedure("admin")
    .input(setStatusInput)
    .output(setStatusOutput)
    .mutation(({ ctx, input }) => setJobStatus(ctx.tx, ctx.user, input)),
});
