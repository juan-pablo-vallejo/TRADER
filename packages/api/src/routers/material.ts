// Materials. `correct` (PRD, Day closeout) is the protected procedure, not a role gate: the
// admin-or-foreman rule is checked inside correctMaterial after the caller's own retry is
// answered, so a retry stays safe for its original submitter (materials/correct.ts, step 1).
// `list` and `setCost` are the office's read of receipts and its entry of what each cost (PRD,
// Office review and job cost), admin only, at the gate: the office client is online, so there
// is no device retry to keep open, and a receipt's cost is nobody else's to read or state.
import { setCostInput, setCostOutput, setMaterialCost } from "../materials/cost";
import { correctionInput, correctionOutput, correctMaterial } from "../materials/correct";
import { listInput, listMaterials, listOutput } from "../materials/list";
import { protectedProcedure, roleProcedure, router } from "../core/trpc";

export const materialRouter = router({
  correct: protectedProcedure
    .input(correctionInput)
    .output(correctionOutput)
    .mutation(({ ctx, input }) => correctMaterial(ctx.tx, ctx.user, input)),
  list: roleProcedure("admin")
    .input(listInput)
    .output(listOutput)
    .query(({ ctx, input }) => listMaterials(ctx.tx, ctx.user, input)),
  setCost: roleProcedure("admin")
    .input(setCostInput)
    .output(setCostOutput)
    .mutation(({ ctx, input }) => setMaterialCost(ctx.tx, ctx.user, input)),
});
