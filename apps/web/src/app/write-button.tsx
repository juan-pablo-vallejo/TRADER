// A button that writes (save, send, issue, invite): while its write is pending it keeps
// the act's own words with an ellipsis ("Save…"), is marked busy for a screen reader, and
// takes no second press. The outcome is said beside it, on the server's answer, by the
// screen that asked. The one rule for every office button that writes.
//
// Busy, it refuses the press itself rather than being disabled: a disabled button loses
// the focus, which would leave a keyboard user on the page, or outside an open panel.
// Refusing the click also refuses a form's submission, Enter in a field included.
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function WriteButton({
  pending,
  disabled = false,
  onClick,
  children,
  ...button
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-busy" | "aria-disabled"> & {
  pending: boolean;
  children: ReactNode;
}) {
  return (
    <button
      {...button}
      disabled={disabled}
      aria-busy={pending || undefined}
      aria-disabled={pending || undefined}
      onClick={(e) => {
        if (pending) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    >
      {children}
      {pending ? "…" : null}
    </button>
  );
}
