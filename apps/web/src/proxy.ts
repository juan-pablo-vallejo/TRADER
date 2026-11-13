// The request proxy (Next 16's name for middleware). Two jobs, both per request and never at
// module load.
// Clerk's: it verifies the session token and leaves what it found for `auth()` in the route
// handler (server/identity.ts); on a page request it also renews an expired session by
// Clerk's own redirect. It protects no route: the API's gates are the only authority, 401
// and 403 from packages/api, and a page without a session draws its own empty state. Where
// Clerk is not this server's identity — the development identity, or no keys, as in CI's
// build — nothing of Clerk runs.
// The policy's: on a built app every response it passes carries the content security policy
// (server/csp.ts) with a nonce made for that request, handed to the page render on the
// request's headers, where Next looks for it. A development server gets none: it is never
// exposed, and its tooling evaluates script the policy would refuse.
import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import { clerkEnv } from "./server/clerk-env";
import {
  clerkFrontendApi,
  contentSecurityPolicy,
  createNonce,
  CSP_HEADER,
  NONCE_HEADER,
} from "./server/csp";
import { identityMode } from "./server/identity-mode";

function pass(request: NextRequest, publishableKey: string | null): NextResponse {
  if (process.env.NODE_ENV !== "production") return NextResponse.next();
  const nonce = createNonce();
  const policy = contentSecurityPolicy({
    nonce,
    clerkFrontendApi: publishableKey === null ? null : clerkFrontendApi(publishableKey),
  });
  // A client's own x-nonce or policy never reaches the render: both are overwritten.
  const headers = new Headers(request.headers);
  headers.set(NONCE_HEADER, nonce);
  headers.set(CSP_HEADER, policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(CSP_HEADER, policy);
  return response;
}

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const env = clerkEnv(process.env);
  if (identityMode(process.env) !== "clerk" || env === null) return pass(request, null);
  // Clerk reads its two keys from the environment itself: handed over as options here, the
  // secret key would have to be encrypted on its way to `auth()` under a third key.
  return clerkMiddleware(() => pass(request, env.publishableKey), {
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
