import { assignmentRouter } from "./routers/assignment";
import { crewRouter } from "./routers/crew";
import { customerRouter } from "./routers/customer";
import { invoiceRouter } from "./routers/invoice";
import { jobRouter } from "./routers/job";
import { laborRouter } from "./routers/labor";
import { meRouter } from "./routers/me";
import { rosterRouter } from "./routers/roster";
import { statusRouter } from "./routers/status";
import { syncRouter } from "./routers/sync";
import { router } from "./core/trpc";

export const appRouter = router({
  assignment: assignmentRouter,
  crew: crewRouter,
  customer: customerRouter,
  invoice: invoiceRouter,
  job: jobRouter,
  labor: laborRouter,
  me: meRouter,
  roster: rosterRouter,
  status: statusRouter,
  sync: syncRouter,
});

// What both clients import, as a type only: a value import would pull server code into the
// mobile bundle, which the consistent-type-imports lint rule makes an error.
export type AppRouter = typeof appRouter;
