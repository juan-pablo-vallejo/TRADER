// The outbox and what it is kept in. A record is written once,
// at capture, and never changed after: only its standing moves — `pending` until a push
// takes it, `syncing` while one is in the air, `settled` once the server has it, `rejected`
// when the server never will. `Store` is what the sync cycle and the screens need of the
// device's database; the phone's is Drizzle on expo-sqlite (store/device.ts), a test's is
// in memory.
import type { LaborPayload, PullOutput, ServiceState } from "@trader/api/contract";

export type Standing = "pending" | "syncing" | "settled" | "rejected";

export type OutboxRecord = {
  id: string;
  // Who was signed in when it was captured: a push sends only its own person's records.
  ownerId: string;
  kind: "labor_event";
  schemaVersion: 1;
  payload: LaborPayload;
  standing: Standing;
  // When the push that holds it began; a record left `syncing` is reclaimed (engine.ts).
  syncingSince: number | null;
  // The server's refusal, for a rejected record.
  code: string | null;
  // What the server flagged it for, for a settled one; empty when it has no flag.
  flags: string[];
};

export type NewRecord = Pick<OutboxRecord, "id" | "ownerId" | "payload">;

export interface Store {
  // All of them or none: a job switch is two records.
  append(records: NewRecord[]): Promise<void>;
  // Pending records of one person, oldest first.
  due(ownerId: string, limit: number): Promise<OutboxRecord[]>;
  claim(ids: string[], at: number): Promise<void>;
  release(ids: string[]): Promise<void>;
  reclaim(startedBefore: number): Promise<void>;
  settle(id: string, flags: string[]): Promise<void>;
  reject(id: string, code: string): Promise<void>;
  // Every record of one person, oldest first.
  records(ownerId: string): Promise<OutboxRecord[]>;
  // Settled records the server's snapshot now shows are no longer needed here.
  prune(ownerId: string, known: string[]): Promise<void>;
  read(key: string): Promise<string | null>;
  write(key: string, value: string | null): Promise<void>;
}

export type PushAnswer =
  | { id: string; result: "accepted" | "duplicate"; flags: string[] }
  | { id: string; result: "rejected"; code: string };

// The three calls a cycle makes. Any of them may throw: that is the network, never a verdict.
export type Transport = {
  status(): Promise<ServiceState>;
  push(input: {
    deviceNow: Date;
    records: {
      id: string;
      kind: "labor_event";
      schemaVersion: 1;
      payload: LaborPayload;
    }[];
  }): Promise<{ clockSkewMs: number; results: PushAnswer[] }>;
  pull(): Promise<PullOutput>;
};

export type Snapshot = { pulledAt: number; data: PullOutput };
