// Next's start-up hooks. register() runs once when a server instance starts, before it
// serves a request, and not while building (verified against `next build` with no variable
// set; RULES: nothing throws at module load or breaks the build). Next compiles this file
// for the edge runtime as well, so everything it does lives in server/start.ts and is
// imported only inside the Node check, which the bundler follows.
import type { Instrumentation } from "next";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { start } = await import("./server/start");
    await start(process.env);
  }
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { reportRequestError } = await import("./server/start");
    await reportRequestError(process.env, ...args);
  }
};
