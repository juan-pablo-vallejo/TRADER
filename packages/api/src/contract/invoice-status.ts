// An invoice's status, named by one function for the list, the page, the PDF and the
// email. Pure, and part of the client-safe contract. None of it is stored.
//
// Draft, issued and void are read from the invoice's own stamps: no number is a draft, a
// void stamp is void. The rest are worked out from the payments that stand and from the
// due date against the company's today: nothing owed is Paid; past its due date with
// something owed is Overdue, whether or not part was paid; something paid and something
// owed is Partly paid; otherwise it is Issued. An invoice is not overdue on the day it is
// due. Days are `YYYY-MM-DD`, so text order is date order.

export const INVOICE_STATUSES = [
  "draft",
  "issued",
  "partly_paid",
  "paid",
  "overdue",
  "void",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export type InvoiceFacts = {
  // Null until issued.
  number: number | null;
  voided: boolean;
  totalCents: number;
  // Of the payments that stand.
  paidCents: number;
  // Null on a draft that named none.
  dueOn: string | null;
};

export function invoiceStatus(invoice: InvoiceFacts, today: string): InvoiceStatus {
  if (invoice.voided) return "void";
  if (invoice.number === null) return "draft";
  const owed = invoice.totalCents - invoice.paidCents;
  if (owed <= 0) return "paid";
  if (invoice.dueOn !== null && today > invoice.dueOn) return "overdue";
  return invoice.paidCents > 0 ? "partly_paid" : "issued";
}

// The status in English, as a customer reads it on the PDF and in the email: what a
// customer receives is in English, whatever language the office works in.
export const INVOICE_STATUS_WORDS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  issued: "Issued",
  partly_paid: "Partly paid",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};

// The statuses with something still owed: what "Outstanding" means.
export const OUTSTANDING: readonly InvoiceStatus[] = ["issued", "partly_paid", "overdue"];
