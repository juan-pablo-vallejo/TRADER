import { signInPath } from "../../../server/identity-mode";
import { TodayScreen } from "./today-screen";

// Today, where the office opens: what needs attention, who is on the clock, and the money.
// A dynamic server page rendering one client component, which reads `overview.today`.
export const dynamic = "force-dynamic";

export default function TodayPage() {
  return <TodayScreen signInHref={signInPath(process.env)} />;
}
