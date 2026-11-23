// A staging session from a single-use sign-in ticket (tickets.ts), for the runs
// `scripts/staging.sh` starts by hand: look.shots.ts and invite.run.ts. The ticket is
// redeemed as staging.spec.ts redeems its own, and is never printed.
import type { Page } from "@playwright/test";

export async function signInByTicket(page: Page, ticket: string): Promise<boolean> {
  await page.goto("/sign-in");
  await page.waitForFunction(
    () => (window as unknown as { Clerk?: { loaded?: boolean } }).Clerk?.loaded === true,
    undefined,
    { timeout: 60_000 },
  );
  return page.evaluate(async (given): Promise<boolean> => {
    type Attempt = { status: string | null; createdSessionId: string | null };
    const clerk = (
      window as unknown as {
        Clerk: {
          client: { signIn: { create(p: Record<string, string>): Promise<Attempt> } };
          setActive(p: { session: string }): Promise<void>;
        };
      }
    ).Clerk;
    try {
      const attempt = await clerk.client.signIn.create({
        strategy: "ticket",
        ticket: given,
      });
      if (attempt.status !== "complete" || attempt.createdSessionId === null)
        return false;
      await clerk.setActive({ session: attempt.createdSessionId });
      return true;
    } catch {
      return false;
    }
  }, ticket);
}
