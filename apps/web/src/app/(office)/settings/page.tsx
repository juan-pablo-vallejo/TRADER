import { signInPath } from "../../../server/identity-mode";
import { SettingsScreen } from "./settings-screen";
import { titled } from "../../i18n/server";

// Settings, behind the person's name: the company's details, the time clock's two
// switches, and the person's own record. A dynamic server page rendering one client
// component, which reads and writes through the route handler.
export const dynamic = "force-dynamic";

export const generateMetadata = () => titled((t) => t.settings.title);

export default function SettingsPage() {
  return <SettingsScreen signInHref={signInPath(process.env)} />;
}
