export { appRouter, type AppRouter } from "./routers/_app";
export {
  createContext,
  PROVISIONAL_USER_NAME,
  type AppUser,
  type AuthIdentity,
  type Context,
} from "./context";
/**
 * The sync surface, re-exported for server-side callers.
 *
 * **Clients must import `@trader/api/sync` instead**, never this root. The root
 * re-exports `createContext`, which reaches `@trader/db` and therefore `pg` —
 * and Metro follows value imports, so a phone importing the fold from here pulls
 * a Postgres driver into the app bundle. See `src/sync/index.ts`.
 */
export * from "./sync/index";
export {
  adminProcedure,
  createCallerFactory,
  foremanProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "./trpc";
