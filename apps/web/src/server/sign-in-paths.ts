// The two sign-in routes, by name. No imports: the browser's bundle reads these too, and
// nothing of the server may follow them there. Consumed by identity-mode.ts, the layout and
// the Clerk session components.
export const DEV_SIGN_IN_PATH = "/dev-signin";
export const SIGN_IN_PATH = "/sign-in";

// Where a signed-in person lands: the office's first screen. `/` is the public homepage.
export const OFFICE_HOME = "/today";

// The public pages, the `(public)` layout's: anyone may read them and nothing of Clerk
// runs for them, not even in the proxy, whose session check on a development instance
// sends the browser to Clerk's own host and back. Exact addresses: nothing beneath them.
export const PUBLIC_PATHS = ["/", "/get", "/privacy", "/terms"] as const;
export const isPublicPath = (pathname: string): boolean =>
  (PUBLIC_PATHS as readonly string[]).includes(
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname,
  );
