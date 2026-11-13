// Stage 3 line 1a: identity binding on users (0015, and 0038 for the phone number). The
// request context finds the caller's row before the tenant is known, through policies keyed
// on app.identity_subject, app.identity_email and app.identity_phone, and binds an invitation
// on first sign-in. The guard trigger makes the
// bind change identity_subject and nothing else. Fixtures are written as the owner; every
// assertion after asApp() runs as trader_app, in raw SQL, with no API code involved.
import { sql, type SQL } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../../src/client";
import { companies, users } from "../../src/schema";
import { asApp, company, one, pgError, rolledBack, sqlstate, type Tx } from "../helpers";

let db: Db;
beforeAll(() => {
  db = createDb();
});
afterAll(async () => {
  await db.$client.end();
});

// Two companies. Each has a bound user and an unbound invitation to the same address, in
// different case, so the email policy's case-insensitivity and cross-company reach both show.
// Each also has a second invitation carrying one sign-in number, the same in both companies,
// and its bound user carries another.
const PHONE = "+14015550100";
const BOUND_PHONE = "+14015550111";

async function twoCompanies(tx: Tx) {
  const make = async (name: string, subject: string, inviteEmail: string) => {
    const c = one(
      await tx
        .insert(companies)
        .values({ ...company, name })
        .returning({ id: companies.id }),
    );
    const bound = one(
      await tx
        .insert(users)
        .values({
          companyId: c.id,
          email: `${subject}@co.test`,
          name: "Bound",
          identitySubject: subject,
          signInPhone: BOUND_PHONE,
        })
        .returning({ id: users.id }),
    );
    const invite = one(
      await tx
        .insert(users)
        .values({
          companyId: c.id,
          email: inviteEmail,
          name: "Invitee",
          phone: "555-0100",
        })
        .returning({ id: users.id }),
    );
    const byPhone = one(
      await tx
        .insert(users)
        .values({
          companyId: c.id,
          email: `by-phone-${subject}@co.test`,
          name: "Invited by number",
          signInPhone: PHONE,
        })
        .returning({ id: users.id }),
    );
    return {
      companyId: c.id,
      boundId: bound.id,
      inviteId: invite.id,
      phoneInviteId: byPhone.id,
    };
  };
  return {
    a: await make("Company A", "sub-a", "Invitee@Co.test"),
    b: await make("Company B", "sub-b", "invitee@co.test"),
  };
}

// As the request context will: the verified identity in three transaction-local settings.
async function signIn(tx: Tx, subject = "", email = "", phone = "") {
  await tx.execute(sql`
    select set_config('app.identity_subject', ${subject}, true),
      set_config('app.identity_email', ${email}, true),
      set_config('app.identity_phone', ${phone}, true)
  `);
}

async function visibleIds(tx: Tx) {
  const { rows } = await tx.execute<{ id: string }>(
    sql`select id from users order by id`,
  );
  return rows.map((r) => r.id).sort();
}

async function rowCount(tx: Tx, statement: SQL) {
  return (await tx.execute(statement)).rowCount;
}

// The failing statement aborts the transaction, so it runs in a savepoint.
async function refused(tx: Tx, statement: SQL) {
  return pgError(tx.transaction((sp: Tx) => sp.execute(statement)));
}

// The row as the owner sees it, every column, for before/after comparisons.
async function ownerRow(tx: Tx, id: string) {
  await tx.execute(sql`reset role`);
  const { rows } = await tx.execute(sql`select * from users where id = ${id}`);
  return one(rows);
}

const BIND_REFUSED =
  "users: identity_subject changes only by binding an invited row, alone";
const IDENTITY_UPDATE_REFUSED =
  "users: under a sign-in identity the only permitted update is the bind";

