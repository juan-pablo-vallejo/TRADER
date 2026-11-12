// The audit trail's one writer (ARCHITECTURE, Office authority: audit trail; V1-D20). A row
// is inserted on the transaction of the write it records, by the procedure that made the
// write, on the branch that changed something: a rolled-back write leaves no row, a committed
// one always has its row, and a failed insert here fails the call, so nothing audited is ever
// committed unaudited. Never wrapped in a try, never written from a second transaction.
//
// The company and the actor are the caller the protected transaction resolved (trpc.ts);
// nothing here takes either from a procedure's input. `before` and `after` hold the columns
// the action changed, under their column names, or stable ids — never a name, an email, a
// phone, a time a worker captured or a description: the table is append-only, so what is
// written here can never be pseudonymized. The stamp is the server's clock at the insert, after
// the writer's locks (ARCHITECTURE, Concurrency), not the transaction's start.
//
// The entries are the whole of V1's scope: a new action is a new member here and a decision
// row. Consumed by roster/invite.ts, roster/role.ts, roster/deactivation.ts,
// roster/pay-rates.ts, approvals/decide.ts and labor/repair.ts, and by nothing else
// (test/core/audit.test.ts holds the inventory).
import { auditLog } from "@trader/db/schema";
import { sql } from "drizzle-orm";

import type { Tx } from "./context";
import type { AppUser } from "./resolve-user";

type Role = AppUser["role"];

export type AuditEntry =
  // The invited users row. Who was invited is the entity; the row repeats no contact data.
  | { action: "users.invite"; entityId: string; after: { role: Role } }
  | {
      action: "users.set_role";
      entityId: string;
      before: { role: Role };
      after: { role: Role };
    }
  // Instants are ISO 8601 strings, as the column stored them.
  | {
      action: "users.deactivate";
      entityId: string;
      before: { deactivated_at: null };
      after: { deactivated_at: string };
    }
  | {
      action: "users.reactivate";
      entityId: string;
      before: { deactivated_at: string };
      after: { deactivated_at: null };
    }
  // The new pay_rates row; rates are only ever added (roster/pay-rates.ts).
  | {
      action: "pay_rates.add";
      entityId: string;
      after: {
        user_id: string;
        effective_from: string;
        hourly_rate_cents: number;
        currency: string;
      };
    }
  // One accepted repair: a set of events written together, so no single row is the entity.
  // Each event's id, what it was, and the recorded event it corrects or voids.
  | {
      action: "work_session_events.repair";
      entityId: null;
      after: {
        worker_id: string;
        events: {
          id: string;
          kind: "append" | "correct" | "void";
          target_event_id: string | null;
        }[];
      };
    }
  | {
      action: "approvals.decide";
      entityId: string;
      before: { decision: null };
      after: { decision: "approved" | "rejected" };
    };

export type AuditAction = AuditEntry["action"];

// A record, so the compiler holds the list to every member of the union.
const ACTIONS: Record<AuditAction, true> = {
  "users.invite": true,
  "users.set_role": true,
  "users.deactivate": true,
  "users.reactivate": true,
  "pay_rates.add": true,
  "work_session_events.repair": true,
  "approvals.decide": true,
};

export const AUDIT_ACTIONS = Object.keys(ACTIONS) as AuditAction[];

export async function recordAudit(
  tx: Tx,
  user: AppUser,
  entry: AuditEntry,
): Promise<void> {
  await tx.insert(auditLog).values({
    companyId: user.companyId,
    actorUserId: user.id,
    action: entry.action,
    // audit_log_action_prefix holds the two together.
    entityTable: entry.action.slice(0, entry.action.indexOf(".")),
    entityId: entry.entityId,
    before: "before" in entry ? entry.before : null,
    after: entry.after,
    createdAt: sql`clock_timestamp()`,
  });
}
