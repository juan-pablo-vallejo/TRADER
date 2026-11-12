import { approvalRouter } from "./routers/approval";
import { assignmentRouter } from "./routers/assignment";
import { closeoutRouter } from "./routers/closeout";
import { crewRouter } from "./routers/crew";
import { customerRouter } from "./routers/customer";
import { diagnosticRouter } from "./routers/diagnostic";
import { jobRouter } from "./routers/job";
import { laborRouter } from "./routers/labor";
import { materialRouter } from "./routers/material";
import { meRouter } from "./routers/me";
import { rosterRouter } from "./routers/roster";
import { statusRouter } from "./routers/status";
import { syncRouter } from "./routers/sync";
import { router } from "./core/trpc";

export const appRouter = router({
  approval: approvalRouter,
  assignment: assignmentRouter,
  closeout: closeoutRouter,
  crew: crewRouter,
  customer: customerRouter,
  diagnostic: diagnosticRouter,
  job: jobRouter,
  labor: laborRouter,
  material: materialRouter,
  me: meRouter,
  roster: rosterRouter,
  status: statusRouter,
  sync: syncRouter,
});

// What both clients import, as a type only: a value import would pull server code into the
// mobile bundle, which the consistent-type-imports lint rule makes an error.
export type AppRouter = typeof appRouter;
