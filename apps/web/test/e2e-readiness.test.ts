// The staging suite's readiness question (e2e/readiness.ts), asked with Playwright's own
// request context of a server on this machine. A stand-in for the context would not
// dispose anything: the first deploy's suite failed on exactly that, reading a body
// after its context was gone.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { request } from "@playwright/test";
import { afterEach, describe, expect, it } from "vitest";

import { askReadiness } from "../e2e/readiness";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";

let server: Server | undefined;
afterEach(async () => {
  await new Promise((done) => (server === undefined ? done(null) : server.close(done)));
  server = undefined;
});

// One answer for `/api/ready`; anything else asked of the server is a 500.
async function hostAnswering(
  status: number,
  headers: Record<string, string>,
  body: string,
): Promise<string> {
  server = createServer((req, res) => {
    if (req.url !== "/api/ready") {
      res.writeHead(500).end();
      return;
    }
    res.writeHead(status, headers).end(body);
  });
  await new Promise<void>((done) => server!.listen(0, "127.0.0.1", done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const json = { "content-type": "application/json" };

describe("askReadiness", () => {
  it("answers the status and the commit a ready host names", async () => {
    const host = await hostAnswering(
      200,
      json,
      JSON.stringify({ ready: true, commit: COMMIT }),
    );
    expect(await askReadiness(request, host)).toEqual({ status: 200, commit: COMMIT });
  });

  it("answers a wall's redirect as it is, unfollowed, with no commit", async () => {
    const host = await hostAnswering(302, { location: "/somewhere-else" }, "");
    expect(await askReadiness(request, host)).toEqual({ status: 302, commit: null });
  });

  it("names no commit for a 200 that is not the readiness answer", async () => {
    for (const body of ["<html>signed out</html>", JSON.stringify({ ready: true })]) {
      const host = await hostAnswering(200, json, body);
      expect(await askReadiness(request, host)).toEqual({ status: 200, commit: null });
      await new Promise((done) => server!.close(done));
      server = undefined;
    }
  });

  it("answers a failing host's status with no commit", async () => {
    const host = await hostAnswering(503, json, JSON.stringify({ ready: false }));
    expect(await askReadiness(request, host)).toEqual({ status: 503, commit: null });
  });
});
