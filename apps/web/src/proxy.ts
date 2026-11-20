// The request proxy (Next 16's name for middleware). Three jobs, all per request and never
// at module load.
// The address's: a page asked for on a host no session can belong to, or `/` on a host
// that is not the homepage's, is sent where it belongs before anything else runs
// (server/addresses.ts).
// Clerk's: it verifies the session token and leaves what it found for `auth()` in the route
// handler (server/identity.ts); on a page request it also renews an expired session by
// Clerk's own redirect. It protects no route: the API's gates are the only authority, 401
// and 403 from packages/api, and a page without a session draws its own empty state. Where
// Clerk is not this server's identity — the development identity, or no keys, as in CI's
// build — nothing of Clerk runs. Nor does it for a public page (sign-in-paths.ts): a
// visitor to the homepage has no session to verify, and Clerk's check would send their
// browser to Clerk's host and back (seen on staging, 2026-11-19).
// The policy's: on a built app every response it passes carries the content security policy
// (server/csp.ts) with a nonce made for that request, handed to the page render on the
// request's headers, where Next looks for it. A development server gets none: it is never
// exposed, and its tooling evaluates script the policy would refuse.
import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import { addressFor } from "./server/addresses";
import { clerkEnv, partiesFor } from "./server/clerk-env";
import {
  clerkFrontendApi,
  contentSecurityPolicy,
  createNonce,
  CSP_HEADER,
  NONCE_HEADER,
} from "./server/csp";
import { identityMode } from "./server/identity-mode";
import { isPublicPath } from "./server/sign-in-paths";

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
  // The origins rule is Clerk's sessions' and holds only where Clerk is the identity: a
  // development machine's `.env` may list origins it does not answer on.
  const clerkIsIdentity = identityMode(process.env) === "clerk";
  const address = addressFor(
    clerkIsIdentity ? process.env : { ...process.env, CLERK_AUTHORIZED_PARTIES: "" },
    {
      host: request.headers.get("host"),
      pathname: request.nextUrl.pathname,
      search: request.nextUrl.search,
    },
  );
  if (address.kind === "redirect") {
    // 307: the same request, somewhere else, and nothing a browser should remember if the
    // hosts are changed.
    return NextResponse.redirect(new URL(address.to, request.nextUrl), 307);
  }
  const env = clerkEnv(process.env);
  if (!clerkIsIdentity || env === null) return pass(request, null);
  // A public page: the policy and its nonce, with no Clerk host in it, and no session read.
  if (isPublicPath(request.nextUrl.pathname)) return pass(request, null);
  // Clerk reads its two keys from the environment itself: handed over as options here, the
  // secret key would have to be encrypted on its way to `auth()` under a third key.
  // The origins a session token may name as its issuer's party: a token minted for another
  // origin of the same domain is refused (Clerk, `authorizedParties`). A token in the
  // `Authorization` header, the phone's, is verified without the list (clerk-env.ts).
  const listed = partiesFor(request.headers.get("authorization"), env.authorizedParties);
  return clerkMiddleware(() => pass(request, env.publishableKey), {
    ...(listed.length > 0 && { authorizedParties: listed }),
  })(request, event);
}

// Clerk's own matcher: every route but Next's internals and static files, and always the API.
export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
