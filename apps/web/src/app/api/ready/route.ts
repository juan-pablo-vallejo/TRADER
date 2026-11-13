// /api/ready: whether this deployment can serve (server/ready.ts). A plain route, not a
// procedure: no client reads it, so it is no part of the API's contract or its gate
// inventory. On the Node runtime for the pool; dynamic, since the answer is of this moment.
import { getDb } from "../../../server/db";
import { createReadyHandler } from "../../../server/ready";
import { webReporter } from "../../../server/reporter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createReadyHandler({ getDb, reporter: webReporter, env: process.env });
