// Each time an issued invoice's PDF was sent to the customer by email, and how it went
// (PRD, Invoicing and exports; ARCHITECTURE, Payments and delivery; TASKS R7). Append-only:
// a send that failed is a row that says so, and sending again is another row. The id is the
// browser's, so a request sent twice is one send. `recipient` is the address it went to,
// as typed that time; `provider_message_id` is the mail service's own name for an accepted
// message; `failure` is a short code, never the service's message. Guards and tenancy are
// in the migration beside this table's (drizzle-kit never sees them).
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { companies } from "./companies";
import { invoices } from "./invoices";
import { createdAt } from "./shared";
import { users } from "./users";

export const invoiceSends = pgTable(
  "invoice_sends",
  {
    id: uuid("id").primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    invoiceId: uuid("invoice_id").notNull(),
    recipient: text("recipient").notNull(),
    outcome: text("outcome").notNull(),
    failure: text("failure"),
    providerMessageId: text("provider_message_id"),
    sentByUserId: uuid("sent_by_user_id").notNull(),
    createdAt,
  },
  (t) => [
    unique("invoice_sends_company_id_id_unique").on(t.companyId, t.id),
    foreignKey({
      name: "invoice_sends_company_id_invoice_id_fk",
      columns: [t.companyId, t.invoiceId],
      foreignColumns: [invoices.companyId, invoices.id],
    }),
    foreignKey({
      name: "invoice_sends_company_id_sent_by_user_id_fk",
      columns: [t.companyId, t.sentByUserId],
      foreignColumns: [users.companyId, users.id],
    }),
    index("invoice_sends_invoice_id_idx").on(t.invoiceId),
    check("invoice_sends_outcome", sql`${t.outcome} IN ('sent', 'failed')`),
    // A failure has its code and no message id; a send that went has no failure.
    check(
      "invoice_sends_outcome_facts",
      sql`(${t.outcome} = 'failed') = (${t.failure} IS NOT NULL) AND (${t.outcome} = 'sent' OR ${t.providerMessageId} IS NULL)`,
    ),
    check("invoice_sends_failure_code", sql`${t.failure} ~ '^[a-z_]+$'`),
    check(
      "invoice_sends_recipient_shape",
      sql`${t.recipient} = lower(btrim(${t.recipient})) AND ${t.recipient} ~ '^[^@[:space:]]+@[^@[:space:]]+$'`,
    ),
  ],
);
