export { createContext, type Context } from "./core/context";
export {
  createDevIdentityAdapter,
  DEV_EMAIL_HEADER,
  DEV_PHONE_HEADER,
  DEV_SUBJECT_HEADER,
  devIdentityEnabled,
} from "./core/dev-identity";
export {
  signInEmailSchema,
  signInPhoneSchema,
  verifiedIdentitySchema,
  type IdentityAdapter,
  type VerifiedIdentity,
} from "./core/identity";
export {
  logReporter,
  reportingOnError,
  type ErrorReport,
  type ErrorReporter,
} from "./core/report";
export type { AppUser } from "./core/resolve-user";
export { appRouter, type AppRouter } from "./router";
export { STATES, type ServiceState, type StatusClient } from "./core/status";
export {
  createCallerFactory,
  protectedProcedure,
  publicProcedure,
  roleProcedure,
  router,
  syncProcedure,
} from "./core/trpc";
