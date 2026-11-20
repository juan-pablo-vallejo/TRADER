// What a screen shows when its query fails: UNAUTHORIZED
// and FORBIDDEN are states, drawn as the empty state; anything else is the attention banner.
// A refused caller is offered this server's sign-in (identity-mode.ts) — or, where a Clerk
// session exists and the API still knows nobody, told so (clerk-session.tsx).
// Consumed by every office screen.
import { ClerkRefused } from "./clerk-session";
import controls from "./controls.module.css";
import { EmptyState } from "./empty-state";
import { useClerkOn } from "./providers";
import { useStrings } from "./i18n";

export { EmptyState };

export const codeOf = (error: unknown): string | undefined =>
  (error as { data?: { code?: string } } | null)?.data?.code;

// `onRetry` refetches the query that failed: a failed read changed nothing, so the screen says
// so and offers the one useful step.
export function Failure({
  error,
  signInHref,
  onRetry,
}: {
  error: unknown;
  signInHref: string;
  onRetry?: () => void;
}) {
  const { t } = useStrings();
  const clerk = useClerkOn();
  const code = codeOf(error);
  if (code === "UNAUTHORIZED") {
    if (clerk) return <ClerkRefused />;
    return (
      <EmptyState
        text={t.signInToContinue}
        action={<a href={signInHref}>{t.signIn}</a>}
      />
    );
  }
  if (code === "FORBIDDEN") return <EmptyState text={t.notPermitted} />;
  return (
    <div className={controls.banner} role="alert">
      <p className="body-strong">{t.loadFailed}</p>
      <p className="secondary">{t.loadFailedHelp}</p>
      {onRetry !== undefined && (
        <button type="button" className={controls.secondary} onClick={onRetry}>
          {t.tryAgain}
        </button>
      )}
    </div>
  );
}
