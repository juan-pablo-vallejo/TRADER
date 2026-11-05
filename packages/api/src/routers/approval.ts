// The approval queue (PRD, Office approval). Admin only, at the gate: nothing here has an
// own-record retry to keep open, unlike material.correct.
import { decideApproval, decideInput, decideOutput } from "../approvals/decide";
import { approvalQueue, queueInput, queueOutput } from "../approvals/queue";
import { roleProcedure, router } from "../trpc";

export const approvalRouter = router({
  queue: roleProcedure("admin")
    .input(queueInput)
    .output(queueOutput)
    .query(({ ctx, input }) => approvalQueue(ctx.tx, ctx.user, input)),
  decide: roleProcedure("admin")
    .input(decideInput)
    .output(decideOutput)
    .mutation(({ ctx, input }) => decideApproval(ctx.tx, ctx.user, input)),
});
