import { devIdentityEnabled } from "@trader/api";

import { LedgerScreen } from "./ledger-screen";

// The labor ledger (TASKS, Stage 4: worker ledger read): a dynamic server page rendering one
// client component, which calls the API through the route handler.
export const dynamic = "force-dynamic";

export default function LedgerPage() {
  return <LedgerScreen devSignIn={devIdentityEnabled(process.env)} />;
}
