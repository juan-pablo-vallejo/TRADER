// The kill switch (ARCHITECTURE, kill switch): public, so a build that cannot sign in — before
// login, an expired session, a forced update — still learns what to do. It reads no identity and
// queries no database, so it answers while Postgres is down or cold. The environment is read per
// request; a deployed value changes only with a new deployment. Consumed by router.ts.
import { reportConfigFault } from "../report";
import { createConfigLatch, serviceStatus, statusInput, statusOutput } from "../status";
import { SYNC_PROTOCOL } from "../sync/protocol";
import { publicProcedure, router } from "../trpc";

const reportOnce = createConfigLatch();

export const statusRouter = router({
  get: publicProcedure
    .input(statusInput)
    .output(statusOutput)
    .query(({ ctx, input }) => {
      const { state, invalid } = serviceStatus(process.env, input, SYNC_PROTOCOL);
      if (reportOnce(invalid)) reportConfigFault(ctx.reporter, invalid);
      return { version: 1 as const, state };
    }),
});
