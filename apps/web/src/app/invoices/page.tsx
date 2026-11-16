import { signInPath } from "../../server/identity-mode";
import { InvoicesScreen } from "./invoices-screen";

// Invoices (TASKS R6): a dynamic server page rendering one client component.
export const dynamic = "force-dynamic";

export default function InvoicesPage() {
  return <InvoicesScreen signInHref={signInPath(process.env)} />;
}
