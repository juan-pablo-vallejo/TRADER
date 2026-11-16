// The header a call carries for the identity provider's session, decided apart from the
// provider's own module so it is tested with nothing native beneath it (session.tsx is the
// consumer). Three cases the server must never be left to tell apart by a 401:
//   - the provider has not finished loading (every launch, for a moment): wait for it;
//   - it has a session and cannot mint a token now (no network): the call is not made;
//   - it has loaded and holds no session: nobody is signed in there, and the call goes with
//     no header, so the server's 401 is the true answer and the app asks for a sign-in.
// Sending no header in the first two made the server answer 401 to a signed-in person, and
// the app said "sign in again" (seen 2026-11-16 on a relaunch).
export type TokenSource = {
  loaded: boolean;
  session: { getToken: () => Promise<string | null> } | null | undefined;
};

export class TokenUnavailable extends Error {
  override name = "TokenUnavailable";
}

const LOAD_WAIT_MS = 100;
const LOAD_TRIES = 50;

export async function bearerFrom(
  source: () => TokenSource,
  pause: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<Record<string, string>> {
  for (let i = 0; i < LOAD_TRIES && !source().loaded; i++) await pause(LOAD_WAIT_MS);
  const { loaded, session } = source();
  if (!loaded) throw new TokenUnavailable("the identity provider has not loaded");
  if (session === null || session === undefined) return {};
  let token: string | null;
  try {
    token = await session.getToken();
  } catch {
    throw new TokenUnavailable("no token could be made");
  }
  if (typeof token !== "string" || token === "") {
    throw new TokenUnavailable("no token could be made");
  }
  return { Authorization: `Bearer ${token}` };
}
