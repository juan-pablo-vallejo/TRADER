// The roster. Admin only, at the gate; the last-admin rule
// and the target's visibility are judged inside each writer under its locks.
import {
  deactivate,
  reactivate,
  reactivateOutput,
  targetInput,
} from "../roster/deactivation";
import { isClosed } from "../core/demo-door";
import {
  invitationInput,
  noteInvitation,
  noteInvitationOutput,
  sendInvitation,
  sendInvitationOutput,
} from "../roster/invitation";
import { inviteInput, inviteOutput, rosterInvite } from "../roster/invite";
import { listOutput, rosterList } from "../roster/list";
import { setLocation, setLocationInput, setLocationOutput } from "../roster/location";
import { changeOutput, setRole, setRoleInput } from "../roster/role";
import { roleProcedure, router } from "../core/trpc";

export const rosterRouter = router({
  list: roleProcedure("admin")
    .output(listOutput)
    .query(({ ctx }) => rosterList(ctx.tx)),
  invite: roleProcedure("admin")
    .input(inviteInput)
    .output(inviteOutput)
    .mutation(({ ctx, input }) =>
      // The closed company invites nobody (core/demo-door.ts): refused before a row is
      // written or the identity provider is told of a number.
      isClosed(ctx.closed, ctx.user.companyId)
        ? ({ result: "rejected", code: "company_closed" } as const)
        : rosterInvite(ctx.tx, ctx.user, input, ctx.directory),
    ),
  // The closed company's invitations go to nobody, by email or by note: it invites nobody
  // (above), so there is nobody of its own to send to, and nothing is mailed or recorded.
  sendInvitation: roleProcedure("admin")
    .input(invitationInput)
    .output(sendInvitationOutput)
    .mutation(({ ctx, input }) =>
      isClosed(ctx.closed, ctx.user.companyId)
        ? ({ result: "rejected", code: "company_closed" } as const)
        : sendInvitation(ctx.tx, ctx.user, input, {
            mailer: ctx.mailer,
            getAppUrl: ctx.getAppUrl,
          }),
    ),
  noteInvitation: roleProcedure("admin")
    .input(invitationInput)
    .output(noteInvitationOutput)
    .mutation(({ ctx, input }) =>
      isClosed(ctx.closed, ctx.user.companyId)
        ? ({ result: "rejected", code: "company_closed" } as const)
        : noteInvitation(ctx.tx, ctx.user, input),
    ),
  setRole: roleProcedure("admin")
    .input(setRoleInput)
    .output(changeOutput)
    .mutation(({ ctx, input }) => setRole(ctx.tx, ctx.user, input)),
  setLocation: roleProcedure("admin")
    .input(setLocationInput)
    .output(setLocationOutput)
    .mutation(({ ctx, input }) => setLocation(ctx.tx, ctx.user, input)),
  deactivate: roleProcedure("admin")
    .input(targetInput)
    .output(changeOutput)
    .mutation(({ ctx, input }) => deactivate(ctx.tx, ctx.user, input)),
  reactivate: roleProcedure("admin")
    .input(targetInput)
    .output(reactivateOutput)
    .mutation(({ ctx, input }) => reactivate(ctx.tx, ctx.user, input)),
});
