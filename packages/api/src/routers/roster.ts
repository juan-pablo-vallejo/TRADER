// The roster (PRD, Target users: the admin's). Admin only, at the gate; the last-admin rule
// and the target's visibility are judged inside each writer under its locks.
import {
  deactivate,
  reactivate,
  reactivateOutput,
  targetInput,
} from "../roster/deactivation";
import { inviteInput, inviteOutput, rosterInvite } from "../roster/invite";
import { listOutput, rosterList } from "../roster/list";
import {
  listPayRates,
  payRatesInput,
  payRatesOutput,
  setPayRate,
  setPayRateInput,
  setPayRateOutput,
} from "../roster/pay-rates";
import { changeOutput, setRole, setRoleInput } from "../roster/role";
import { roleProcedure, router } from "../trpc";

export const rosterRouter = router({
  list: roleProcedure("admin")
    .output(listOutput)
    .query(({ ctx }) => rosterList(ctx.tx)),
  invite: roleProcedure("admin")
    .input(inviteInput)
    .output(inviteOutput)
    .mutation(({ ctx, input }) => rosterInvite(ctx.tx, ctx.user, input)),
  setRole: roleProcedure("admin")
    .input(setRoleInput)
    .output(changeOutput)
    .mutation(({ ctx, input }) => setRole(ctx.tx, ctx.user, input)),
  deactivate: roleProcedure("admin")
    .input(targetInput)
    .output(changeOutput)
    .mutation(({ ctx, input }) => deactivate(ctx.tx, ctx.user, input)),
  reactivate: roleProcedure("admin")
    .input(targetInput)
    .output(reactivateOutput)
    .mutation(({ ctx, input }) => reactivate(ctx.tx, ctx.user, input)),
  setPayRate: roleProcedure("admin")
    .input(setPayRateInput)
    .output(setPayRateOutput)
    .mutation(({ ctx, input }) => setPayRate(ctx.tx, ctx.user, input)),
  payRates: roleProcedure("admin")
    .input(payRatesInput)
    .output(payRatesOutput)
    .query(({ ctx, input }) => listPayRates(ctx.tx, input.userId)),
});
