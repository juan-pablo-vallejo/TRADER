// Office labor: the repair (ARCHITECTURE, 2026-11-05, office labor repairs) and the read it
// takes its event ids from (labor/ledger.ts). Admin only, at the gate: the office client is
// online, so there is no device retry to keep open across a demotion (unlike
// material.correct), and one worker's evidence is not a worker's or a foreman's to list.
import { ledgerInput, ledgerOutput, workerLedger } from "../labor/ledger";
import { repairInput, repairLabor, repairOutput } from "../labor/repair";
import { roleProcedure, router } from "../core/trpc";

export const laborRouter = router({
  ledger: roleProcedure("admin")
    .input(ledgerInput)
    .output(ledgerOutput)
    .query(({ ctx, input }) => workerLedger(ctx.tx, input)),
  repair: roleProcedure("admin")
    .input(repairInput)
    .output(repairOutput)
    .mutation(({ ctx, input }) => repairLabor(ctx.tx, ctx.user, input)),
});
