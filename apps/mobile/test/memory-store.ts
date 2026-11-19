// The outbox in memory, for the cycle's tests: the same contract as the phone's store
// (src/sync/types.ts), with nothing native beneath it.
import type { NewRecord, OutboxRecord, Store } from "../src/sync/types";

export function memoryStore(): Store & { rows: OutboxRecord[]; kv: Map<string, string> } {
  const rows: OutboxRecord[] = [];
  const kv = new Map<string, string>();
  const byId = (id: string) => rows.find((r) => r.id === id);
  const sorted = () => [...rows].sort((a, b) => a.id.localeCompare(b.id));
  return {
    rows,
    kv,
    append(records: NewRecord[]) {
      if (records.some((r) => byId(r.id) !== undefined)) {
        return Promise.reject(new Error("id taken"));
      }
      for (const r of records) {
        rows.push({
          ...r,
          kind: "labor_event",
          schemaVersion: 1,
          standing: "pending",
          syncingSince: null,
          code: null,
          flags: [],
        });
      }
      return Promise.resolve();
    },
    due: (ownerId, limit) =>
      Promise.resolve(
        sorted()
          .filter((r) => r.ownerId === ownerId && r.standing === "pending")
          .slice(0, limit),
      ),
    claim(ids, at) {
      for (const id of ids) {
        const r = byId(id);
        if (r?.standing === "pending")
          Object.assign(r, { standing: "syncing", syncingSince: at });
      }
      return Promise.resolve();
    },
    release(ids) {
      for (const id of ids) {
        const r = byId(id);
        if (r?.standing === "syncing")
          Object.assign(r, { standing: "pending", syncingSince: null });
      }
      return Promise.resolve();
    },
    reclaim(before) {
      for (const r of rows) {
        if (r.standing === "syncing" && (r.syncingSince ?? 0) <= before) {
          Object.assign(r, { standing: "pending", syncingSince: null });
        }
      }
      return Promise.resolve();
    },
    settle(id, flags) {
      const r = byId(id);
      if (r !== undefined)
        Object.assign(r, { standing: "settled", syncingSince: null, flags });
      return Promise.resolve();
    },
    reject(id, code) {
      const r = byId(id);
      if (r !== undefined)
        Object.assign(r, { standing: "rejected", syncingSince: null, code });
      return Promise.resolve();
    },
    records: (ownerId) => Promise.resolve(sorted().filter((r) => r.ownerId === ownerId)),
    prune(ownerId, known) {
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        const r = rows[i]!;
        if (r.ownerId === ownerId && r.standing === "settled" && known.includes(r.id)) {
          rows.splice(i, 1);
        }
      }
      return Promise.resolve();
    },
    read: (key) => Promise.resolve(kv.get(key) ?? null),
    write(key, value) {
      if (value === null) kv.delete(key);
      else kv.set(key, value);
      return Promise.resolve();
    },
  };
}
