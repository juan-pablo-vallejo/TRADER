// The two sign-in routes, by name. No imports: the browser's bundle reads these too, and
// nothing of the server may follow them there.
export const DEV_SIGN_IN_PATH = "/dev-signin";
export const SIGN_IN_PATH = "/sign-in";

// Where a signed-in person lands: the office's first screen. `/` is the public homepage.
export const OFFICE_HOME = "/today";

// A place in the office a person can be sent back to after signing in: a path of this
// origin and nothing else. One leading slash, no backslash and no control character, so
// nothing a browser could read as another host; and never sign-in itself.
const isReturnPath = (path: string): boolean =>
  /^\/(?!\/)/.test(path) &&
  [...path].every((character) => {
    const code = character.charCodeAt(0);
    return code > 31 && code !== 127 && character !== "\\";
  }) &&
  !/^\/sign-in(?:[/?#]|$)/.test(path);

// The sign-in link for a person the office found signed out at `path` (its path and
// query): the sign-in page reads it back (`returnPath`) and sends them there once they are
// in. Today needs no saying, and anything that is not a path here is the plain link.
export function signInFrom(path: string): string {
  return isReturnPath(path) && path !== OFFICE_HOME
    ? `${SIGN_IN_PATH}?redirect_url=${encodeURIComponent(path)}`
    : SIGN_IN_PATH;
}

// Where the sign-in page sends a person once they are in: the `redirect_url` its address
// carries, if that is a path of this origin, else Today. The value is whatever a link
// said, so it is held to the same rule as the link that wrote it.
export function returnPath(redirectUrl: string | string[] | undefined): string {
  return typeof redirectUrl === "string" && isReturnPath(redirectUrl)
    ? redirectUrl
    : OFFICE_HOME;
}

// Where the browser comes back to from Google when the sign-in was not finished there
// (sign-in/sso-callback/page.tsx), carrying where the person was going; and the sign-in
// page as it is shown to someone whose Google account no roster holds.
export const SSO_CALLBACK_PATH = "/sign-in/sso-callback";
const carrying = (path: string, returnTo: string, more = ""): string => {
  const query = [
    more,
    isReturnPath(returnTo) && returnTo !== OFFICE_HOME
      ? `redirect_url=${encodeURIComponent(returnTo)}`
      : "",
  ].filter((part) => part !== "");
  return query.length === 0 ? path : `${path}?${query.join("&")}`;
};
export const ssoCallbackFrom = (returnTo: string): string =>
  carrying(SSO_CALLBACK_PATH, returnTo);
// Why a Google return came back to the form: an account Clerk knows nobody by, or a
// return that failed some other way, said as a failure and never as "not on a roster".
export const GOOGLE_REFUSED = "google";
export const GOOGLE_FAILED = "google-failed";
export const signInRefused = (returnTo: string, unknown = true): string =>
  carrying(SIGN_IN_PATH, returnTo, `refused=${unknown ? GOOGLE_REFUSED : GOOGLE_FAILED}`);

// The way back to the homepage from sign-in. Where a deployment names the host whose `/`
// is the homepage (TRADER_HOME_HOST, server/addresses.ts), that host: on any other, `/`
// goes to the office, and the link would only come back here. Where it names none, `/`.
export function homeHref(env: Record<string, string | undefined>): string {
  const host = (env.TRADER_HOME_HOST ?? "").trim().toLowerCase().replace(/\.$/, "");
  const label = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?";
  return new RegExp(`^${label}(?:\\.${label})+$`).test(host) ? `https://${host}/` : "/";
}

// The public pages, the `(public)` layout's: anyone may read them and nothing of Clerk
// runs for them, not even in the proxy, whose session check on a development instance
// sends the browser to Clerk's own host and back. Exact addresses: nothing beneath them.
export const PUBLIC_PATHS = ["/", "/get", "/privacy", "/terms"] as const;
export const isPublicPath = (pathname: string): boolean =>
  (PUBLIC_PATHS as readonly string[]).includes(
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname,
  );
