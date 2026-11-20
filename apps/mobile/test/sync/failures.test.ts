// Which failed sync calls are reported, and that one is reported once, not every minute.
import { describe, expect, it } from "vitest";

import { createFailureLog, failureKind, type Stage } from "../../src/sync/failures";
import { runCycle } from "../../src/sync/engine";
import { memoryStore } from "../memory-store";

const trpc = (extra: object) =>
  Object.assign(new Error("x"), { name: "TRPCClientError" }, extra);

describe("how a call failed", () => {
  it("is nothing to report when there was no connection", () => {
    expect(failureKind(new TypeError("Network request failed"))).toBeNull();
    expect(
      failureKind(trpc({ cause: new TypeError("Network request failed") })),
    ).toBeNull();
    expect(failureKind(Object.assign(new Error("x"), { name: "AbortError" }))).toBeNull();
  });

  it("is nothing to report when the session was refused", () => {
    expect(
      failureKind(trpc({ data: { code: "UNAUTHORIZED", httpStatus: 401 } })),
    ).toBeNull();
    expect(failureKind(trpc({ meta: { response: { status: 401 } } }))).toBeNull();
  });

  it("names the API's own error, or the status of whatever answered instead", () => {
    expect(failureKind(trpc({ data: { code: "INTERNAL_SERVER_ERROR" } }))).toBe(
      "trpc_INTERNAL_SERVER_ERROR",
    );
    expect(failureKind(trpc({ meta: { response: { status: 502 } } }))).toBe("http_502");
    expect(failureKind(new RangeError("x"))).toBe("thrown_RangeError");
    expect(failureKind("a string")).toBe("thrown");
  });
});

describe("a failure that repeats", () => {
  it("is reported once per stage and kind, and again only after a clean cycle", () => {
    const said: string[] = [];
    const log = createFailureLog((stage, kind) => said.push(`${stage} ${kind}`));
    const broken = trpc({ data: { code: "INTERNAL_SERVER_ERROR" } });
    for (let minute = 0; minute < 60; minute += 1) log.note("pull", broken);
    log.note("push", broken);
    log.note("pull", new TypeError("Network request failed"));
    expect(said).toEqual([
      "pull trpc_INTERNAL_SERVER_ERROR",
      "push trpc_INTERNAL_SERVER_ERROR",
    ]);
    log.cleared();
    log.note("pull", broken);
    expect(said).toHaveLength(3);
  });

  it("is what a cycle tells of each call that threw", async () => {
    const told: [Stage, unknown][] = [];
    const down = trpc({ meta: { response: { status: 503 } } });
    const result = await runCycle(
      memoryStore(),
      {
        status: () => Promise.reject(down),
        push: () => Promise.reject(down),
        pull: () => Promise.reject(down),
      },
      () => 0,
      (stage, error) => told.push([stage, error]),
    );
    expect(result).toEqual({ outcome: "unreachable" });
    expect(told).toEqual([["status", down]]);
  });
});
