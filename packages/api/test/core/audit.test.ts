// TASKS, Stage 4, audit rows (V1-D20): the one writer, core/audit.ts. What a row holds and
// whose it is; that it shares its procedure's fate; that a tenant neither reads nor writes
// another's; that nothing a client sends names the actor or the company. Each audited
// procedure's own row is its own suite's (roster, approvals, labor).
import type { Db } from "@trader/db";
import { auditLog } from "@trader/db/schema";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { recordAudit } from "../../src/core/audit";
import { createContext } from "../../src/core/context";
import { createCallerFactory, roleProcedure, router } from "../../src/core/trpc";
import {
  appCallerIn,
  appDb,
  asTenant,
  auditRows,
  auditRowsIn,
  becomeApp,
  companyIn,
  member,
  outcome,
  ownerDb,
  quietReporter,
  rejection,
  REQUEST_ID,
  rolledBack,
  sqlstateOf,
  txAsDb,
  uuidv7,
  world,
} from "../helpers";

// A test-only procedure behind the real admin gate: it records one row, then fails or not.
const probe = router({
  record: roleProcedure("admin")
    .input(z.object({ entityId: z.uuid(), fail: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await recordAudit(ctx.tx, ctx.user, {
        action: "users.set_role",
        entityId: input.entityId,
        before: { role: "worker" },
        after: { role: "foreman" },
      });
      if (input.fail) throw new Error("procedure failed after its audit row");
      return "written";
    }),
});

const probeCaller = (db: Db, who: unknown, inherit = false) =>
  createCallerFactory(probe)(
    createContext({
      db,
      identity: who,
      reporter: quietReporter,
      requestId: REQUEST_ID,
      ...(inherit ? { waits: "inherit" as const } : {}),
    }),
  );

let owner: Db;
let app: Db;
beforeAll(() => {
  owner = ownerDb();
  app = appDb();
});
afterAll(async () => {
  await app.$client.end();
  await owner.$client.end();
});

describe("recordAudit", () => {
  it("writes the caller's company and id, the action's table, and the clock after the start", async () => {
    await rolledBack(owner, async (tx) => {
      const c = await companyIn(tx, "admin");
      const entityId = uuidv7();
      await becomeApp(tx);
      await probeCaller(txAsDb(tx), c.who, true).record({ entityId, fail: false });
      expect(await auditRowsIn(tx, c.companyId)).toEqual([
        {
          companyId: c.companyId,
          actorUserId: c.userId,
          action: "users.set_role",
          entityTable: "users",
          entityId,
          before: { role: "worker" },
          after: { role: "foreman" },
        },
      ]);
      // now() is the transaction's start; the row's stamp is the clock at the insert.
      const { rows } = await tx.execute<{ later: boolean }>(
        sql`select created_at > now() as later from audit_log`,
      );
      expect(rows).toEqual([{ later: true }]);
    });
  });

  it("leaves no row when the procedure fails after writing it", async () => {
    // Committed fixtures and the procedure's own transaction: the failure is a real rollback,
    // read back from another connection. Nothing audited is committed, so cleanup can delete.
    const w = await world(owner);
    try {
      const admin = await member(owner, w, "a", "admin", { label: "audit" });
      const call = probeCaller(app, admin.who).record({ entityId: uuidv7(), fail: true });
      expect(await outcome(call)).toBe("INTERNAL_SERVER_ERROR");
      expect(await auditRows(owner, w.a.companyId)).toEqual([]);
    } finally {
      await w.cleanup();
    }
  });

  it("is refused to a worker and a foreman at the gate, writing nothing", async () => {
    await rolledBack(owner, async (tx) => {
      for (const role of ["worker", "foreman"] as const) {
        const c = await companyIn(tx, role);
        await becomeApp(tx);
        const call = probeCaller(txAsDb(tx), c.who, true).record({
          entityId: uuidv7(),
          fail: false,
        });
        expect(await outcome(call)).toBe("FORBIDDEN");
        expect(await auditRowsIn(tx, c.companyId)).toEqual([]);
        await tx.execute(sql`reset role`);
      }
    });
  });
});

describe("audit_log across tenants", () => {
  it("shows a tenant none of another's rows and takes none in another's name", async () => {
    await rolledBack(owner, async (tx) => {
      const a = await companyIn(tx, "admin");
      const b = await companyIn(tx, "admin");
      const row = (companyId: string, actorUserId: string) => ({
        companyId,
        actorUserId,
        action: "users.set_role",
        entityTable: "users",
        entityId: uuidv7(),
        before: { role: "worker" },
        after: { role: "foreman" },
      });
      await tx.insert(auditLog).values(row(a.companyId, a.userId));

      await asTenant(tx, b.companyId);
      expect(await tx.select().from(auditLog)).toEqual([]);
      // Another company's row: the tenant policy's WITH CHECK.
      const foreign = await rejection(
        tx.transaction((sp) => sp.insert(auditLog).values(row(a.companyId, a.userId))),
      );
      expect(sqlstateOf(foreign)).toBe("42501");
      // Its own row naming another company's user: the composite foreign key.
      const borrowed = await rejection(
        tx.transaction((sp) => sp.insert(auditLog).values(row(b.companyId, a.userId))),
      );
      expect(sqlstateOf(borrowed)).toBe("23503");
      expect(await tx.select().from(auditLog)).toEqual([]);
    });
  });
});

describe("the audited procedures' inputs", () => {
  it("refuse an actor or a company named by the client, writing nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const c = await companyIn(tx, "admin");
      const other = await companyIn(tx, "admin");
      await becomeApp(tx);
      const api = appCallerIn(tx, c.who);
      // What a forger would add to an otherwise valid input.
      const forged = { actorUserId: other.userId, companyId: other.companyId };
      const userId = c.userId;
      const calls: (() => Promise<unknown>)[] = [
        () =>
          api.roster.invite({ email: "f@co.test", name: "Forged", ...forged } as never),
        () => api.roster.setRole({ userId, role: "worker", ...forged } as never),
        () => api.roster.deactivate({ userId, ...forged } as never),
        () => api.roster.reactivate({ userId, ...forged } as never),
        () =>
          api.roster.setPayRate({
            userId,
            effectiveFrom: "2026-11-02",
            hourlyRateCents: 2500,
            ...forged,
          } as never),
        () =>
          api.approval.decide({
            approvalId: uuidv7(),
            decision: "approved",
            ...forged,
          } as never),
        () =>
          api.labor.repair({
            workerId: userId,
            operations: [{ kind: "void", id: uuidv7(), voidsEventId: uuidv7() }],
            ...forged,
          } as never),
      ];
      for (const call of calls) expect(await outcome(call())).toBe("BAD_REQUEST");
      expect(await auditRowsIn(tx, c.companyId)).toEqual([]);
      expect(await auditRowsIn(tx, other.companyId)).toEqual([]);
    });
  });
});