describe("users identity policies", () => {
  it("show a bound subject exactly its own row, across companies", async () => {
    await rolledBack(db, async (tx) => {
      const { a } = await twoCompanies(tx);
      await asApp(tx);
      await signIn(tx, "sub-a");
      expect(await visibleIds(tx)).toEqual([a.boundId]);
    });
  });

  it("show an email only unbound invitations, case-insensitively, in every company", async () => {
    await rolledBack(db, async (tx) => {
      const { a, b } = await twoCompanies(tx);
      await asApp(tx);
      await signIn(tx, "sub-new", "INVITEE@co.TEST");
      expect(await visibleIds(tx)).toEqual([a.inviteId, b.inviteId].sort());
    });
  });

  it("never show a bound row by its email", async () => {
    await rolledBack(db, async (tx) => {
      await twoCompanies(tx);
      await asApp(tx);
      await signIn(tx, "someone-else", "sub-a@co.test");
      expect(await visibleIds(tx)).toEqual([]);
    });
  });

  it("show nothing once both settings are cleared to ''", async () => {
    await rolledBack(db, async (tx) => {
      await twoCompanies(tx);
      await asApp(tx);
      await signIn(tx, "sub-a", "invitee@co.test");
      await signIn(tx);
      expect(await visibleIds(tx)).toEqual([]);
    });
  });

  it("let a bind move the invitation from the email policy to the subject policy", async () => {
    await rolledBack(db, async (tx) => {
      const { a } = await twoCompanies(tx);
      await asApp(tx);
      await signIn(tx, "sub-new", "invitee@co.test");
      expect(
        await rowCount(
          tx,
          sql`update users set identity_subject = 'sub-new', updated_at = now()
            where id = ${a.inviteId} and identity_subject is null`,
        ),
      ).toBe(1);
      await signIn(tx, "sub-new");
      expect(await visibleIds(tx)).toEqual([a.inviteId]);
    });
  });

  it("reach no row when the email does not match", async () => {
    await rolledBack(db, async (tx) => {
      const { a } = await twoCompanies(tx);
      await asApp(tx);
      await signIn(tx, "sub-new", "stranger@co.test");
      expect(
        await rowCount(
          tx,
          sql`update users set identity_subject = 'sub-new' where id = ${a.inviteId}`,
        ),
      ).toBe(0);
    });
  });

  it("refuse binding to a subject other than the verified one", async () => {
    await rolledBack(db, async (tx) => {
      const { a } = await twoCompanies(tx);
      await asApp(tx);
      await signIn(tx, "sub-new", "invitee@co.test");
      const error = await refused(
        tx,
        sql`update users set identity_subject = 'sub-forged' where id = ${a.inviteId}`,
      );
      expect(error.code).toBe("23000");
      expect(error.message).toBe(BIND_REFUSED);
    });
  });

  it("refuse a second row bound to the same subject (23505)", async () => {
    await rolledBack(db, async (tx) => {
      const { a, b } = await twoCompanies(tx);
      await asApp(tx);
      await signIn(tx, "sub-new", "invitee@co.test");
      await tx.execute(
        sql`update users set identity_subject = 'sub-new' where id = ${a.inviteId}`,
      );
      expect(
        await sqlstate(
          tx.transaction((sp: Tx) =>
            sp.execute(
              sql`update users set identity_subject = 'sub-new' where id = ${b.inviteId}`,
            ),
          ),
        ),
      ).toBe("23505");
    });
  });

  it("refuse an INSERT under an identity, the tenant unset (42501)", async () => {
    await rolledBack(db, async (tx) => {
      const { a } = await twoCompanies(tx);
      await asApp(tx);
      await signIn(tx, "sub-new", "new@co.test");
      const error = await refused(
        tx,
        sql`insert into users (company_id, email, name, identity_subject)
          values (${a.companyId}, 'new@co.test', 'New', 'sub-new')`,
      );
      expect(error.code).toBe("42501");
    });
  });
});

