// One line per procedure call: where it went, how long it took and how many statements it
// sent (the meter, @trader/db meter.ts). Written by the base procedure every gate builds on
// (trpc.ts) to the context's observer; the route handler (apps/web server/handler.ts) logs it
// and, outside production, answers it as Server-Timing. It names no person and holds no
// input: a path, a code, numbers and the request's own random id. Sent to Sentry on staging
// alone, as one transaction per call without the request id (the owner's decision 4; apps/web
// server/call-trace.ts); never from production.
export type CallLine = {
  requestId: string;
  path: string;
  type: "query" | "mutation" | "subscription";
  // Wall time of the call, gate and transaction included, to a tenth of a millisecond.
  ms: number;
  statements: number;
  ok: boolean;
  // The tRPC code a failed call answered; null on success.
  code: string | null;
  // What the call refused as data (M4): each sync record answered `rejected`, by the
  // phone's own random id, its kind and the code. Empty for every other call.
  refusals: Refusal[];
};

export type Refusal = { recordId: string; kind: string | null; code: string };

export type CallObserver = (line: CallLine) => void;

// A host that names no observer: suites, scripts, the demo runner.
export const ignoreCalls: CallObserver = () => {};
