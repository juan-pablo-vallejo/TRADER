// What stands in front of the API route (ARCHITECTURE, Edge protection; TASKS, edge
// protection for a public host): a body limit, an `Origin` check on state-changing requests,
// and a rate limit per address. Each refuses before the request reaches tRPC, an identity or
// a transaction. A second limit, per signed-in identity, is asked by the handler once it
// knows who is calling (`identityLimit`).
//
// The address is the platform's header: Vercel overwrites `x-forwarded-for` with the
// client's public address and forwards no client-supplied value (vercel.com/docs/headers/
// request-headers, read 2026-11-15), and `x-vercel-forwarded-for` is the same header kept
// from a proxy above. Where there is none — `next dev`, a test — nothing is counted by
// address: every local request would share one key, and no deployment is without the
// header. The address is never stored: the limiter hashes its key (api core/rate-limit.ts).
//
// An `Origin` a browser sends on a cross-site request names another site: a state-changing
// request that carries one is refused unless it is this deployment's own origin or one the
// deployment authorizes. A request with no `Origin` — the phone, a script — is not a
// browser's cross-site request and carries no ambient cookie of ours to abuse.
//
// The limiter failing is not the caller's fault and must not take the API down with it: the
// request goes on, and the failure is reported.
import type { RateLimit, RateVerdict } from "@trader/api";

// A sync push is the largest body: 100 records of a few hundred bytes. One mebibyte is ten
// times that and far under what the platform itself would accept.
export const MAX_BODY_BYTES = 1_048_576;

// Per address: an office behind one address with thirty phones and several browsers, each
// screen batching a handful of calls, stays far under ten a second sustained.
export const ADDRESS_LIMIT: RateLimit = {
  scope: "address",
  limit: 600,
  windowSeconds: 60,
};
// Per signed-in identity: one person, one phone and one browser.
export const IDENTITY_LIMIT: RateLimit = {
  scope: "identity",
  limit: 300,
  windowSeconds: 60,
};

export type Limiter = (rule: RateLimit, value: string) => Promise<RateVerdict>;

export type EdgeDependencies = {
  limiter: Limiter;
  // The origins this deployment answers browsers on, beside the request's own.
  authorizedOrigins: () => string[];
  onLimiterFailure: (error: unknown) => void;
};

const refuse = (status: number, message: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...headers,
    },
  });

export const tooManyRequests = (verdict: RateVerdict) =>
  refuse(429, "Too many requests.", { "retry-after": String(verdict.retryAfterSeconds) });

// Null where the platform set no address.
export function addressOf(headers: Headers): string | null {
  const forwarded =
    headers.get("x-vercel-forwarded-for") ?? headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first === undefined || first === "" ? null : first;
}

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

// The refusal for this request, or null when it may go on.
export async function guardRequest(
  req: Request,
  deps: EdgeDependencies,
): Promise<Response | null> {
  if (!SAFE.has(req.method)) {
    const length = req.headers.get("content-length");
    // A body of unstated size cannot be held to a limit before it is read.
    if (length === null) return refuse(411, "A request body states its length.");
    if (!/^\d+$/.test(length)) return refuse(400, "Malformed content-length.");
    if (Number(length) > MAX_BODY_BYTES)
      return refuse(413, "The request body is too large.");

    const origin = req.headers.get("origin");
    if (origin !== null) {
      const own = new Set([new URL(req.url).origin, ...deps.authorizedOrigins()]);
      if (!own.has(origin)) return refuse(403, "Not permitted.");
    }
  }
  const address = addressOf(req.headers);
  if (address === null) return null;
  const verdict = await ask(deps, ADDRESS_LIMIT, address);
  return verdict?.limited ? tooManyRequests(verdict) : null;
}

// One hit, or null when the limiter itself failed: reported, and the request goes on.
export async function ask(
  deps: Pick<EdgeDependencies, "limiter" | "onLimiterFailure">,
  rule: RateLimit,
  value: string,
): Promise<RateVerdict | null> {
  try {
    return await deps.limiter(rule, value);
  } catch (error) {
    deps.onLimiterFailure(error);
    return null;
  }
}

// `CLERK_AUTHORIZED_PARTIES` is the deployment's own list of the origins it answers on
// (deploy-env.ts): the same list tells a foreign `Origin` from one of ours.
export const originsFrom = (env: Record<string, string | undefined>) => (): string[] =>
  (env.CLERK_AUTHORIZED_PARTIES ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o !== "");
