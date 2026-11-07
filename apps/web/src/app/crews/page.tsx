import { devIdentityEnabled } from "@trader/api";

import { CrewsScreen } from "./crews-screen";

// Crews (TASKS, Stage 4): a dynamic server page rendering one client component, which calls
// the API through the route handler like the phone does.
export const dynamic = "force-dynamic";

export default function CrewsPage() {
  return <CrewsScreen devSignIn={devIdentityEnabled(process.env)} />;
}
