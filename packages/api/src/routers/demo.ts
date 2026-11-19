// The Demo sign-in (core/demo-door.ts). Public: it is how someone with no session gets
// one. It answers a ticket or one refusal, and writes nothing.
import { demoSignIn, demoSignInInput, demoSignInOutput } from "../core/demo-door";
import { reportFailure } from "../core/report";
import { publicProcedure, router } from "../core/trpc";

export const demoRouter = router({
  signIn: publicProcedure
    .input(demoSignInInput)
    .output(demoSignInOutput)
    .mutation(({ ctx, input }) =>
      demoSignIn(ctx.db, ctx.demo, input, (error) =>
        reportFailure(ctx.reporter, error, {
          source: "request",
          path: "demo.signIn",
          type: "mutation",
          requestId: ctx.requestId,
        }),
      ),
    ),
});
