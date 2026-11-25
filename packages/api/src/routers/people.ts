// The roster. Admin only, at the gate; the last-admin rule
// and the target's visibility are judged inside each writer under its locks.
import {
  deactivate,
  reactivate,
  reactivateOutput,
  targetInput,
} from "../people/deactivation";
import { isClosed } from "../core/demo-door";
import {
  invitationInput,
  noteInvitation,
  noteInvitationOutput,
  sendInvitation,
  sendInvitationOutput,
} from "../people/invitation";
import {
  addressOutput,
  peopleSetEmail,
  peopleSetSignInPhone,
  setEmailInput,
  setSignInPhoneInput,
} from "../people/address";
import { inviteInput, inviteOutput, peopleInvite } from "../people/invite";
import { listOutput, peopleList } from "../people/list";
import {
  setLocationStamps,
  setLocationStampsInput,
  setLocationStampsOutput,
} from "../people/location";
import { changeOutput, setRole, setRoleInput } from "../people/role";
import { roleProcedure, router } from "../core/trpc";

export const peopleRouter = router({
  list: roleProcedure("admin")
    .output(listOutput)
    .query(({ ctx }) => peopleList(ctx.tx)),
  invite: roleProcedure("admin")
    .input(inviteInput)
    .output(inviteOutput)
    .mutation(({ ctx, input }) =>
      // The closed company invites nobody (core/demo-door.ts): refused before a row is
      // written or the identity provider is told of a number.
      isClosed(ctx.closed, ctx.user.companyId)
        ? ({ result: "rejected", code: "company_closed" } as const)
        : peopleInvite(ctx.tx, ctx.user, input, ctx.directory),
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
  // The closed company's people keep the addresses they have: whoever holds a new one could
  // sign in as them, and it reaches nobody outside.
  setEmail: roleProcedure("admin")
    .input(setEmailInput)
    .output(addressOutput)
    .mutation(({ ctx, input }) =>
      isClosed(ctx.closed, ctx.user.companyId)
        ? ({ result: "rejected", code: "company_closed" } as const)
        : peopleSetEmail(ctx.tx, ctx.user, input, ctx.directory),
    ),
  setSignInPhone: roleProcedure("admin")
    .input(setSignInPhoneInput)
    .output(addressOutput)
    .mutation(({ ctx, input }) =>
      isClosed(ctx.closed, ctx.user.companyId)
        ? ({ result: "rejected", code: "company_closed" } as const)
        : peopleSetSignInPhone(ctx.tx, ctx.user, input, ctx.directory),
    ),
  setRole: roleProcedure("admin")
    .input(setRoleInput)
    .output(changeOutput)
    .mutation(({ ctx, input }) => setRole(ctx.tx, ctx.user, input)),
  setLocationStamps: roleProcedure("admin")
    .input(setLocationStampsInput)
    .output(setLocationStampsOutput)
    .mutation(({ ctx, input }) => setLocationStamps(ctx.tx, ctx.user, input)),
  deactivate: roleProcedure("admin")
    .input(targetInput)
    .output(changeOutput)
    .mutation(({ ctx, input }) => deactivate(ctx.tx, ctx.user, input)),
  reactivate: roleProcedure("admin")
    .input(targetInput)
    .output(reactivateOutput)
    .mutation(({ ctx, input }) => reactivate(ctx.tx, ctx.user, input)),
});
