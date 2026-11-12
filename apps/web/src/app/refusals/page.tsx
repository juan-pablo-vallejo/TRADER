import { devIdentityEnabled } from "@trader/api";

import { RefusalsScreen } from "./refusals-screen";

// Refused entries (TASKS, Stage 4: rejected-record diagnostics): a dynamic server page
// rendering one client component, which calls the API through the route handler.
export const dynamic = "force-dynamic";

export default function RefusalsPage() {
  return <RefusalsScreen devSignIn={devIdentityEnabled(process.env)} />;
}
