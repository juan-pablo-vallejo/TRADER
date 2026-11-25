import { CustomersScreen } from "./customers-screen";
import { signInPath } from "../../../server/identity-mode";
import { titled } from "../../i18n/server";

// Customers: a dynamic server page rendering one client component, which
// calls the API through the route handler like the phone does.
export const dynamic = "force-dynamic";

export const generateMetadata = () => titled((t) => t.nav.customers);

export default function CustomersPage() {
  return <CustomersScreen signInHref={signInPath(process.env)} />;
}
