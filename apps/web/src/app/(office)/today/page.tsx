import { signInPath } from "../../../server/identity-mode";
import { TodayScreen } from "./today-screen";
import { titled } from "../../i18n/server";

// Today, where the office opens: what needs attention, who is on the clock, and the money.
// A dynamic server page rendering one client component, which reads `overview.today`.
export const dynamic = "force-dynamic";

export const generateMetadata = () => titled((t) => t.nav.today);

export default function TodayPage() {
  return <TodayScreen signInHref={signInPath(process.env)} />;
}
