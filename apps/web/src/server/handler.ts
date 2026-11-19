// The tRPC route handler both clients call (ARCHITECTURE, apps/web): one request becomes one
// context through the identity adapter, each protected call then opens its own transaction
// (api trpc.ts). `onError` is the error-reporting seam, called by tRPC after a call has
// settled. Dependencies are passed in so tests hand it an unusable database or a recording
// reporter; route.ts wires the real ones.
import { randomUUID } from "node:crypto";

import {
  appRouter,
  createContext,
  reportingOnError,
  type ErrorReporter,
  type IdentityAdapter,
  type IdentityDirectory,
  type Mailer,
} from "@trader/api";
import type { Db } from "@trader/db";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { type EdgeDependencies, guardRequest } from "./edge";

export const ENDPOINT = "/api/trpc";
export const MAX_BATCH_SIZE = 10;

export type HandlerDependencies = {
  getDb: () => Db;
  identity: IdentityAdapter;
  directory: IdentityDirectory;
  // The mail service for invoice.send (mailer.ts). Absent, every send fails closed.
  mailer?: Mailer;
  reporter: ErrorReporter;
  // What stands in front of the route (edge.ts). Absent, nothing is refused there: a test
  // of something else hands the handler none.
  edge?: EdgeDependencies;
};

export function createTrpcHandler(deps: HandlerDependencies) {
  return async (req: Request): Promise<Response> => {
    // One id per HTTP request, made here and never read from a header: it exists before the
    // context does, so a request whose context cannot be built is still reported under it.
    const requestId = randomUUID();
    const { edge } = deps;
    if (edge !== undefined) {
      const refusal = guardRequest(req, edge);
      if (refusal !== null) return refusal;
    }
    return fetchRequestHandler({
      endpoint: ENDPOINT,
      router: appRouter,
      req,
      createContext: async ({ req }) => {
        const identity = await deps.identity.identify(req.headers);
        return createContext({
          db: deps.getDb(),
          identity,
          directory: deps.directory,
          ...(deps.mailer !== undefined && { mailer: deps.mailer }),
          reporter: deps.reporter,
          requestId,
        });
      },
      onError: reportingOnError(deps.reporter, requestId),
      // One request may carry several calls, each a transaction on a pooled connection; an
      // office screen batches a handful. Without a cap one request could ask for thousands.
      maxBatchSize: MAX_BATCH_SIZE,
      // Every answer is per caller or per deployment, and `status.get` is read by every
      // build before it syncs: nothing here may be served from a shared cache.
      responseMeta: () => ({ headers: { "cache-control": "no-store" } }),
    });
  };
}
