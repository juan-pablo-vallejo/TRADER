// The API client: tRPC over HTTP to the same route the office
// calls. The router is imported as a type alone — a value import would bundle the server
// into the app, and lint refuses it; what the phone needs as values comes from
// `@trader/api/contract`.
import type { AppRouter } from "@trader/api";
import {
  DEV_EMAIL_HEADER,
  DEV_PHONE_HEADER,
  DEV_SUBJECT_HEADER,
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

export function createApi(
  url: string,
  headers: () => Record<string, string> | Promise<Record<string, string>>,
) {
  return createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: `${url}/api/trpc`, transformer: superjson, headers })],
  });
}

export type Api = ReturnType<typeof createApi>;
