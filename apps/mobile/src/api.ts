// The API client: tRPC over HTTP to the same route the office
// calls. The router is imported as a type alone — a value import would bundle the server
// into the app, and lint refuses it; what the phone needs as values comes from
// `@trader/api/contract`.
import type { AppRouter } from "@trader/api";
import { DEV_EMAIL_HEADER, DEV_SUBJECT_HEADER } from "@trader/api/contract";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

// The development identity's headers for an email, as the office's development sign-in
// derives them: the subject is `dev:` and the address.
export const devHeaders = (email: string): Record<string, string> => ({
  [DEV_SUBJECT_HEADER]: `dev:${email}`,
  [DEV_EMAIL_HEADER]: email,
});

export function createApi(
  url: string,
  headers: () => Record<string, string> | Promise<Record<string, string>>,
) {
  return createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: `${url}/api/trpc`, transformer: superjson, headers })],
  });
}

export type Api = ReturnType<typeof createApi>;
