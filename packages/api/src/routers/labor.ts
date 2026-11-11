// Office labor repairs (ARCHITECTURE row 187). Admin only, at the gate: the office client is
// online, so there is no device retry to keep open across a demotion (unlike material.correct).
import { repairInput, repairLabor, repairOutput } from "../labor/repair";
import { roleProcedure, router } from "../core/trpc";

export const laborRouter = router({
  repair: roleProcedure("admin")
    .input(repairInput)
    .output(repairOutput)
    .mutation(({ ctx, input }) => repairLabor(ctx.tx, ctx.user, input)),
});
