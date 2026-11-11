// The sync boundary (ARCHITECTURE, Sync protocol). `push` runs on the sync procedure: one
// caller transaction per record, never one for the call (sync/push.ts). `pull` is an ordinary
// protected query, open to every active role: it reads only the caller's own (sync/pull.ts).
import { pullInput, pullOutput, pullSnapshot } from "../sync/pull";
import { pushInput, pushOutput, pushRecords, reportRecordFailure } from "../sync/push";
import { protectedProcedure, router, syncProcedure } from "../core/trpc";

export const syncRouter = router({
  push: syncProcedure
    .input(pushInput)
    .output(pushOutput)
    .mutation(({ ctx, input }) =>
      pushRecords(input, ctx.runRecord, Date.now, reportRecordFailure(ctx.reporter)),
    ),
  pull: protectedProcedure
    .input(pullInput)
    .output(pullOutput)
    .query(({ ctx }) => pullSnapshot(ctx.tx, ctx.user)),
});
