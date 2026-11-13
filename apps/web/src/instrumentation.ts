// Next calls register() once when a server instance starts, before it serves a request, and
// not while building (verified against `next build` with no variable set; RULES: nothing
// throws at module load or breaks the build). A production server with a variable missing or
// malformed refuses to start here (deploy-env.ts); development and the tests start with
// whatever .env holds, as before.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;
  const { assertDeployEnv } = await import("./server/deploy-env");
  try {
    assertDeployEnv(process.env);
  } catch (error) {
    // Names only. Logged as well as thrown: a host may show the exit and not the reason.
    console.error((error as Error).message);
    throw error;
  }
}
