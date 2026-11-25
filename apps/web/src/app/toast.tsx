"use client";

// A toast: one line that says what was just done, with at most one action (Undo), gone by
// itself after a few seconds. It waits while the pointer or the focus is on it, so nobody
// loses the action while reaching for it. Announced politely. Consumed by the Schedule.
//
// Its action, once pressed, keeps the toast up and busy ("Undo…") until the screen gives
// it the outcome, which it then says in the same place: the person is looking there. An
// outcome that is a refusal stays until closed.
//
// Ctrl or Cmd+Z runs the action while the toast shows, unless the focus is in a field
// where those keys undo typing. When the focus has fallen to the page (the shift it was on
// is gone), it goes to the action; when the toast, or its action, goes while holding the
// focus, the focus goes to the page's heading, never nowhere. A modal panel makes the page
// behind it inert and covers it, so while one is open the toast is drawn inside it.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import controls from "./controls.module.css";
import styles from "./toast.module.css";

export const TOAST_MS = 7000;

// Where the toast is drawn: the last modal panel opened, or the page.
function host(): Element {
  const open = document.querySelectorAll("dialog[open]");
  return open.length > 0 ? open[open.length - 1]! : document.body;
}

// Fields where Ctrl or Cmd+Z undoes typing. A radio, a checkbox or a select has no typing
// to undo, so the keys are the toast's there.
const TYPED = new Set([
  "text",
  "search",
  "email",
  "tel",
  "url",
  "password",
  "number",
  "date",
  "time",
]);
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.tagName === "TEXTAREA") return true;
  return target instanceof HTMLInputElement && TYPED.has(target.type);
}

// The page's own heading, made focusable from a script only.
function toHeading(): void {
  const h1 = document.querySelector<HTMLElement>("main h1");
  if (h1 === null) return;
  if (!h1.hasAttribute("tabindex")) h1.tabIndex = -1;
  h1.focus();
}

export function Toast({
  text,
  action,
  onAction,
  busy = false,
  stays = false,
  onDone,
}: {
  text: string;
  // The one action, or none: a toast that only says what happened.
  action?: string;
  onAction?: () => void;
  // The action was pressed and its answer has not come: the toast waits, saying so.
  busy?: boolean;
  // A refusal: it waits to be closed rather than going by itself.
  stays?: boolean;
  onDone: () => void;
}) {
  const [held, setHeld] = useState(false);
  // A toast exists only after something was done in the browser, so the page is there.
  const [where, setWhere] = useState<Element | null>(() =>
    typeof document === "undefined" ? null : host(),
  );
  const button = useRef<HTMLButtonElement>(null);
  // Whether the focus is inside the toast: a node removed from the page fires no blur.
  const focused = useRef(false);
  const act = useRef(onAction);
  const waiting = useRef(busy);
  useEffect(() => {
    act.current = onAction;
    waiting.current = busy;
  }, [onAction, busy]);

  useEffect(() => {
    if (held || busy || stays) return;
    const timer = setTimeout(onDone, TOAST_MS);
    return () => clearTimeout(timer);
  }, [held, busy, stays, onDone]);

  // Follow a panel opening or closing while the toast shows.
  useEffect(() => {
    const watch = new MutationObserver(() => setWhere(host()));
    watch.observe(document.body, {
      subtree: true,
      attributeFilter: ["open"],
      childList: true,
    });
    return () => watch.disconnect();
  }, []);

  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() !== "z" ||
        !(e.ctrlKey || e.metaKey) ||
        e.shiftKey ||
        e.altKey
      )
        return;
      if (act.current === undefined || waiting.current || typing(e.target)) return;
      e.preventDefault();
      act.current();
    };
    document.addEventListener("keydown", keys);
    return () => document.removeEventListener("keydown", keys);
  }, []);

  // Focus that fell to the page goes to the action, so the keyboard reaches it in time.
  useEffect(() => {
    if (where === null) return;
    const active = document.activeElement;
    if (active === null || active === document.body) button.current?.focus();
  }, [where]);

  // The action gone while it held the focus: the heading takes it, until the screen puts
  // it somewhere better (the shift that came back).
  const hasAction = action !== undefined;
  useLayoutEffect(() => {
    if (!hasAction && focused.current) {
      focused.current = false;
      toHeading();
    }
  }, [hasAction]);
  useLayoutEffect(
    () => () => {
      if (focused.current) toHeading();
    },
    [],
  );

  if (where === null) return null;
  return createPortal(
    <div
      className={
        where === document.body ? styles.toast : `${styles.toast} ${styles.inPanel}`
      }
      role="status"
      data-toast
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => {
        focused.current = true;
        setHeld(true);
      }}
      onBlur={() => {
        focused.current = false;
        setHeld(false);
      }}
    >
      <span className="body">{text}</span>
      {action !== undefined && (
        <button
          ref={button}
          type="button"
          className={controls.secondary}
          aria-busy={busy || undefined}
          aria-disabled={busy || undefined}
          onClick={() => {
            if (!busy) onAction?.();
          }}
        >
          {action}
          {busy ? "…" : null}
        </button>
      )}
    </div>,
    where,
  );
}
