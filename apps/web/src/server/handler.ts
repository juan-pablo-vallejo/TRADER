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
import { TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import {
  ask,
  type EdgeDependencies,
  guardRequest,
  IDENTITY_LIMIT,
  tooManyRequests,
} from "./edge";

export const ENDPOINT = "/api/trpc";
export const MAX_BATCH_SIZE = 10;

export type HandlerDependencies = {
  getDb: () => Db;
  identity: IdentityAdapter;
  directory: IdentityDirectory;
  // The mail service for invoice.send (mailer.ts). Absent, every send fails closed.
  mailer?: Mailer;
  reporter: ErrorReporter;
  // What stands in front of the route (edge.ts). Absent, nothing is limited: a test of
  // something else hands the handler no limiter.
  edge?: EdgeDependencies;
};

export function createTrpcHandler(deps: HandlerDependencies) {
  return async (req: Request): Promise<Response> => {
    // One id per HTTP request, made here and never read from a header: it exists before the
    // context does, so a request whose context cannot be built is still reported under it.
    const requestId = randomUUID();
    const { edge } = deps;
    if (edge !== undefined) {
      const refusal = await guardRequest(req, edge);
      if (refusal !== null) return refusal;
    }
    // The signed-in caller's own limit, asked once the adapter has said who is calling. The
    // context is built once for the whole request, so this is one hit a request.
    let limited: Parameters<typeof tooManyRequests>[0] | null = null;
    const response = await fetchRequestHandler({
      endpoint: ENDPOINT,
      router: appRouter,
      req,
      createContext: async ({ req }) => {
        const identity = await deps.identity.identify(req.headers);
        if (edge !== undefined && identity !== null) {
          const verdict = await ask(edge, IDENTITY_LIMIT, identity.subject);
          if (verdict?.limited) {
            limited = verdict;
            throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
          }
        }
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
    // One answer for a limited caller, whichever limit it was: 429 and how long to wait.
    return limited === null ? response : tooManyRequests(limited);
  };
}
