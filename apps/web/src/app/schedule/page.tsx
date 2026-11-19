import { signInPath } from "../../server/identity-mode";
import { ScheduleScreen } from "./schedule-screen";

// The Weekly Schedule: a dynamic server page rendering one client component,
// which calls the API through the route handler like the phone does.
export const dynamic = "force-dynamic";

export default function SchedulePage() {
  return <ScheduleScreen signInHref={signInPath(process.env)} />;
}
