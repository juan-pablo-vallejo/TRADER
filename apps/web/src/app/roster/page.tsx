import { RosterScreen } from "./roster-screen";
import { signInPath } from "../../server/identity-mode";

// The roster (TASKS, Stage 4): a dynamic server page rendering one client component, which
// calls the API through the route handler like the phone does.
export const dynamic = "force-dynamic";

export default function RosterPage() {
  return <RosterScreen signInHref={signInPath(process.env)} />;
}
