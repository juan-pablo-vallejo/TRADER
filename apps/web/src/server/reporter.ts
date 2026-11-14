// The error reporter of this server: the ErrorReporter seam's deployed implementation
// (ARCHITECTURE, error reporting; RULES, the three thin seams). Every report is written to
// stderr as before, which the platform's logs keep; where a Sentry address is configured
// the same minimized event is also sent there (sentry-event.ts). Sentry is one file's
// concern: swapping the vendor is this file and instrumentation.ts.
// Sending is deferred past the response and never awaited by the call it reports on (api
// core/report.ts); a failure to send is swallowed, since the stderr line already exists.
import { logReporter, type ErrorReport, type ErrorReporter } from "@trader/api";
import type { Event } from "@sentry/nextjs";

import { sentryDsn } from "./deploy-env";
import { toSentryEvent } from "./sentry-event";

const FLUSH_TIMEOUT_MS = 2_000;

export type ReporterDependencies = {
  // Whether a Sentry address is configured now; read per report, never at module load.
  configured: () => boolean;
  send: (event: Event) => Promise<void>;
  // Runs work after the response has been sent, keeping the function alive for it.
  defer: (work: () => Promise<void>) => void;
  log: ErrorReporter;
};

export function createWebReporter(deps: ReporterDependencies): ErrorReporter {
  return {
    report(event: ErrorReport): void {
      void deps.log.report(event);
      if (!deps.configured()) return;
      const outgoing = toSentryEvent(event);
      deps.defer(() => deps.send(outgoing).catch(() => undefined));
    },
  };
}

// The SDK is loaded where it is used: nothing of it is evaluated by a server with no
// address, by `next build`, or by a test that never sends.
async function send(event: Event): Promise<void> {
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureEvent(event);
  await Sentry.flush(FLUSH_TIMEOUT_MS);
}

// Next's after() holds a serverless function open until the work settles. It exists only
// inside a request; a report made outside one is sent at once and not waited for.
function defer(work: () => Promise<void>): void {
  void import("next/server")
    .then(({ after }) => after(work))
    .catch(() => work())
    .catch(() => undefined);
}

export const webReporter: ErrorReporter = createWebReporter({
  configured: () => sentryDsn(process.env) !== null,
  send,
  defer,
  log: logReporter,
});
