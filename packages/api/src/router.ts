import { assignmentRouter } from "./routers/assignment";
import { companyRouter } from "./routers/company";
import { customerRouter } from "./routers/customer";
import { demoRouter } from "./routers/demo";
import { invoiceRouter } from "./routers/invoice";
import { jobRouter } from "./routers/job";
import { laborRouter } from "./routers/labor";
import { meRouter } from "./routers/me";
import { overviewRouter } from "./routers/overview";
import { rosterRouter } from "./routers/roster";
import { statusRouter } from "./routers/status";
import { syncRouter } from "./routers/sync";
import { router } from "./core/trpc";

export const appRouter = router({
  assignment: assignmentRouter,
  company: companyRouter,
  customer: customerRouter,
  demo: demoRouter,
  invoice: invoiceRouter,
  job: jobRouter,
  labor: laborRouter,
  me: meRouter,
  overview: overviewRouter,
  roster: rosterRouter,
  status: statusRouter,
  sync: syncRouter,
});

// What both clients import, as a type only: a value import would pull server code into the
// mobile bundle, which the consistent-type-imports lint rule makes an error.
export type AppRouter = typeof appRouter;
