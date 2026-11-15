// The weekly schedule (PRD, Weekly schedule; V1-D07). The writers and the office reads are
// admin only, at the gate: a foreman schedules nobody, not even their own crew. What a shift
// may name is judged inside each writer; none of them reads crew membership. `mine` admits
// any active user and takes no person: it answers with the caller's own shifts.
import {
  listAssignments,
  listInput,
  listOutput,
  mineInput,
  mineOutput,
  ownAssignments,
  weekAssignments,
  weekInput,
  weekOutput,
} from "../assignments/list";
import {
  createAssignments,
  createInput,
  createOutput,
  decideInput,
  decideOutput,
  decideOverride,
  removeAssignment,
  removeInput,
  removeOutput,
  updateAssignment,
  updateInput,
  updateOutput,
} from "../assignments/write";
import { protectedProcedure, roleProcedure, router } from "../core/trpc";

export const assignmentRouter = router({
  list: roleProcedure("admin")
    .input(listInput)
    .output(listOutput)
    .query(({ ctx, input }) => listAssignments(ctx.tx, input)),
  week: roleProcedure("admin")
    .input(weekInput)
    .output(weekOutput)
    .query(({ ctx, input }) => weekAssignments(ctx.tx, input)),
  mine: protectedProcedure
    .input(mineInput)
    .output(mineOutput)
    .query(({ ctx, input }) => ownAssignments(ctx.tx, ctx.user, input)),
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
  decide: roleProcedure("admin")
    .input(decideInput)
    .output(decideOutput)
    .mutation(({ ctx, input }) => decideOverride(ctx.tx, ctx.user, input)),
});
