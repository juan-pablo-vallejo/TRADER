// The wire contract, pinned (H4). wire.json holds every procedure's input and output schema,
// each sync payload version and the contract's shared lists, as JSON Schema from zod's own
// `z.toJSONSchema`. A change that compiles and passes every other test can still stop an
// installed phone syncing; here it changes this file, and the diff is read against "The
// phone's contract" (docs/ARCHITECTURE.md). Updating it (`vitest -u`) is a decision, never a
// fix: the phone's procedures and the frozen payload below are held by tests `-u` cannot
// rewrite.
import { z } from "zod";
import type { AnyProcedure } from "@trpc/server";
import { describe, expect, it } from "vitest";

import * as contract from "../../src/contract";
import { PAYLOADS } from "../../src/sync/push";
import { appRouter } from "../../src/router";

// A Date travels as superjson's own type, which JSON Schema has no word for: it is named, so
// a field that turns from a date into a string still changes the snapshot.
// Draft 2020-12 throughout, so the `$schema` each root would repeat is left out.
function schemaOf(schema: z.ZodType, io: "input" | "output") {
  const { $schema: _draft, ...json } = z.toJSONSchema(schema, {
    io,
    unrepresentable: "any",
    override: (ctx) => {
      if (ctx.zodSchema._zod.def.type === "date") ctx.jsonSchema["x-type"] = "date";
    },
  });
  return json;
}

const procedures = appRouter._def.procedures as unknown as Record<string, AnyProcedure>;

function procedureSchemas(path: string) {
  const def = procedures[path]!._def as unknown as {
    type: string;
    inputs: z.ZodType[];
    output?: z.ZodType;
  };
  return {
    type: def.type,
    input: def.inputs.map((s) => schemaOf(s, "input")),
    output: def.output === undefined ? null : schemaOf(def.output, "output"),
  };
}

// The contract's plain lists (its exported string arrays), by export name.
const lists = Object.fromEntries(
  Object.entries(contract)
    .filter(([, v]) => Array.isArray(v) && v.every((m) => typeof m === "string"))
    .sort(([a], [b]) => a.localeCompare(b)),
);

describe("the wire contract", () => {
  it("is the committed snapshot", async () => {
    const paths = Object.keys(procedures).sort();
    const wire = {
      procedures: Object.fromEntries(paths.map((p) => [p, procedureSchemas(p)])),
      payloads: Object.fromEntries(
        Object.entries(PAYLOADS).map(([kind, versions]) => [
          kind,
          Object.fromEntries(
            Object.entries(versions).map(([v, s]) => [v, schemaOf(s, "input")]),
          ),
        ]),
      ),
      lists,
    };
    expect(paths).toHaveLength(57);
    await expect(`${JSON.stringify(wire, null, 2)}\n`).toMatchFileSnapshot("./wire.json");
  });

  it("names only procedures the router has as the phone's", () => {
    for (const p of contract.PHONE_PROCEDURES)
      expect([p, p in procedures]).toEqual([p, true]);
  });
});

// Version 1 of a labor event's payload, as builds already installed write it. Frozen: a
// change is a new version beside it, upcast on the server (sync/push.ts PAYLOADS). Written
// out by hand so that no snapshot update can move it.
const LABOR_PAYLOAD_V1 = {
  type: "object",
  properties: {
    workerId: {
      type: "string",
      format: "uuid",
      pattern:
        "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
    },
    jobId: {
      type: "string",
      format: "uuid",
      pattern:
        "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
    },
    type: { type: "string", enum: ["started", "paused", "resumed", "ended"] },
    clientTimestamp: { "x-type": "date" },
    location: {
      anyOf: [
        {
          type: "object",
          properties: {
            lat: { type: "number", minimum: -90, maximum: 90 },
            lng: { type: "number", minimum: -180, maximum: 180 },
            accuracyM: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
          },
          required: ["lat", "lng", "accuracyM"],
          additionalProperties: false,
        },
        { type: "null" },
      ],
    },
    timeSetByUser: { type: "boolean" },
    capturedOffline: { type: "boolean" },
  },
  required: [
    "workerId",
    "jobId",
    "type",
    "clientTimestamp",
    "location",
    "timeSetByUser",
    "capturedOffline",
  ],
  additionalProperties: false,
};

describe("labor payload version 1", () => {
  it("is frozen", () => {
    expect(schemaOf(contract.laborPayloadV1, "input")).toEqual(LABOR_PAYLOAD_V1);
    expect(PAYLOADS.labor_event[1]).toBe(contract.laborPayloadV1);
  });
});
