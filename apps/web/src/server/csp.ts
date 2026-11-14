// The content security policy of a built app (ARCHITECTURE, Before the first deployment).
// One policy, built per request in proxy.ts with a fresh nonce: Next reads the nonce from the
// request's own Content-Security-Policy header and puts it on every script it renders, which
// it can do because every page here is rendered per request (layout.tsx).
// Nothing but this origin may run script, and only script carrying the nonce or loaded by
// script that does ('strict-dynamic'). The exceptions are Clerk's, taken from its page on
// CSP headers: its Frontend API host, its challenge and abuse-protection hosts, its image
// host, a blob worker, and inline styles, which its components write at run time.
// Pure, so the policy is tested as a string; the deployment proves it in a browser.

// Clerk encodes its Frontend API host in the publishable key: pk_test_ or pk_live_, then
// base64 of the host and a closing "$" (@clerk/shared, parsePublishableKey). Null for a key
// that does not decode to a host name: the policy then admits nothing of Clerk's.
export function clerkFrontendApi(publishableKey: string): string | null {
  const encoded = /^pk_(?:test|live)_(\S+)$/.exec(publishableKey)?.[1];
  if (encoded === undefined) return null;
  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return null;
  }
  const host = decoded.endsWith("$") ? decoded.slice(0, -1) : "";
  return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) && host.includes(".")
    ? host
    : null;
}

const CLERK_CHALLENGE = "https://challenges.cloudflare.com";
const CLERK_PROTECT = "https://*.protect.clerk.com";
const CLERK_IMAGES = "https://img.clerk.com";

// 128 bits from the platform's generator, base64: what a nonce is.
export function createNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

export function contentSecurityPolicy(options: {
  nonce: string;
  // Clerk's Frontend API host, or null where Clerk is not this server's identity.
  clerkFrontendApi: string | null;
}): string {
  const fapi =
    options.clerkFrontendApi === null ? [] : [`https://${options.clerkFrontendApi}`];
  const clerk = fapi.length > 0;
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    [
      "script-src",
      [
        "'self'",
        `'nonce-${options.nonce}'`,
        "'strict-dynamic'",
        ...fapi,
        ...(clerk ? [CLERK_CHALLENGE, CLERK_PROTECT] : []),
      ],
    ],
    // Clerk's components inject their styles at run time; ours are stylesheets.
    ["style-src", ["'self'", ...(clerk ? ["'unsafe-inline'"] : [])]],
    ["img-src", ["'self'", "data:", "blob:", ...(clerk ? [CLERK_IMAGES] : [])]],
    ["font-src", ["'self'"]],
    // The trailing :* is Clerk's: its protection hosts answer on other ports too.
    ["connect-src", ["'self'", ...fapi, ...(clerk ? [`${CLERK_PROTECT}:*`] : [])]],
    ["frame-src", clerk ? [CLERK_CHALLENGE, CLERK_PROTECT] : ["'none'"]],
    ["worker-src", ["'self'", ...(clerk ? ["blob:"] : [])]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}

// The header that carries the nonce from the proxy to the layout, as Next's guide names it.
export const NONCE_HEADER = "x-nonce";
export const CSP_HEADER = "Content-Security-Policy";
