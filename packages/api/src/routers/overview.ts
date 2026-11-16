// The office overview (DESIGN, Overview): admin only, one read, nothing written.
import { roleProcedure, router } from "../core/trpc";
import { overview, overviewOutput } from "../overview/get";

export const overviewRouter = router({
  get: roleProcedure("admin")
    .output(overviewOutput)
    .query(({ ctx }) => overview(ctx.tx, ctx.user)),
});
