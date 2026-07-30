import { appRouter, createContext } from "@trader/api";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { identityFromRequest } from "@/server/auth";

/**
 * The single HTTP entry point for both clients (SPEC §1: one API, one deploy
 * target). Mobile and web call this same handler.
 */
function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async () => createContext({ auth: await identityFromRequest() }),
  });
}

export { handler as GET, handler as POST };

/**
 * Provisioning writes to Postgres on first sign-in, so this route can never be
 * statically evaluated at build time.
 */
export const dynamic = "force-dynamic";
