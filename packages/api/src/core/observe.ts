// One line per procedure call: where it went, how long it took and how many statements it
// sent (the meter, @trader/db meter.ts). Written by the base procedure every gate builds on
// (trpc.ts) to the context's observer; the route handler (apps/web server/handler.ts) logs it
// and, outside production, answers it as Server-Timing. It names no person and holds no
// input: a path, a code, numbers and the request's own random id. Never sent to Sentry.
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
};

export type CallObserver = (line: CallLine) => void;

// A host that names no observer: suites, scripts, the demo runner.
export const ignoreCalls: CallObserver = () => {};
