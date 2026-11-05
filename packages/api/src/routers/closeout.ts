// The day closeout (PRD, Day closeout). The protected procedure, not a role gate: the
// foreman-only rule is checked inside submitCloseout after the caller's own retry is answered,
// so a retry stays safe for its original submitter (closeout/submit.ts, step 1).
import { closeoutInput, closeoutOutput, submitCloseout } from "../closeout/submit";
import { protectedProcedure, router } from "../trpc";

export const closeoutRouter = router({
  submit: protectedProcedure
    .input(closeoutInput)
    .output(closeoutOutput)
    .mutation(({ ctx, input }) => submitCloseout(ctx.tx, ctx.user, input)),
});
