// The schema's lines, read from the migrated local database: what the promotion compares
// between a branch it migrated and a fresh replay.
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { databaseConnection } from "../../src/env";
import { schemaFingerprint } from "../../src/promotion/fingerprint";

let client: Client;
let lines: string[];
beforeAll(async () => {
  client = new Client(databaseConnection(process.env));
  await client.connect();
  lines = await schemaFingerprint((text) => client.query(text));
});
afterAll(async () => {
  await client.end();
});

const starting = (prefix: string) => lines.filter((line) => line.startsWith(prefix));

describe("schemaFingerprint", () => {
  it("names a tenant table with row security on and forced", () => {
    expect(lines).toContain(["table", "customers", "r", "true", "true"].join("\t"));
  });

  it("names columns, constraints, indexes, triggers, functions, policies and enum labels", () => {
    for (const section of [
      "column\tusers\t",
      "constraint\tusers\t",
      "index\tusers\t",
      "trigger\twork_session_events\t",
      "function\tapp_company_id\t",
      "policy\tcustomers\t",
      "enum\tapproval_reason\t",
    ]) {
      expect(starting(section), section).not.toEqual([]);
    }
  });

  it("names the application role's grants and its attributes, and no owner", async () => {
    expect(starting("table-grant\tcustomers\t")).not.toEqual([]);
    expect(lines).toContain(
      ["app-role", "trader_app", "false", "false", "false", "false", "false"].join("\t"),
    );
    const owner = (await client.query<{ me: string }>("select current_user as me"))
      .rows[0]?.me;
    expect(lines.filter((line) => line.split("\t").includes(owner ?? ""))).toEqual([]);
  });

  it("is sorted and the same on a second reading", async () => {
    expect([...lines].sort()).toEqual(lines);
    expect(await schemaFingerprint((text) => client.query(text))).toEqual(lines);
  });
});
