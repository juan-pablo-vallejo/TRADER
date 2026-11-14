// What a server instance does once, before its first request, and what it does with an
// error Next caught outside the API (instrumentation.ts hands both here). Node only: this
// module reaches the database's and the API's validators and the Sentry SDK, none of which
// belongs in an edge bundle, so instrumentation.ts imports it inside its runtime check.
import type { Instrumentation } from "next";

import { assertDeployEnv, sentryDsn } from "./deploy-env";
import { sentryInitOptions } from "./sentry-event";

type Env = Record<string, string | undefined>;

const FLUSH_TIMEOUT_MS = 2_000;

export async function start(env: Env): Promise<void> {
  // A production server with a variable missing or malformed refuses to start
  // (deploy-env.ts); development and the tests start with whatever .env holds, as before.
  if (env.NODE_ENV === "production") {
    try {
      assertDeployEnv(env);
    } catch (error) {
      // Names only. Logged as well as thrown: a host may show the exit and not the reason.
      console.error((error as Error).message);
      throw error;
    }
  }
  // Wherever a Sentry address is configured, the SDK is initialised with the options that
  // keep it to the minimized event (sentry-event.ts). Loaded only then.
  const dsn = sentryDsn(env);
  if (dsn === null) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init(sentryInitOptions(dsn, env));
}

// An error thrown while rendering, or in a route outside tRPC, which the API's own
// reporter never sees. Its class and position are sent, never its message or the request
// (sentry-event.ts); Next has already logged it. Never throws.
export async function reportRequestError(
  env: Env,
  ...[error, request, context]: Parameters<Instrumentation.onRequestError>
): Promise<void> {
  try {
    if (sentryDsn(env) === null) return;
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureRequestError(error, request, context);
    await Sentry.flush(FLUSH_TIMEOUT_MS);
  } catch {
    // Reporting a failure must not become one.
  }
}
