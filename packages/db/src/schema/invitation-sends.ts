// Each time an invitation went out to a person, and how. Append-only: a send that failed
// is a row that says so, and sending again is another row. Two channels. `email` is sent by
// TRADER through the mail service, and its row keeps how that went. `text` is the ready
// message on the admin's own phone: TRADER sends nothing, and the row records that the
// admin opened it to send, which is all the server can know. The id is the browser's, so a
// request sent twice is one send. `recipient` is the address it went to as the roster held
// it then, so a send to an address the person no longer has can be told from one to the
// address they have. Whether a person is "sent" or "verified" is worked out from these rows
// and from the users row, never stored (packages/api, people/list.ts). Guards and tenancy
// are hand-written in the migration (drizzle-kit never sees them).
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
import { createdAt } from "./shared";
import { users } from "./users";

export const invitationSends = pgTable(
  "invitation_sends",
  {
    id: uuid("id").primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    userId: uuid("user_id").notNull(),
    channel: text("channel").notNull(),
    recipient: text("recipient").notNull(),
    outcome: text("outcome").notNull(),
    failure: text("failure"),
    providerMessageId: text("provider_message_id"),
    sentByUserId: uuid("sent_by_user_id").notNull(),
    createdAt,
  },
  (t) => [
    unique("invitation_sends_company_id_id_unique").on(t.companyId, t.id),
    foreignKey({
      name: "invitation_sends_company_id_user_id_fk",
      columns: [t.companyId, t.userId],
      foreignColumns: [users.companyId, users.id],
    }),
    foreignKey({
      name: "invitation_sends_company_id_sent_by_user_id_fk",
      columns: [t.companyId, t.sentByUserId],
      foreignColumns: [users.companyId, users.id],
    }),
    index("invitation_sends_user_id_idx").on(t.userId),
    check("invitation_sends_channel", sql`${t.channel} IN ('whatsapp', 'email')`),
    check(
      "invitation_sends_outcome",
      sql`${t.outcome} IN ('sent', 'failed', 'copied', 'opened')`,
    ),
    // A failure has its code and no message id; a send that went has no failure. A WhatsApp
    // message leaves the admin's own phone: it is noted as copied, opened or, once the admin
    // says so, sent, never failed and with no message id; copied and opened are its alone.
    check(
      "invitation_sends_outcome_facts",
      sql`(${t.outcome} = 'failed') = (${t.failure} IS NOT NULL) AND (${t.outcome} = 'sent' OR ${t.providerMessageId} IS NULL) AND (${t.channel} = 'email' OR (${t.outcome} IN ('sent', 'copied', 'opened') AND ${t.providerMessageId} IS NULL)) AND (${t.outcome} NOT IN ('copied', 'opened') OR ${t.channel} = 'whatsapp')`,
    ),
    check("invitation_sends_failure_code", sql`${t.failure} ~ '^[a-z_]+$'`),
    // The address as the roster holds one: an email lowercased, a number in E.164.
    check(
      "invitation_sends_recipient_shape",
      sql`(${t.channel} = 'email' AND ${t.recipient} = lower(btrim(${t.recipient})) AND ${t.recipient} ~ '^[^@[:space:]]+@[^@[:space:]]+$') OR (${t.channel} = 'whatsapp' AND ${t.recipient} ~ '^\\+1[2-9][0-9]{9}$')`,
    ),
  ],
);
