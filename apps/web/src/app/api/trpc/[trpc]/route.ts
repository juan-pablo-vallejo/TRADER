// /api/trpc, the one HTTP entry point of the API (ARCHITECTURE, Web + API). On the Node
// runtime, because the pool and `pg` need it; dynamic, because every answer is per request.
import { logReporter } from "@trader/api";

import { getDb } from "../../../../server/db";
import { webDirectory } from "../../../../server/directory";
import { createTrpcHandler } from "../../../../server/handler";
import { webIdentity } from "../../../../server/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createTrpcHandler({
  getDb,
  identity: webIdentity,
  directory: webDirectory,
  reporter: logReporter,
});

export { handler as GET, handler as POST };
