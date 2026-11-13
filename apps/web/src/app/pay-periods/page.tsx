import { PayPeriodsScreen } from "./pay-periods-screen";
import { signInPath } from "../../server/identity-mode";

// Pay periods (TASKS, Stage 4): a dynamic server page rendering one client component, which
// calls the API through the route handler like the phone does.
export const dynamic = "force-dynamic";

export default function PayPeriodsPage() {
  return <PayPeriodsScreen signInHref={signInPath(process.env)} />;
}
