// `@trader/api/contract` (TASKS R4): what the phone may import as values. Three things are
// held here. Each list the contract restates is the schema's own list, member for member and
// in its order. The labor rejection codes are exactly the server's union — checked by the
// compiler, both ways. And every file of the contract imports zod and its own siblings and
// nothing else, so no server code can reach the phone's bundle through it.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  approvalReason,
  attestationLevel,
  jobStatus,
  userRole,
  workSessionEventType,
} from "@trader/db/schema";
import { describe, expect, it } from "vitest";

import * as contract from "../../src/contract";
import type { LaborRejectionCode } from "../../src/contract";
import type { LaborRejection } from "../../src/sync/labor";
import { pullOutput as serverPullOutput } from "../../src/sync/pull";
import { statusInput as serverStatusInput } from "../../src/core/status";

// Equal types, or the file does not compile.
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const sameCodes: Equal<LaborRejectionCode, LaborRejection> = true;

describe("the contract's restated lists", () => {
  it("are the schema's own, member for member", () => {
    expect([...contract.ROLES]).toEqual(userRole.enumValues);
    expect([...contract.JOB_STATUSES]).toEqual(jobStatus.enumValues);
    expect([...contract.LABOR_EVENT_TYPES]).toEqual(workSessionEventType.enumValues);
    expect([...contract.ATTESTATION_LEVELS]).toEqual(attestationLevel.enumValues);
    expect([...contract.APPROVAL_REASONS]).toEqual(approvalReason.enumValues);
    // What a device may record is every type but the office's void.
    expect([...contract.DEVICE_EVENT_TYPES]).toEqual(
      workSessionEventType.enumValues.filter((t) => t !== "voided"),
    );
  });

  it("name every labor rejection code once, the server's union exactly", () => {
    expect(sameCodes).toBe(true);
    expect(new Set(contract.LABOR_REJECTION_CODES).size).toBe(
      contract.LABOR_REJECTION_CODES.length,
    );
  });
});

describe("the contract's schemas", () => {
  it("are the ones the server answers and parses with, not copies", () => {
    expect(contract.pullOutput).toBe(serverPullOutput);
    expect(contract.statusInput).toBe(serverStatusInput);
  });

  it("parse a labor event as a device writes it, and refuse a void and a stray field", () => {
    const event = {
      workerId: "01a1e0e6-4ca4-7100-81e0-103fabd212d4",
      jobId: "01a1e0e6-4d47-7b0f-b575-c15685a0d051",
      type: "started",
      clientTimestamp: new Date("2026-11-09T12:10:00Z"),
      attestationLevel: "none",
      location: null,
      timeSetByUser: false,
      capturedOffline: true,
    };
    expect(contract.laborPayloadV1.safeParse(event).success).toBe(true);
    expect(contract.laborPayloadV1.safeParse({ ...event, type: "voided" }).success).toBe(
      false,
    );
    expect(
      contract.laborPayloadV1.safeParse({ ...event, companyId: event.jobId }).success,
    ).toBe(false);
  });
});

describe("the contract's files", () => {
  it("import zod and each other, and nothing else", () => {
    const dir = join(import.meta.dirname, "../../src/contract");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const source = readFileSync(join(dir, file), "utf8");
      // `import x from "…"`, `export * from "…"` and a bare `import "…"` alike.
      const imported = [...source.matchAll(/(?:from|import)\s+"([^"]+)"/g)].map(
        (m) => m[1]!,
      );
      for (const from of imported) {
        expect([file, from, from === "zod" || /^\.\/[a-z-]+$/.test(from)]).toEqual([
          file,
          from,
          true,
        ]);
      }
      // No dynamic way round it either.
      expect([file, /\bimport\(|\brequire\(/.test(source)]).toEqual([file, false]);
    }
  });
});
