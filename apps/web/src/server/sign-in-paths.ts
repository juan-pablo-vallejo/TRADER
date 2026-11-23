// The two sign-in routes, by name. No imports: the browser's bundle reads these too, and
// nothing of the server may follow them there. Consumed by identity-mode.ts, the layout and
// the Clerk session components.
export const DEV_SIGN_IN_PATH = "/dev-signin";
export const SIGN_IN_PATH = "/sign-in";

// Where a signed-in person lands: the office's first screen. `/` is the public homepage.
export const OFFICE_HOME = "/today";

// The sign-in link for a person the office found signed out at `path` (its path and
// query): Clerk's form sends them back there once they are in, by its own `redirect_url`,
// which it reads ahead of the fallback (OFFICE_HOME). Only a path of this origin is kept:
// one leading slash, no backslash and no control character, so nothing a browser could
// read as another host; and never sign-in itself. Anything else is the plain link.
export function signInFrom(path: string): string {
  const printable = [...path].every((character) => {
    const code = character.charCodeAt(0);
    return code > 31 && code !== 127 && character !== "\\";
  });
  const here =
    /^\/(?!\/)/.test(path) &&
    printable &&
    !/^\/sign-in(?:[/?#]|$)/.test(path) &&
    path !== OFFICE_HOME;
  return here ? `${SIGN_IN_PATH}?redirect_url=${encodeURIComponent(path)}` : SIGN_IN_PATH;
}

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
