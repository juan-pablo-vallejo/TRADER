import { approvalRouter } from "./routers/approval";
import { closeoutRouter } from "./routers/closeout";
import { laborRouter } from "./routers/labor";
import { materialRouter } from "./routers/material";
import { meRouter } from "./routers/me";
import { syncRouter } from "./routers/sync";
import { router } from "./trpc";

export const appRouter = router({
  approval: approvalRouter,
  closeout: closeoutRouter,
  labor: laborRouter,
  material: materialRouter,
  me: meRouter,
  sync: syncRouter,
});

// What both clients import, as a type only: a value import would pull server code into the
// mobile bundle, which the consistent-type-imports lint rule makes an error.
export type AppRouter = typeof appRouter;
