import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { companies } from "./companies";
import { createdAt, id } from "./shared";
import { users } from "./users";

// What the server refused or left unprocessed in a push (ARCHITECTURE, sync protocol:
// rejected-record diagnostics, V1-D04). One minimized line per identifiable record answered
// `rejected`, per record omitted after a failure, and per push call that failed as a whole —
// so the office can answer "where are my hours" without the phone. It is not the ledger and
// not the recovery copy: the device's outbox is. Written by the API after the push's own
// transactions have ended (api sync/diagnostics.ts), read by `diagnostic.list`.
//
// These columns and no others: never a payload, a location, the record's own time, an email,
// an error's text. user_id is the caller who sent the push — a foreman's push for a crew
// member is the foreman's — because the subject of a record lives in its payload, which is
// never read for this. record_id has no foreign key: a refused record was never stored.
// record_kind and code are text under a format check, not enums, so a new record kind or
// rejection code needs no migration; both are written from the server's own vocabulary, never
// from client text. created_at is the database's receipt time: it is what "by day" and the
// retention period are measured in.
//
// Short-lived: rows past the retention period are deleted by the writer, so unlike every
// other fact table this one grants DELETE and has no append-only guard (migration 0029). No
// updated_at and no UPDATE grant: a line is never edited.
export const syncDiagnostics = pgTable(
  "sync_diagnostics",
  {
    id,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    userId: uuid("user_id").notNull(),
    requestId: uuid("request_id").notNull(),
    recordId: uuid("record_id"),
    recordKind: text("record_kind"),
    outcome: text("outcome").notNull(),
    code: text("code").notNull(),
    createdAt,
  },
  (t) => [
    // Composite, so the caller is a user of the row's company (invariant 4).
    foreignKey({
      name: "sync_diagnostics_company_id_user_id_fk",
      columns: [t.companyId, t.userId],
      foreignColumns: [users.companyId, users.id],
    }),
    check(
      "sync_diagnostics_outcome",
      sql`${t.outcome} IN ('rejected', 'omitted', 'request_failed')`,
    ),
    check("sync_diagnostics_code_format", sql`${t.code} ~ '^[a-z_]{1,64}$'`),
    check(
      "sync_diagnostics_record_kind_format",
      sql`${t.recordKind} IS NULL OR ${t.recordKind} ~ '^[a-z_]{1,40}$'`,
    ),
    // A whole-request failure names no record.
    check(
      "sync_diagnostics_request_failed_has_no_record",
      sql`${t.outcome} <> 'request_failed' OR (${t.recordId} IS NULL AND ${t.recordKind} IS NULL)`,
    ),
    // A record re-sent and refused the same way again adds no line: the first is kept.
    uniqueIndex("sync_diagnostics_company_id_record_id_code_unique")
      .on(t.companyId, t.recordId, t.code)
      .where(sql`${t.recordId} IS NOT NULL`),
    // The office read (one worker, one day) and the writer's per-user cap.
    index("sync_diagnostics_company_id_user_id_created_at_idx").on(
      t.companyId,
      t.userId,
      t.createdAt,
    ),
    // The writer's delete of expired lines.
    index("sync_diagnostics_company_id_created_at_idx").on(t.companyId, t.createdAt),
  ],
);
