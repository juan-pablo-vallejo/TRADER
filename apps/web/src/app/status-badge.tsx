// A status as a badge, on the five tones of theme.css: neutral, active, done, attention,
// problem. Always an icon and a word beside the tint: the color alone says nothing to
// someone who cannot tell it apart. The icon is decoration and hidden from a screen
// reader, which reads the word. `FlagBadges` is the flags of an entry, a day or a cell, each
// in the catalog's word for it.
import styles from "./badge.module.css";
import { useStrings } from "./i18n";
import type { Catalog } from "./i18n/en";

export const TONES = ["neutral", "active", "done", "attention", "problem"] as const;
export type Tone = (typeof TONES)[number];

// One small mark per tone, drawn in the tone's ink.
const ICONS: Record<Tone, string> = {
  // A dot.
  neutral: "M8 5.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z",
  // A clock: a ring and its hands.
  active:
    "M8 2a6 6 0 1 1 0 12A6 6 0 0 1 8 2Zm0 1.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm.75 1.75v2.44l1.6 1.6-1.06 1.06L7.25 8.3V5.25h1.5Z",
  // A check.
  done: "M6.4 10.2 3.7 7.5 2.6 8.6l3.8 3.8 7-7-1.1-1.1-5.9 5.9Z",
  // A flag.
  attention: "M3.5 2h1.5v.75h7.5l-1.75 2.75L12.5 8.25H5V14H3.5V2Z",
  // A cross.
  problem:
    "m4.1 3 3.9 3.9L11.9 3 13 4.1 9.1 8l3.9 3.9-1.1 1.1L8 9.1 4.1 13 3 11.9 6.9 8 3 4.1 4.1 3Z",
};

export function StatusBadge({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`}>
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        aria-hidden="true"
        focusable="false"
      >
        <path d={ICONS[tone]} fill="currentColor" fillRule="evenodd" />
      </svg>
      {label}
    </span>
  );
}

export type Flag = keyof Catalog["reasonTags"];

// Why the office may want to look: one badge per flag, in the order given (the server's,
// which is the enum's). Nothing at all for no flags.
export function FlagBadges({ flags }: { flags: readonly Flag[] }) {
  const { t } = useStrings();
  if (flags.length === 0) return null;
  return (
    <span className={styles.badges}>
      {flags.map((flag) => (
        <StatusBadge key={flag} tone="attention" label={t.reasonTags[flag]} />
      ))}
    </span>
  );
}
