// The phone's store (ARCHITECTURE: Drizzle on expo-sqlite, storage only — the sync layer is
// ours). Two tables: the outbox, a row a captured record, and a small key-value table for
// the last pull's snapshot, the reachability reading, the language and who is signed in.
// Capture writes here and nowhere else, so it works with no signal and no session. The
// tables are made on open with the statements below, which only ever add: a later build
// that needs a new column adds it the same way and reads an old row without it.
import type { LaborPayload } from "@trader/api/contract";
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { openDatabaseSync } from "expo-sqlite";
import superjson from "superjson";

import type { OutboxRecord, Standing, Store } from "../sync/types";

const outbox = sqliteTable("outbox", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  kind: text("kind").notNull(),
  schemaVersion: integer("schema_version").notNull(),
  // The payload as captured, dates and all (superjson): never rewritten.
  payload: text("payload").notNull(),
  standing: text("standing").$type<Standing>().notNull(),
  syncingSince: integer("syncing_since"),
  code: text("code"),
  reasons: text("reasons").notNull(),
});
const kv = sqliteTable("kv", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

const expo = openDatabaseSync("trader.db");
expo.execSync(`
  create table if not exists outbox (
    id text primary key not null,
    owner_id text not null,
    kind text not null,
    schema_version integer not null,
    payload text not null,
    standing text not null,
    syncing_since integer,
    code text,
    reasons text not null
  );
  create index if not exists outbox_owner_standing on outbox (owner_id, standing, id);
  create table if not exists kv (key text primary key not null, value text not null);
`);
const db = drizzle(expo);

const record = (row: typeof outbox.$inferSelect): OutboxRecord => ({
  id: row.id,
  ownerId: row.ownerId,
  kind: "labor_event",
  schemaVersion: 1,
  payload: superjson.parse<LaborPayload>(row.payload),
  standing: row.standing,
  syncingSince: row.syncingSince,
  code: row.code,
  reasons: JSON.parse(row.reasons) as string[],
});

// The driver is synchronous; the contract is promises, so a caller never depends on that.
const done = <T>(work: () => T): Promise<T> => {
  try {
    return Promise.resolve(work());
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
};

export const deviceStore: Store = {
  append: (records) =>
    done(() =>
      db.transaction((tx) => {
        for (const r of records) {
          tx.insert(outbox)
            .values({
              id: r.id,
              ownerId: r.ownerId,
              kind: "labor_event",
              schemaVersion: 1,
              payload: superjson.stringify(r.payload),
              standing: "pending",
              reasons: "[]",
            })
            .run();
        }
      }),
    ),
  due: (ownerId, limit) =>
    done(() =>
      db
        .select()
        .from(outbox)
        .where(and(eq(outbox.ownerId, ownerId), eq(outbox.standing, "pending")))
        .orderBy(asc(outbox.id))
        .limit(limit)
        .all()
        .map(record),
    ),
  claim: (ids, at) =>
    done(() => {
      if (ids.length === 0) return;
      db.update(outbox)
        .set({ standing: "syncing", syncingSince: at })
        .where(and(inArray(outbox.id, ids), eq(outbox.standing, "pending")))
        .run();
    }),
  release: (ids) =>
    done(() => {
      if (ids.length === 0) return;
      db.update(outbox)
        .set({ standing: "pending", syncingSince: null })
        .where(and(inArray(outbox.id, ids), eq(outbox.standing, "syncing")))
        .run();
    }),
  reclaim: (startedBefore) =>
    done(() => {
      db.update(outbox)
        .set({ standing: "pending", syncingSince: null })
        .where(
          and(eq(outbox.standing, "syncing"), lte(outbox.syncingSince, startedBefore)),
        )
        .run();
    }),
  settle: (id, reasons) =>
    done(() => {
      db.update(outbox)
        .set({
          standing: "settled",
          syncingSince: null,
          reasons: JSON.stringify(reasons),
        })
        .where(eq(outbox.id, id))
        .run();
    }),
  reject: (id, code) =>
    done(() => {
      db.update(outbox)
        .set({ standing: "rejected", syncingSince: null, code })
        .where(eq(outbox.id, id))
        .run();
    }),
  records: (ownerId) =>
    done(() =>
      db
        .select()
        .from(outbox)
        .where(eq(outbox.ownerId, ownerId))
        .orderBy(asc(outbox.id))
        .all()
        .map(record),
    ),
  prune: (ownerId, known) =>
    done(() => {
      // In pieces: SQLite bounds the number of values one statement may bind.
      for (let i = 0; i < known.length; i += 500) {
        db.delete(outbox)
          .where(
            and(
              eq(outbox.ownerId, ownerId),
              eq(outbox.standing, "settled"),
              inArray(outbox.id, known.slice(i, i + 500)),
            ),
          )
          .run();
      }
    }),
  read: (key) =>
    done(() => db.select().from(kv).where(eq(kv.key, key)).get()?.value ?? null),
  write: (key, value) =>
    done(() => {
      if (value === null) db.delete(kv).where(eq(kv.key, key)).run();
      else {
        db.insert(kv)
          .values({ key, value })
          .onConflictDoUpdate({ target: kv.key, set: { value } })
          .run();
      }
    }),
};
