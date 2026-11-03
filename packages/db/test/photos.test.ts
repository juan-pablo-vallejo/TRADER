// Stage 2 line 5: photos, asserted against the migrated container. Rolled-back transactions
// throughout; see helpers.ts.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../src/client";
import { customers, jobs, materials, photos } from "../src/schema";
import { fixture, one, rolledBack, sqlstate, type Tx, uuidv7 } from "./helpers";

type Refs = Awaited<ReturnType<typeof fixture>>;

const sha = "a".repeat(64);

// A job-progress photo as the push handler will write it: no material, not yet uploaded.
const photo = (refs: Refs): typeof photos.$inferInsert => {
  const id = uuidv7();
  return {
    id,
    companyId: refs.companyId,
    jobId: refs.jobId,
    takenByUserId: refs.workerId,
    takenAt: new Date(),
    objectKey: `${refs.companyId}/photos/${id}`,
    contentType: "image/jpeg",
    byteSize: 1_843_201,
    sha256: sha,
  };
};

async function receipt(tx: Tx, refs: Refs, jobId = refs.jobId) {
  return one(
    await tx
      .insert(materials)
      .values({
        id: uuidv7(),
        companyId: refs.companyId,
        jobId,
        loggedByUserId: refs.workerId,
        description: "Tape",
        quantity: "1",
        unit: "roll",
        loggedAt: new Date(),
      })
      .returning({ id: materials.id }),
  );
}

// A statement expected to fail, in its own savepoint so the test can go on.
const rejected = (tx: Tx, values: typeof photos.$inferInsert) =>
  sqlstate(tx.transaction((sp) => sp.insert(photos).values(values)));

let db: Db;
beforeAll(() => {
  db = createDb();
});
afterAll(async () => {
  await db.$client.end();
});

describe("photos", () => {
  it("accepts a progress photo and a receipt photo on the same job", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const material = await receipt(tx, refs);
      const rows = await tx
        .insert(photos)
        .values([photo(refs), { ...photo(refs), materialId: material.id }])
        .returning({ materialId: photos.materialId });
      expect(rows.map((r) => r.materialId)).toEqual([null, material.id]);
    });
  });

  it("rejects a receipt photo whose material is on another job", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const customer = one(
        await tx
          .insert(customers)
          .values({ companyId: refs.companyId, name: "Other customer" })
          .returning({ id: customers.id }),
      );
      const otherJob = one(
        await tx
          .insert(jobs)
          .values({
            companyId: refs.companyId,
            customerId: customer.id,
            name: "Other job",
          })
          .returning({ id: jobs.id }),
      );
      const material = await receipt(tx, refs, otherJob.id);
      const code = await sqlstate(
        tx.insert(photos).values({ ...photo(refs), materialId: material.id }),
      );
      expect(code).toBe("23503");
    });
  });

  it("rejects an id that is not version 7", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const code = await sqlstate(
        tx.insert(photos).values({ ...photo(refs), id: crypto.randomUUID() }),
      );
      expect(code).toBe("23514");
    });
  });

  it("rejects a second row with the same object key", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const first = photo(refs);
      await tx.insert(photos).values(first);
      const code = await sqlstate(
        tx.insert(photos).values({ ...photo(refs), objectKey: first.objectKey }),
      );
      expect(code).toBe("23505");
    });
  });

  it("rejects a content type that is not an image", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      expect(await rejected(tx, { ...photo(refs), contentType: "application/pdf" })).toBe(
        "23514",
      );
      expect(await rejected(tx, { ...photo(refs), contentType: "image/" })).toBe("23514");
    });
  });

  it("rejects an empty object", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const code = await sqlstate(
        tx.insert(photos).values({ ...photo(refs), byteSize: 0 }),
      );
      expect(code).toBe("23514");
    });
  });

  it("rejects a digest that is not 64 lower-case hex characters", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      expect(await rejected(tx, { ...photo(refs), sha256: sha.toUpperCase() })).toBe(
        "23514",
      );
      expect(await rejected(tx, { ...photo(refs), sha256: sha.slice(1) })).toBe("23514");
    });
  });

  it("rejects a blank object key", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const code = await sqlstate(
        tx.insert(photos).values({ ...photo(refs), objectKey: " " }),
      );
      expect(code).toBe("23514");
    });
  });
});
