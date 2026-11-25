import { signInPath } from "../../../server/identity-mode";
import { InvoicesScreen } from "./invoices-screen";
import { titled } from "../../i18n/server";

// Invoices: a dynamic server page rendering one client component.
export const dynamic = "force-dynamic";

export const generateMetadata = () => titled((t) => t.nav.invoices);

export default function InvoicesPage() {
  return <InvoicesScreen signInHref={signInPath(process.env)} />;
}
