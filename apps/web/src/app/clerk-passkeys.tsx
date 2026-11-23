"use client";

// Passkeys in the office: the offer on Today right after a person signed in by code, and
// the list in Settings where one is added or removed. A passkey is the device's own lock
// (Touch ID, Face ID, Windows Hello, a phone) signing the person in without a code; Clerk
// holds the public half and the device the rest. Clerk asks for a sign-in within the last
// ten minutes before one is added or removed (passkey-rules.ts): the offer is made only
// inside that time, and outside it the screen says to sign in again and offers to.
//
// Rendered only inside Clerk's provider, so only where Clerk is this server's identity:
// today-screen.tsx and me-form.tsx choose by `useClerkOn`, as account.tsx does.
import { useClerk, useSession, useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { signInFrom } from "../server/sign-in-paths";
import controls from "./controls.module.css";
import { useStrings } from "./i18n";
import { Note } from "./note";
import {
  offersPasskey,
  PASSKEY_OFFER_DECLINED,
  PASSKEY_OFFER_KEY,
  passkeyFailure,
  type PasskeyFailure,
} from "./passkey-rules";
import { DestructiveAction } from "./row-editor";
import styles from "./passkeys.module.css";

// What only the browser knows, and that does not change under a page.
const unchanging = () => () => undefined;
const canPasskey = () => typeof window.PublicKeyCredential === "function";
// A browser that keeps nothing (a private window, storage switched off) remembers no
// "Not now": the offer is made again there, which is the lesser fault.
const remembered = (): string | null => {
  try {
    return window.localStorage.getItem(PASSKEY_OFFER_KEY);
  } catch {
    return null;
  }
};

type Passkey = NonNullable<ReturnType<typeof useUser>["user"]>["passkeys"][number];

// The person's passkeys, and adding and removing one. Whatever fails is named
// (passkey-rules.ts) and said; nothing is thrown at the screen.
function usePasskeys() {
  const { t } = useStrings();
  const { user, isLoaded } = useUser();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<PasskeyFailure | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const act = async (step: () => Promise<unknown>, done: string): Promise<boolean> => {
    setBusy(true);
    setFailure(null);
    setSaved(null);
    try {
      await step();
      await user?.reload();
      setSaved(done);
      return true;
    } catch (error) {
      const named = passkeyFailure(error);
      // Left in the console for whoever is asked about it: the office has no error
      // reporting in the browser.
      if (named === "failed") console.error("a passkey could not be changed", error);
      setFailure(named);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return {
    ready: isLoaded && user !== null && user !== undefined,
    passkeys: user?.passkeys ?? [],
    add: () =>
      act(async () => {
        if (user === null || user === undefined) throw new Error("no one is signed in");
        await user.createPasskey();
      }, t.passkeys.added),
    remove: (passkey: Passkey) => act(() => passkey.delete(), t.passkeys.removed),
    busy,
    failure,
    saved,
  };
}

// What an attempt came to: the saved note, or why not, with the way on when Clerk wants
// a newer sign-in: signing out, to sign-in, and back to this screen.
function Outcome({
  failure,
  saved,
}: {
  failure: PasskeyFailure | null;
  saved: string | null;
}) {
  const { t } = useStrings();
  const clerk = useClerk();
  const here = usePathname();
  return (
    <>
      <Note
        text={failure !== null ? t.passkeys.failures[failure] : saved}
        tone={failure === null && saved !== null ? "saved" : undefined}
      />
      {failure === "sign_in_again" && (
        <button
          type="button"
          className={controls.secondary}
          onClick={() => void clerk.signOut({ redirectUrl: signInFrom(here) })}
        >
          {t.passkeys.signInAgain}
        </button>
      )}
    </>
  );
}

// Today's band: offered once to someone who has just signed in and has no passkey, in a
// browser that can make one. "Not now" is remembered in this browser and nowhere else.
export function PasskeyBand() {
  const { t } = useStrings();
  const p = t.passkeys;
  const { session } = useSession();
  const keys = usePasskeys();
  const supported = useSyncExternalStore(unchanging, canPasskey, () => false);
  // On the server, and until the browser has answered, the offer was "declined": the
  // band is never drawn and then taken away.
  const said = useSyncExternalStore(unchanging, remembered, () => PASSKEY_OFFER_DECLINED);
  const [closed, setClosed] = useState(false);
  const [added, setAdded] = useState(false);
  const offered =
    keys.ready &&
    offersPasskey({
      supported,
      passkeys: keys.passkeys.length,
      minutesSinceSignIn: session?.factorVerificationAge?.[0] ?? null,
      remembered: said,
    });
  if (closed || (!offered && !added)) return null;
  const notNow = () => {
    try {
      window.localStorage.setItem(PASSKEY_OFFER_KEY, PASSKEY_OFFER_DECLINED);
    } catch {
      // Nothing to remember it in: it is asked again next time.
    }
    setClosed(true);
  };
  return (
    <section className={`${controls.card} ${styles.band}`} aria-label={p.title}>
      {added ? (
        <p className="body" role="status">
          {p.added}
        </p>
      ) : (
        <>
          <p className="body">{p.offer}</p>
          <div className={controls.actions}>
            <button
              type="button"
              className={controls.primary}
              disabled={keys.busy}
              onClick={() => void keys.add().then((went) => setAdded(went))}
            >
              {p.add}
            </button>
            <button
              type="button"
              className={controls.secondary}
              disabled={keys.busy}
              onClick={notNow}
            >
              {p.notNow}
            </button>
          </div>
          <Outcome failure={keys.failure} saved={null} />
        </>
      )}
    </section>
  );
}

// Settings, Me: the person's passkeys, each with when it was added and last used, and
// Remove; and Add. Drawn by me-form.tsx under the person's own details.
export function PasskeySection({ className }: { className: string | undefined }) {
  const { t, f } = useStrings();
  const p = t.passkeys;
  const keys = usePasskeys();
  const supported = useSyncExternalStore(unchanging, canPasskey, () => true);
  if (!keys.ready) return null;
  return (
    <section aria-labelledby="settings-passkeys" className={className}>
      <h2 id="settings-passkeys" className="heading">
        {p.title}
      </h2>
      <p className="secondary">{p.explain}</p>
      {keys.passkeys.length === 0 ? (
        <p className="body">{p.none}</p>
      ) : (
        <ul className={styles.list}>
          {keys.passkeys.map((passkey) => {
            const name = passkey.name ?? p.unnamed;
            return (
              <li key={passkey.id}>
                <span className="body-strong">{name}</span>
                <span className="secondary">
                  {p.addedOn(f.dayOf(passkey.createdAt))},{" "}
                  {passkey.lastUsedAt === null
                    ? p.neverUsed
                    : p.lastUsed(f.dayOf(passkey.lastUsedAt))}
                </span>
                <DestructiveAction
                  label={p.remove}
                  effect={p.removeEffect(name)}
                  disabled={keys.busy}
                  onConfirm={() => void keys.remove(passkey)}
                />
              </li>
            );
          })}
        </ul>
      )}
      {supported ? (
        <button
          type="button"
          className={controls.secondary}
          disabled={keys.busy}
          onClick={() => void keys.add()}
        >
          {p.add}
        </button>
      ) : (
        <p className="secondary">{p.failures.unsupported}</p>
      )}
      <Outcome failure={keys.failure} saved={keys.saved} />
    </section>
  );
}
