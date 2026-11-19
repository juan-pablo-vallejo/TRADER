// What stands in front of the API route: a body limit and an `Origin` check on
// state-changing requests. Each refuses before the request reaches tRPC, an identity or a
// transaction. Request rates are limited by one rule in Vercel's firewall on `/api`, set in
// the dashboard; nothing here counts requests.
//
// An `Origin` a browser sends on a cross-site request names another site: a state-changing
// request that carries one is refused unless it is this deployment's own origin or one the
// deployment authorizes. A request with no `Origin` (the phone, a script) is not a
// browser's cross-site request and carries no ambient cookie of ours to abuse.

// A sync push is the largest body: 100 records of a few hundred bytes. One mebibyte is ten
// times that and far under what the platform itself would accept.
export const MAX_BODY_BYTES = 1_048_576;

export type EdgeDependencies = {
  // The origins this deployment answers browsers on, beside the request's own.
  authorizedOrigins: () => string[];
};

const refuse = (status: number, message: string) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

// The refusal for this request, or null when it may go on.
export function guardRequest(req: Request, deps: EdgeDependencies): Response | null {
  if (SAFE.has(req.method)) return null;
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
  return null;
}

// `CLERK_AUTHORIZED_PARTIES` is the deployment's own list of the origins it answers on
// (deploy-env.ts): the same list tells a foreign `Origin` from one of ours.
export const originsFrom = (env: Record<string, string | undefined>) => (): string[] =>
  (env.CLERK_AUTHORIZED_PARTIES ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o !== "");
