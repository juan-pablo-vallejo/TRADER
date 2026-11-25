// The phone's API client (src/api.ts): every request given up at its deadline, and no
// request carrying more calls than the server answers in one.
import { expect, it } from "vitest";

import { createApi, MAX_BATCH_ITEMS, REQUEST_TIMEOUT_MS, timedFetch } from "../src/api";

it("aborts a request that never answers at the deadline", async () => {
  expect(REQUEST_TIMEOUT_MS).toBe(25_000);
  const never: typeof fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal!.reason as Error));
    });
  await expect(timedFetch(never, 20)("https://api.test/x")).rejects.toMatchObject({
    name: "AbortError",
  });
});

it("batches at most the server's limit of calls per request", async () => {
  expect(MAX_BATCH_ITEMS).toBe(10);
  const urls: string[] = [];
  const recording: typeof fetch = (input) => {
    urls.push(String(input));
    return Promise.reject(new Error("offline"));
  };
  const api = createApi("https://api.test", () => ({}), recording);
  await Promise.allSettled(Array.from({ length: 12 }, () => api.me.get.query()));
  expect(urls).toHaveLength(2);
  for (const url of urls) {
    const calls = new URL(url).pathname.split("/").at(-1)!.split(",");
    expect(calls.length).toBeLessThanOrEqual(10);
  }
});
