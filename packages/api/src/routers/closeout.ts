// The day closeout (PRD, Day closeout). `submit` is the protected procedure, not a role gate:
// the foreman-only rule is checked inside submitCloseout after the caller's own retry is
// answered, so a retry stays safe for its original submitter (closeout/submit.ts, step 1).
// `review` has no retry to answer, so it takes the foreman gate (ARCHITECTURE row 176) and
// scopes the job inside (closeout/review.ts).
import { reviewDay, reviewInput, reviewOutput } from "../closeout/review";
import { closeoutInput, closeoutOutput, submitCloseout } from "../closeout/submit";
import { protectedProcedure, roleProcedure, router } from "../core/trpc";

export const closeoutRouter = router({
  review: roleProcedure("foreman")
    .input(reviewInput)
    .output(reviewOutput)
    .query(({ ctx, input }) => reviewDay(ctx.tx, ctx.user, input)),
  submit: protectedProcedure
    .input(closeoutInput)
    .output(closeoutOutput)
    .mutation(({ ctx, input }) => submitCloseout(ctx.tx, ctx.user, input)),
});