describe("users identity policies, by phone number", () => {
  it("show a number only unbound invitations to it, in every company", async () => {
    await rolledBack(db, async (tx) => {
      const { a, b } = await twoCompanies(tx);
      await asApp(tx);
      await signIn(tx, "sub-new", "", PHONE);
      expect(await visibleIds(tx)).toEqual([a.phoneInviteId, b.phoneInviteId].sort());
    });
  });

  it("never show a bound row by its number", async () => {
    await rolledBack(db, async (tx) => {
      await twoCompanies(tx);
      await asApp(tx);
      await signIn(tx, "someone-else", "", BOUND_PHONE);
      expect(await visibleIds(tx)).toEqual([]);
    });
  });

  it("show nothing once the number is cleared to ''", async () => {
    await rolledBack(db, async (tx) => {
      await twoCompanies(tx);
      await asApp(tx);
      await signIn(tx, "sub-new", "", PHONE);
      await signIn(tx);
      expect(await visibleIds(tx)).toEqual([]);
    });
  });

  it("let a bind move the invitation from the phone policy to the subject policy", async () => {
    await rolledBack(db, async (tx) => {
      const { a } = await twoCompanies(tx);
      const before = await ownerRow(tx, a.phoneInviteId);
      await asApp(tx);
      await signIn(tx, "sub-new", "", PHONE);
      expect(
        await rowCount(
          tx,
          sql`update users set identity_subject = 'sub-new'
            where id = ${a.phoneInviteId} and identity_subject is null`,
        ),
      ).toBe(1);
      await signIn(tx, "sub-new");
      expect(await visibleIds(tx)).toEqual([a.phoneInviteId]);
      expect(await ownerRow(tx, a.phoneInviteId)).toEqual({
        ...before,
        identity_subject: "sub-new",
      });
    });
  });

  it("reach no row when the number does not match", async () => {
    await rolledBack(db, async (tx) => {
      const { a } = await twoCompanies(tx);
      await asApp(tx);
      await signIn(tx, "sub-new", "", "+14015550177");
      expect(
        await rowCount(
          tx,
          sql`update users set identity_subject = 'sub-new' where id = ${a.phoneInviteId}`,
        ),
      ).toBe(0);
    });
  });

  it("refuse binding by number to a subject other than the verified one", async () => {
    await rolledBack(db, async (tx) => {
      const { a } = await twoCompanies(tx);
      await asApp(tx);
      await signIn(tx, "sub-new", "", PHONE);
      const error = await refused(
        tx,
        sql`update users set identity_subject = 'sub-forged' where id = ${a.phoneInviteId}`,
      );
      expect(error.code).toBe("23000");
      expect(error.message).toBe(BIND_REFUSED);
    });
  });

  // The subject setting is always present in a request; the guard does not rely on it.
  it("refuse any other update while only the number is set (23000)", async () => {
    await rolledBack(db, async (tx) => {
      const { a } = await twoCompanies(tx);
      const before = await ownerRow(tx, a.phoneInviteId);
      await asApp(tx);
      await signIn(tx, "", "", PHONE);
      const error = await refused(
        tx,
        sql`update users set role = 'admin' where id = ${a.phoneInviteId}`,
      );
      expect(error.code).toBe("23000");
      expect(error.message).toBe(IDENTITY_UPDATE_REFUSED);
      expect(await ownerRow(tx, a.phoneInviteId)).toEqual(before);
    });
  });
});

