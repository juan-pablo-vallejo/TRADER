import { router } from "../trpc";
import { meRouter } from "./me";

export const appRouter = router({
  me: meRouter,
});

/**
 * The contract both clients import — **as a type only**.
 *
 * Importing it as a value would pull server code into the mobile bundle; the
 * `consistent-type-imports` lint rule makes that a build error rather than a
 * runtime surprise. A signature change here breaks compilation on web and
 * mobile, which is the entire reason for choosing tRPC.
 */
export type AppRouter = typeof appRouter;
