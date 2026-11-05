import { closeoutRouter } from "./routers/closeout";
import { meRouter } from "./routers/me";
import { router } from "./trpc";

export const appRouter = router({
  closeout: closeoutRouter,
  me: meRouter,
});

// What both clients import, as a type only: a value import would pull server code into the
// mobile bundle, which the consistent-type-imports lint rule makes an error.
export type AppRouter = typeof appRouter;
