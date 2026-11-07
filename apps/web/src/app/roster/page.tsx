import { devIdentityEnabled } from "@trader/api";

import { RosterScreen } from "./roster-screen";

// The roster (TASKS, Stage 4): a dynamic server page rendering one client component, which
// calls the API through the route handler like the phone does.
export const dynamic = "force-dynamic";

export default function RosterPage() {
  return <RosterScreen devSignIn={devIdentityEnabled(process.env)} />;
}
