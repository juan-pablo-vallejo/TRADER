// TASKS, R5: the phone's token on every call. The provider is a stand-in: what is tested is
// which of its states becomes a header, which a call never made, and which a call with no
// header, whose 401 is then the server's true answer.
import { describe, expect, it } from "vitest";

import { bearerFrom, TokenUnavailable, type TokenSource } from "../src/token";

const noPause = () => Promise.resolve();
const session = (token: string | null) => ({ getToken: () => Promise.resolve(token) });

describe("bearerFrom", () => {
  it("carries the session's token as a bearer header", async () => {
    const source: TokenSource = { loaded: true, session: session("abc") };
    expect(await bearerFrom(() => source, noPause)).toEqual({
      Authorization: "Bearer abc",
    });
  });

  it("waits for a provider still loading, then carries its token", async () => {
    let reads = 0;
    const source = (): TokenSource =>
      ++reads < 4
        ? { loaded: false, session: undefined }
        : { loaded: true, session: session("abc") };
    let pauses = 0;
    const headers = await bearerFrom(source, () => {
      pauses++;
      return Promise.resolve();
    });
    expect(headers).toEqual({ Authorization: "Bearer abc" });
    expect(pauses).toBe(3);
  });

  it("makes no call for a provider that never loads", async () => {
    const source: TokenSource = { loaded: false, session: undefined };
    await expect(bearerFrom(() => source, noPause)).rejects.toBeInstanceOf(
      TokenUnavailable,
    );
  });

  it("makes no call when a session cannot mint a token", async () => {
    for (const getToken of [
      () => Promise.resolve(null),
      () => Promise.resolve(""),
      () => Promise.reject(new Error("offline")),
    ]) {
      const source: TokenSource = { loaded: true, session: { getToken } };
      await expect(bearerFrom(() => source, noPause)).rejects.toBeInstanceOf(
        TokenUnavailable,
      );
    }
  });

  it("sends no header when the provider has loaded with nobody signed in", async () => {
    for (const none of [null, undefined]) {
      const source: TokenSource = { loaded: true, session: none };
      expect(await bearerFrom(() => source, noPause)).toEqual({});
    }
  });
});
