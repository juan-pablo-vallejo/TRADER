// The company's today, for the Crew tab and the office. Admin only, at the gate: a worker
// sees their own day in the pull and nobody else's anywhere.
import { roleProcedure, router } from "../core/trpc";
import { overviewToday, todayOutput } from "../overview/today";

export const overviewRouter = router({
  today: roleProcedure("admin")
    .output(todayOutput)
    .query(({ ctx }) => overviewToday(ctx.tx, ctx.user)),
});
