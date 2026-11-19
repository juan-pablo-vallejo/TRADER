import { notFound } from "next/navigation";

import { signInPath } from "../../../../server/identity-mode";
import { InvoiceScreen } from "./invoice-screen";

// One invoice. An address that names no id at all is the not-found screen;
// whether the id is an invoice the caller may read is the API's answer.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function InvoicePage(props: PageProps<"/invoices/[invoiceId]">) {
  const { invoiceId } = await props.params;
  if (!UUID.test(invoiceId)) notFound();
  return <InvoiceScreen invoiceId={invoiceId} signInHref={signInPath(process.env)} />;
}
