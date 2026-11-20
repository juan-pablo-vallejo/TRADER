"use client";

// The keys of the office's tables and grids, in one listener for the whole office. Every
// `DataTable` and the schedule's grid mark themselves `data-keys`; the arrow keys, or J
// and K, move the real focus through what their rows already offer (row-keys.ts), so the
// focus ring is the browser's own and Enter or Space opens what a click would. Escape
// closing a panel and handing the focus back is the panel's own doing (side-panel.tsx).
//
// A key never acts while a field has the focus, nor with a modifier held. J and K enter
// the screen's table from anywhere; the arrow keys act only once the focus is in a table,
// since elsewhere they scroll the page. While a panel is open the keys stay inside it.
// `?` lists the keys, and so does the account menu, for a pointer. Mounted by the office's
// layout.
import { useEffect, useState } from "react";

import { useStrings } from "./i18n";
import { directionOf, isField, move, type Place } from "./row-keys";
import { SidePanel } from "./side-panel";
import styles from "./keyboard-rows.module.css";

// The account menu's entry asks for the list by this event.
export const KEYS_HELP_EVENT = "trader:keys-help";

// The list `?` opens: each key by the name on its cap, and which sentence says what it does.
export const KEYS = [
  [["↓", "J"], "next"],
  [["↑", "K"], "previous"],
  [["←", "→"], "along"],
  [["Enter", "Space"], "open"],
  [["Esc"], "close"],
  [["Tab"], "tab"],
  [["?"], "help"],
] as const;

const STOP = "a[href], button:not(:disabled)";
const shown = (el: Element) => el instanceof HTMLElement && el.offsetParent !== null;

// A table's stops as the page holds them now: for each row, each cell's stops.
function stopsOf(table: Element): HTMLElement[][][] {
  return [...table.querySelectorAll("tbody > tr")]
    .filter(shown)
    .map((row) =>
      [...row.children].map((cell) =>
        shown(cell) ? [...cell.querySelectorAll<HTMLElement>(STOP)].filter(shown) : [],
      ),
    );
}

function placeOf(stops: HTMLElement[][][], el: Element): Place | null {
  for (const [row, cells] of stops.entries()) {
    for (const [cell, held] of cells.entries()) {
      const stop = held.findIndex((s) => s === el);
      if (stop !== -1) return { row, cell, stop };
    }
  }
  return null;
}

export function KeyboardRows() {
  const { t } = useStrings();
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const open = () => setHelp(true);
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const active = document.activeElement;
      if (isField(active)) return;
      const dialog = document.querySelector("dialog[open]");
      if (event.key === "?" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (dialog !== null) return;
        event.preventDefault();
        setHelp(true);
        return;
      }
      const inside = active?.closest("[data-keys]") ?? null;
      // Space opens a link as it presses a button: a row's page is a link.
      if (event.key === " " && inside !== null && active instanceof HTMLAnchorElement) {
        event.preventDefault();
        active.click();
        return;
      }
      const direction = directionOf(event);
      if (direction === null) return;
      const letter = event.key.length === 1;
      // The arrows belong to the page until the focus is in a table.
      if (inside === null && !letter) return;
      const scope = dialog ?? document;
      const table = inside ?? [...scope.querySelectorAll("[data-keys]")].find(shown);
      if (table === undefined || (dialog !== null && !dialog.contains(table))) return;
      const stops = stopsOf(table);
      const at = inside === null || active === null ? null : placeOf(stops, active);
      const next = move(
        stops.map((row) => row.map((cell) => cell.length)),
        at,
        direction,
      );
      if (next === null) {
        // At the edge: the key is still the table's, so the page does not jump.
        if (at !== null) event.preventDefault();
        return;
      }
      event.preventDefault();
      stops[next.row]?.[next.cell]?.[next.stop]?.focus();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener(KEYS_HELP_EVENT, open);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener(KEYS_HELP_EVENT, open);
    };
  }, []);
  if (!help) return null;
  return (
    <SidePanel title={t.keys.title} onClose={() => setHelp(false)}>
      <p className="secondary">{t.keys.explain}</p>
      <dl className={styles.keys}>
        {KEYS.map(([keys, does]) => (
          <div key={does}>
            <dt>
              {keys.map((key) => (
                <kbd key={key}>{key === "Space" ? t.keys.space : key}</kbd>
              ))}
            </dt>
            <dd className="body">{t.keys.does[does]}</dd>
          </div>
        ))}
      </dl>
    </SidePanel>
  );
}
