// Clerk's request proxy (Next 16's name for middleware). It verifies the session token and
// leaves what it found for `auth()` in the route handler (server/identity.ts); on a page
// request it also renews an expired session by Clerk's own redirect. It protects no route:
// the API's gates are the only authority, 401 and 403 from packages/api, and a page without
// a session draws its own empty state. Where Clerk is not this server's identity — the
// development identity, or no keys, as in CI's build — it passes every request through
// untouched, so nothing of Clerk runs there. Read per request, never at module load.
import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import { clerkEnv } from "./server/clerk-env";
import { identityMode } from "./server/identity-mode";

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const env = clerkEnv(process.env);
  if (identityMode(process.env) !== "clerk" || env === null) return NextResponse.next();
  // Clerk reads its two keys from the environment itself: handed over as options here, the
  // secret key would have to be encrypted on its way to `auth()` under a third key.
  return clerkMiddleware({
    // The origins a session token may name as its issuer's party: a token minted for
    // another origin of the same domain is refused (Clerk, `authorizedParties`).
    ...(env.authorizedParties.length > 0 && { authorizedParties: env.authorizedParties }),
  })(request, event);
}

// Clerk's own matcher: every route but Next's internals and static files, and always the API.
export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
