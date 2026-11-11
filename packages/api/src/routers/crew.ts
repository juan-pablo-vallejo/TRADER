// Crews and membership (PRD, Jobs and location). Admin only, at the gate; the foreman rule, the
// member rule and the target's visibility are judged inside each writer under the crew row lock.
import { listCrews, listOutput } from "../crews/list";
import {
  addMember,
  addMemberOutput,
  memberInput,
  removeMember,
  removeMemberOutput,
} from "../crews/members";
import {
  createCrew,
  createInput,
  createOutput,
  deactivateCrew,
  deactivateOutput,
  reactivateCrew,
  reactivateOutput,
  setForeman,
  setForemanInput,
  setForemanOutput,
  targetInput,
  updateCrew,
  updateInput,
  updateOutput,
} from "../crews/write";
import { roleProcedure, router } from "../core/trpc";

export const crewRouter = router({
  list: roleProcedure("admin")
    .output(listOutput)
    .query(({ ctx }) => listCrews(ctx.tx)),
  create: roleProcedure("admin")
    .input(createInput)
    .output(createOutput)
    .mutation(({ ctx, input }) => createCrew(ctx.tx, ctx.user, input)),
  update: roleProcedure("admin")
    .input(updateInput)
    .output(updateOutput)
    .mutation(({ ctx, input }) => updateCrew(ctx.tx, ctx.user, input)),
  setForeman: roleProcedure("admin")
    .input(setForemanInput)
    .output(setForemanOutput)
    .mutation(({ ctx, input }) => setForeman(ctx.tx, ctx.user, input)),
  addMember: roleProcedure("admin")
    .input(memberInput)
    .output(addMemberOutput)
    .mutation(({ ctx, input }) => addMember(ctx.tx, ctx.user, input)),
  removeMember: roleProcedure("admin")
    .input(memberInput)
    .output(removeMemberOutput)
    .mutation(({ ctx, input }) => removeMember(ctx.tx, ctx.user, input)),
  deactivate: roleProcedure("admin")
    .input(targetInput)
    .output(deactivateOutput)
    .mutation(({ ctx, input }) => deactivateCrew(ctx.tx, ctx.user, input)),
  reactivate: roleProcedure("admin")
    .input(targetInput)
    .output(reactivateOutput)
    .mutation(({ ctx, input }) => reactivateCrew(ctx.tx, ctx.user, input)),
});
