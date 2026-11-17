// What a deployment answers somebody who sends it nothing: the status of `/api/ready` and,
// when it answers 200 with one, the commit it says it serves. The staging flow's first
// test asks this before anyone signs in (staging.spec.ts); test/e2e-readiness.test.ts
// holds it to a real request context against a local server.
//
// The body is read before the context that made the request is disposed. Disposing a
// context disposes its responses too: a status read afterwards still answers, a body read
// afterwards throws "Response has been disposed" — which is how the first promotion's
// suite failed, on a host that was serving the right commit.
import type { APIRequest } from "@playwright/test";

export type Readiness = { status: number; commit: string | null };

export async function askReadiness(
  request: APIRequest,
  baseURL: string,
): Promise<Readiness> {
  const outsider = await request.newContext({ baseURL });
  try {
    // Never followed: a wall's redirect is the answer, not the page behind it.
    const answered = await outsider.get("/api/ready", { maxRedirects: 0 });
    const status = answered.status();
    if (status !== 200) return { status, commit: null };
    // A 200 that is not the readiness answer names no commit, and matches none.
    const body: unknown = await answered.json().catch(() => null);
    const commit = (body as { commit?: unknown } | null)?.commit;
    return { status, commit: typeof commit === "string" ? commit : null };
  } finally {
    await outsider.dispose();
  }
}
