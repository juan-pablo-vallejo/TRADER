// The sync boundary (ARCHITECTURE, Sync protocol). `push` runs on the sync procedure: one
// caller transaction per record, never one for the call (sync/push.ts). `pull` is added by its
// own line's commit.
import { pushInput, pushOutput, pushRecords } from "../sync/push";
import { router, syncProcedure } from "../trpc";

export const syncRouter = router({
  push: syncProcedure
    .input(pushInput)
    .output(pushOutput)
    .mutation(({ ctx, input }) => pushRecords(input, ctx.runRecord)),
});
