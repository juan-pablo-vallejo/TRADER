// The tRPC route handler both clients call: one request becomes one
// context through the identity adapter, each protected call then opens its own transaction
// (api trpc.ts). `onError` is the error-reporting seam, called by tRPC after a call has
// settled. Dependencies are passed in so tests hand it an unusable database or a recording
// reporter; route.ts wires the real ones.
import { randomUUID } from "node:crypto";

import {
  appRouter,
  createContext,
  type CallLine,
  reportingOnError,
  type ClosedCompany,
  type DemoDoor,
  type ErrorReporter,
  type IdentityAdapter,
  type IdentityDirectory,
  type Mailer,
} from "@trader/api";
import type { Db } from "@trader/db";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { type EdgeDependencies, guardRequest } from "./edge";
import { MAX_BATCH_CALLS } from "@trader/api/contract";

export const ENDPOINT = "/api/trpc";
export const MAX_BATCH_SIZE = MAX_BATCH_CALLS;

type HandlerDependencies = {
  getDb: () => Db;
  identity: IdentityAdapter;
  directory: IdentityDirectory;
  // The mail service for invoice.send and people.sendInvitation (mailer.ts). Absent, every
  // send fails closed.
  mailer?: Mailer;
  // The one code an added email is proved by, read per request (me/add-email.ts): the
  // development identity's, where nothing is mailed. Absent or null: a mailed random code.
  emailCode?: () => string | null;
  // Where the app is got from on this host (addresses.ts), read per request. Absent or
  // null, no invitation is emailed.
  getAppUrl?: () => string | null;
  // The Demo sign-in's door (clerk-demo.ts), read per request. Absent, there is no door.
  demo?: () => DemoDoor | null;
  // The company that reaches nobody outside, read per request. Absent, there is none.
  closed?: () => ClosedCompany | null;
  reporter: ErrorReporter;
  // What stands in front of the route (edge.ts). Absent, nothing is refused there: a test
  // of something else hands the handler none.
  edge?: EdgeDependencies;
  // Where each call's timing line goes (api core/observe.ts). Absent, one JSON line on
  // stdout, which the platform's logs keep.
  logCall?: (line: CallLine) => void;
  // Whether a response also carries its calls as Server-Timing and its request id as
  // x-request-id, read per request. Absent, never: production answers neither.
  // The statement count tells a sign-in that found an invitation from one that did not,
  // which the single UNAUTHORIZED otherwise hides: one reason production answers neither.
  timingHeaders?: () => boolean;
};

// The call's line, then one line per record it refused, each under the call's request
// id, so a refusal is found by searching for `trader_refusal` alone.
// The lines are written as records are answered: a call that then fails before any record
// ran (a deactivated caller) has logged refusals it never answered.
export const logToStdout = (line: CallLine): void => {
  const { refusals, ...call } = line;
  console.log(JSON.stringify({ trader_call: { ...call, refused: refusals.length } }));
  for (const refusal of refusals) {
    console.log(
      JSON.stringify({
        trader_refusal: { requestId: call.requestId, path: call.path, ...refusal },
      }),
    );
  }
};

// One Server-Timing entry per call. A path is a router's dotted name (letters and dots,
// core/report.ts's PATH), so it needs no escaping inside the quoted description.
const serverTiming = (calls: readonly CallLine[]): string =>
  calls
    .map((c) => `call;desc="${c.path}, ${c.statements} statements";dur=${c.ms}`)
    .join(", ");

export function createTrpcHandler(deps: HandlerDependencies) {
  return async (req: Request): Promise<Response> => {
    // One id per HTTP request, made here and never read from a header: it exists before the
    // context does, so a request whose context cannot be built is still reported under it.
    const requestId = randomUUID();
    if (deps.edge !== undefined) {
      const refusal = guardRequest(req, deps.edge);
      if (refusal !== null) return refusal;
    }
    const logCall = deps.logCall ?? logToStdout;
    const calls: CallLine[] = [];
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
          ...(deps.emailCode !== undefined && { emailCode: deps.emailCode() }),
          ...(deps.getAppUrl !== undefined && { getAppUrl: deps.getAppUrl() }),
          ...(deps.demo !== undefined && { demo: deps.demo() }),
          ...(deps.closed !== undefined && { closed: deps.closed() }),
          reporter: deps.reporter,
          requestId,
          observe: (line) => {
            calls.push(line);
            logCall(line);
          },
        });
      },
      onError: reportingOnError(deps.reporter, requestId),
      // One request may carry several calls, each a transaction on a pooled connection; an
      // office screen batches a handful. Without a cap one request could ask for thousands.
      maxBatchSize: MAX_BATCH_SIZE,
      // Every answer is per caller or per deployment, and `status.get` is read by every
      // build before it syncs: nothing here may be served from a shared cache.
      // The batch link waits for every call before it answers, so `calls` is whole here.
      responseMeta: () => ({
        headers: {
          "cache-control": "no-store",
          ...(deps.timingHeaders?.() === true && {
            "x-request-id": requestId,
            ...(calls.length > 0 && { "server-timing": serverTiming(calls) }),
          }),
        },
      }),
    });
  };
}
