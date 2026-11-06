// TASKS:44: /favicon.ico is served from assets/brand/logo.png, byte for byte, through the
// route module as Next will call it.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { GET } from "../src/app/favicon.ico/route";

describe("GET /favicon.ico", () => {
  it("answers the brand master as image/png", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    const served = new Uint8Array(await response.arrayBuffer());
    const master = await readFile(
      fileURLToPath(new URL("../../../assets/brand/logo.png", import.meta.url)),
    );
    expect(served.byteLength).toBe(master.byteLength);
    expect(Buffer.compare(Buffer.from(served), master)).toBe(0);
  });
});
