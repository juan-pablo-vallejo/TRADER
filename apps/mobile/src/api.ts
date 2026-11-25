// The API client: tRPC over HTTP to the same route the office
// calls. The router is imported as a type alone — a value import would bundle the server
// into the app, and lint refuses it; what the phone needs as values comes from
// `@trader/api/contract`.
import type { AppRouter } from "@trader/api";
import {
  CALL_DEADLINE_MS,
  DEV_EMAIL_HEADER,
  DEV_PHONE_HEADER,
  DEV_SUBJECT_HEADER,
  MAX_BATCH_CALLS,
} from "@trader/api/contract";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

// Who the development identity says is signing in: an email or a sign-in number.
export type DevWho = { email: string } | { phone: string };

// The development identity's headers, as the office's development sign-in derives them for
// an email: the subject is `dev:` and the address. A number is the same, as its own
// subject: a demo person is bound to their email's, so only a person no login holds yet is
// found by number (the Maestro suite invites one by number alone).
export const devHeaders = (who: DevWho): Record<string, string> =>
  "email" in who
    ? { [DEV_SUBJECT_HEADER]: `dev:${who.email}`, [DEV_EMAIL_HEADER]: who.email }
    : { [DEV_SUBJECT_HEADER]: `dev:${who.phone}`, [DEV_PHONE_HEADER]: who.phone };

// Every request is given up at the contract's deadline, as the engine gives up each call
// (sync/engine.ts); this one also frees the socket. The server answers at most the contract's
// MAX_BATCH_CALLS calls in one request; a larger batch would be refused whole.
export const REQUEST_TIMEOUT_MS = CALL_DEADLINE_MS;
export const MAX_BATCH_ITEMS = MAX_BATCH_CALLS;

// A fetch that aborts at the deadline, or sooner when its caller aborts. A controller and
// a timer, not AbortSignal.timeout or .any, which a phone's JavaScript engine may lack.
export const timedFetch =
  (base: typeof fetch = fetch, ms: number = REQUEST_TIMEOUT_MS): typeof fetch =>
  (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    const caller = init?.signal;
    if (caller != null) {
      if (caller.aborted) controller.abort();
      else caller.addEventListener("abort", () => controller.abort());
    }
    return base(input, { ...init, signal: controller.signal }).finally(() =>
      clearTimeout(timer),
    );
  };

export function createApi(
  url: string,
  headers: () => Record<string, string> | Promise<Record<string, string>>,
  base: typeof fetch = fetch,
) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${url}/api/trpc`,
        transformer: superjson,
        headers,
        maxItems: MAX_BATCH_ITEMS,
        fetch: timedFetch(base),
      }),
    ],
  });
}

export type Api = ReturnType<typeof createApi>;
