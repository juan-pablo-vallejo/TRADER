// Dated assignments (PRD, Jobs and location; V1-D07). The writers are admin only, at the
// gate: a foreman plans nobody, not even their own crew. What a plan may name is judged inside
// each writer; none of them reads crew membership.
import {
  createAssignments,
  createInput,
  createOutput,
  removeAssignment,
  removeInput,
  removeOutput,
  updateAssignment,
  updateInput,
  updateOutput,
} from "../assignments/write";
import { roleProcedure, router } from "../core/trpc";

export const assignmentRouter = router({
  create: roleProcedure("admin")
    .input(createInput)
    .output(createOutput)
    .mutation(({ ctx, input }) => createAssignments(ctx.tx, ctx.user, input)),
  update: roleProcedure("admin")
    .input(updateInput)
    .output(updateOutput)
    .mutation(({ ctx, input }) => updateAssignment(ctx.tx, ctx.user, input)),
  remove: roleProcedure("admin")
    .input(removeInput)
    .output(removeOutput)
    .mutation(({ ctx, input }) => removeAssignment(ctx.tx, ctx.user, input)),
});
