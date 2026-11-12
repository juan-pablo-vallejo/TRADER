import { devIdentityEnabled } from "@trader/api";

import { PayPeriodsScreen } from "./pay-periods-screen";

// Pay periods (TASKS, Stage 4): a dynamic server page rendering one client component, which
// calls the API through the route handler like the phone does.
export const dynamic = "force-dynamic";

export default function PayPeriodsPage() {
  return <PayPeriodsScreen devSignIn={devIdentityEnabled(process.env)} />;
}
