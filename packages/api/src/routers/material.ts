// Material corrections (PRD, Day closeout). `correct` is the protected procedure, not a role
// gate: the admin-or-foreman rule is checked inside correctMaterial after the caller's own retry
// is answered, so a retry stays safe for its original submitter (materials/correct.ts, step 1).
import { correctionInput, correctionOutput, correctMaterial } from "../materials/correct";
import { protectedProcedure, router } from "../trpc";

export const materialRouter = router({
  correct: protectedProcedure
    .input(correctionInput)
    .output(correctionOutput)
    .mutation(({ ctx, input }) => correctMaterial(ctx.tx, ctx.user, input)),
});
