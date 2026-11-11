// The tRPC route handler both clients call (ARCHITECTURE, apps/web): one request becomes one
// context through the identity adapter, each protected call then opens its own transaction
// (api trpc.ts). `onError` is the error-reporting seam, called by tRPC after a call has
// settled. Dependencies are passed in so tests hand it an unusable database or a recording
// reporter; route.ts wires the real ones.
import {
  appRouter,
  createContext,
  reportingOnError,
  type ErrorReporter,
  type IdentityAdapter,
} from "@trader/api";
import type { Db } from "@trader/db";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

export const ENDPOINT = "/api/trpc";
export const MAX_BATCH_SIZE = 10;

export type HandlerDependencies = {
  getDb: () => Db;
  identity: IdentityAdapter;
  reporter: ErrorReporter;
};

export function createTrpcHandler(deps: HandlerDependencies) {
  return (req: Request): Promise<Response> =>
    fetchRequestHandler({
      endpoint: ENDPOINT,
      router: appRouter,
      req,
      createContext: async ({ req }) =>
        createContext({
          db: deps.getDb(),
          identity: await deps.identity.identify(req.headers),
          reporter: deps.reporter,
        }),
      onError: reportingOnError(deps.reporter),
      // One request may carry several calls, each a transaction on a pooled connection; an
      // office screen batches a handful. Without a cap one request could ask for thousands.
      maxBatchSize: MAX_BATCH_SIZE,
      // Every answer is per caller or per deployment, and `status.get` is read by every
      // build before it syncs: nothing here may be served from a shared cache.
      responseMeta: () => ({ headers: { "cache-control": "no-store" } }),
    });
}
