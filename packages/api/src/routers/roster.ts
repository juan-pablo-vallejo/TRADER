// The roster (PRD, Target users: the admin's). Admin only, at the gate; the last-admin rule
// and the target's visibility are judged inside each writer under its locks.
import { inviteInput, inviteOutput, rosterInvite } from "../roster/invite";
import { listOutput, rosterList } from "../roster/list";
import { roleProcedure, router } from "../trpc";

export const rosterRouter = router({
  list: roleProcedure("admin")
    .output(listOutput)
    .query(({ ctx }) => rosterList(ctx.tx)),
  invite: roleProcedure("admin")
    .input(inviteInput)
    .output(inviteOutput)
    .mutation(({ ctx, input }) => rosterInvite(ctx.tx, ctx.user, input)),
});
