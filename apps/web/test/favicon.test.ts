// /favicon.ico is served from assets/brand/favicon.png, byte for byte, through the route
// module as Next will call it: a small icon, never the 2048 px master.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { GET } from "../src/app/favicon.ico/route";

describe("GET /favicon.ico", () => {
  it("answers the small icon as image/png, a few KB", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    const served = new Uint8Array(await response.arrayBuffer());
    const master = await readFile(
      fileURLToPath(new URL("../../../assets/brand/favicon.png", import.meta.url)),
    );
    expect(served.byteLength).toBe(master.byteLength);
    expect(Buffer.compare(Buffer.from(served), master)).toBe(0);
    expect(served.byteLength).toBeLessThan(8_000);
  });
});
