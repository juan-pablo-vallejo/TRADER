// Rejected-record diagnostics, read by the office (ARCHITECTURE, Sync protocol; V1-D04). Admin
// only, at the gate: a line names a worker and what the server refused of theirs, and neither
// a worker nor a foreman may list them. The lines are written by the sync procedure
// (core/trpc.ts), never by a call here.
import { roleProcedure, router } from "../core/trpc";
import { listDiagnostics, listInput, listOutput } from "../sync/diagnostics";

export const diagnosticRouter = router({
  list: roleProcedure("admin")
    .input(listInput)
    .output(listOutput)
    .query(({ ctx, input }) => listDiagnostics(ctx.tx, input)),
});
