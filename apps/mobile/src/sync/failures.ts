// Which failed sync calls are worth a report, and the rule that one failure is reported
// once and not every minute. The cycle runs on a timer, so a server that answers 500 would
// otherwise send the same report for as long as it does.
//
// No connection is not a failure to report: it is the phone's ordinary day, and the outbox
// exists for it. Neither is a refused session, which the app answers by asking the person
// to sign in again. Everything else is: the API answered and the answer was an error, or
// something answered that was not the API. Pure; consumed by sync/provider.tsx.
export type Stage = "status" | "push" | "pull";

type Shaped = {
  name?: unknown;
  data?: { code?: unknown; httpStatus?: unknown } | null;
  meta?: { response?: { status?: unknown } | null } | null;
};

// A short name for how a call failed, or null when it is not to be reported. Never the
// error's message: that can quote what was sent.
export function failureKind(error: unknown): string | null {
  const e = (typeof error === "object" && error !== null ? error : {}) as Shaped;
  const code = e.data?.code;
  if (typeof code === "string" && /^[A-Z_]{1,60}$/.test(code)) {
    return code === "UNAUTHORIZED" ? null : `trpc_${code}`;
  }
  const status = e.meta?.response?.status;
  if (typeof status === "number" && Number.isInteger(status)) {
    return status === 401 ? null : `http_${status}`;
  }
  // tRPC's client wraps a fetch that never got an answer in its own error, with no
  // response beside it: the network, an aborted call, a host that was not there.
  if (e.name === "TRPCClientError" || e.name === "TypeError" || e.name === "AbortError") {
    return null;
  }
  // Anything else was thrown by the app's own code on the way: a bug, and worth a report.
  return typeof e.name === "string" && /^[A-Za-z]{1,60}$/.test(e.name)
    ? `thrown_${e.name}`
    : "thrown";
}

// One report per stage and kind until a whole cycle goes through; then the slate is clean,
// and the same failure coming back later is news again.
export function createFailureLog(
  report: (stage: Stage, kind: string, error: unknown) => void,
) {
  const said = new Set<string>();
  return {
    note(stage: Stage, error: unknown): void {
      const kind = failureKind(error);
      if (kind === null) return;
      const key = `${stage} ${kind}`;
      if (said.has(key)) return;
      said.add(key);
      report(stage, kind, error);
    },
    cleared(): void {
      said.clear();
    },
  };
}