describe("users identity guard", () => {
  // Each column a bind must not change, with a value that differs from the fixture's.
  const smuggled: [string, (other: string) => SQL][] = [
    ["role", () => sql`role = 'admin'`],
    ["company_id", (other) => sql`company_id = ${other}`],
    ["deactivated_at", () => sql`deactivated_at = now()`],
    ["email", () => sql`email = 'changed@co.test'`],
    ["name", () => sql`name = 'Changed'`],
    ["phone", () => sql`phone = '555-0199'`],
    ["sign_in_phone", () => sql`sign_in_phone = '+14015550199'`],
    ["created_at", () => sql`created_at = now() - interval '1 day'`],
    ["id", () => sql`id = uuidv7()`],
  ];

  for (const [column, set] of smuggled) {
    it(`refuses a bind that also changes ${column} (23000), row unchanged`, async () => {
      await rolledBack(db, async (tx) => {
        const { a, b } = await twoCompanies(tx);
        const before = await ownerRow(tx, a.inviteId);
        await asApp(tx);
        await signIn(tx, "sub-new", "invitee@co.test");
        const error = await refused(
          tx,
          sql`update users set identity_subject = 'sub-new', ${set(b.companyId)}
            where id = ${a.inviteId}`,
        );
        expect(error.code).toBe("23000");
        expect(error.message).toBe(BIND_REFUSED);
        expect(await ownerRow(tx, a.inviteId)).toEqual(before);
      });
    });
  }

  for (const [column, set] of smuggled.filter(([c]) =>
    ["role", "deactivated_at", "email"].includes(c),
  )) {
    // The invitation is reachable through the bind policy, so only the guard stands between
    // the identity path and this column.
    it(`refuses changing an invitation's ${column} under an identity (23000)`, async () => {
      await rolledBack(db, async (tx) => {
        const { a, b } = await twoCompanies(tx);
        const before = await ownerRow(tx, a.inviteId);
        await asApp(tx);
        await signIn(tx, "sub-new", "invitee@co.test");
        const error = await refused(
          tx,
          sql`update users set ${set(b.companyId)} where id = ${a.inviteId}`,
        );
        expect(error.code).toBe("23000");
        expect(error.message).toBe(IDENTITY_UPDATE_REFUSED);
        expect(await ownerRow(tx, a.inviteId)).toEqual(before);
      });
    });

    // A bound row has no UPDATE policy without a tenant: RLS reaches no row at all.
    it(`reaches no bound row to change its ${column} under an identity`, async () => {
      await rolledBack(db, async (tx) => {
        const { a, b } = await twoCompanies(tx);
        await asApp(tx);
        await signIn(tx, "sub-a");
        expect(
          await rowCount(
            tx,
            sql`update users set ${set(b.companyId)} where id = ${a.boundId}`,
          ),
        ).toBe(0);
      });
    });
  }

  it("refuses a bind while a tenant is set (23000)", async () => {
    await rolledBack(db, async (tx) => {
      const { a } = await twoCompanies(tx);
      await asApp(tx, a.companyId);
      await signIn(tx, "sub-new", "invitee@co.test");
      const error = await refused(
        tx,
        sql`update users set identity_subject = 'sub-new' where id = ${a.inviteId}`,
      );
      expect(error.code).toBe("23000");
      expect(error.message).toBe(BIND_REFUSED);
    });
  });

  it("lets the tenant path update role and deactivated_at", async () => {
    await rolledBack(db, async (tx) => {
      const { a } = await twoCompanies(tx);
      await asApp(tx, a.companyId);
      expect(
        await rowCount(
          tx,
          sql`update users set role = 'foreman', deactivated_at = now() where id = ${a.boundId}`,
        ),
      ).toBe(1);
    });
  });

  const identityEdits: [string, (a: { inviteId: string; boundId: string }) => SQL][] = [
    [
      "set",
      (a) => sql`update users set identity_subject = 'sub-x' where id = ${a.inviteId}`,
    ],
    [
      "change",
      (a) => sql`update users set identity_subject = 'sub-x' where id = ${a.boundId}`,
    ],
    [
      "clear",
      (a) => sql`update users set identity_subject = null where id = ${a.boundId}`,
    ],
  ];

  for (const [verb, statement] of identityEdits) {
    it(`refuses the tenant path to ${verb} identity_subject (23000)`, async () => {
      await rolledBack(db, async (tx) => {
        const { a } = await twoCompanies(tx);
        await asApp(tx, a.companyId);
        const error = await refused(tx, statement(a));
        expect(error.code).toBe("23000");
        expect(error.message).toBe(BIND_REFUSED);
      });
    });

    it(`refuses the owner to ${verb} identity_subject (23000)`, async () => {
      await rolledBack(db, async (tx) => {
        const { a } = await twoCompanies(tx);
        const error = await refused(tx, statement(a));
        expect(error.code).toBe("23000");
        expect(error.message).toBe(BIND_REFUSED);
      });
    });
  }
});
