import { devIdentityEnabled } from "@trader/api";

import { ReconciliationScreen } from "./reconciliation-screen";

// Reconciliation (TASKS, Stage 4): a dynamic server page rendering one client component,
// which calls the API through the route handler like the phone does.
export const dynamic = "force-dynamic";

export default function ReconciliationPage() {
  return <ReconciliationScreen devSignIn={devIdentityEnabled(process.env)} />;
}
