// Which address a page is served at. Pure: the environment and the request in, a decision
// out; the proxy carries it out before anything is rendered.
//
// One deployment answers on more than one host. In production: `app.jpteq.app`, neutral,
// and `dsierrapainting.jpteq.app`, D'Sierra's own. Two rules, in this order.
//
// 1. A session belongs to an origin. Where CLERK_AUTHORIZED_PARTIES lists the origins a
//    session may be issued to, a page asked for on any other host (a Vercel deployment's
//    own address, an old domain) is sent to the same path on the first of them, so the
//    office is never drawn under an address no session can belong to. Where the list is
//    empty, as on a development machine, every host is served.
// 2. TRADER_HOME_HOST names the host whose `/` is the homepage. On that host everything
//    else answers as it does anywhere: sign-in, the office, the public pages. On any other
//    host `/` goes to the office. Blank, as on staging and a development machine, `/` is
//    the homepage wherever it is asked for.
//
// Pages only. The API answers on whatever host reached it: the phone and the deploy job's
// readiness check name a host of their own, and a redirect would break both.
import { homeHref, OFFICE_HOME } from "./sign-in-paths";

type Env = Record<string, string | undefined>;

export type Address =
  | { kind: "serve" }
  // An absolute URL (another host) or a path (this host).
  | { kind: "redirect"; to: string };

const SERVE: Address = { kind: "serve" };

// A host as two requests for the same site spell it: no case, no trailing dot.
const sameHost = (a: string, b: string) =>
  a.trim().toLowerCase().replace(/\.$/, "") === b.trim().toLowerCase().replace(/\.$/, "");

// The origins of CLERK_AUTHORIZED_PARTIES that are origins, in the order written.
export function listedOrigins(env: Env): URL[] {
  return (env.CLERK_AUTHORIZED_PARTIES ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .flatMap((part) => {
      try {
        const url = new URL(part);
        return url.origin === part.replace(/\/$/, "") ? [url] : [];
      } catch {
        return [];
      }
    });
}

// Where the app is got from, as an emailed invitation links to it: `/get` on the host
// whose `/` is the homepage, else on the first origin a session may be issued to. From the
// deployment's own configuration and nothing of a request, since TRADER mails it under its
// own name. Null where a server names neither, as a development machine: nothing is mailed
// from there.
export function getAppUrl(env: Env): string | null {
  const home = homeHref(env);
  if (home !== "/") return `${home}get`;
  const first = listedOrigins(env)[0];
  return first === undefined ? null : `${first.origin}/get`;
}

const isApiPath = (pathname: string): boolean =>
  pathname === "/api" || pathname.startsWith("/api/") || pathname.startsWith("/trpc");

export function addressFor(
  env: Env,
  request: { host: string | null; pathname: string; search: string },
): Address {
  const { host, pathname, search } = request;
  if (host === null || host.trim() === "" || isApiPath(pathname)) return SERVE;

  const origins = listedOrigins(env);
  const first = origins[0];
  if (first !== undefined && !origins.some((origin) => sameHost(origin.host, host))) {
    return { kind: "redirect", to: `${first.origin}${pathname}${search}` };
  }

  const home = (env.TRADER_HOME_HOST ?? "").trim();
  if (home !== "" && pathname === "/" && !sameHost(home, host)) {
    return { kind: "redirect", to: OFFICE_HOME };
  }
  return SERVE;
}
