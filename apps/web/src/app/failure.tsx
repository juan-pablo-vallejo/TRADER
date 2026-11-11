// What a screen shows when its query fails (ARCHITECTURE, office web client): UNAUTHORIZED
// and FORBIDDEN are states, drawn as the empty state; anything else is the attention banner.
// Consumed by every office screen.
import controls from "./controls.module.css";
import { strings } from "./strings";

export const codeOf = (error: unknown): string | undefined =>
  (error as { data?: { code?: string } } | null)?.data?.code;

export function EmptyState({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className={controls.empty}>
      <p className="body">{text}</p>
      {action}
    </div>
  );
}

// `onRetry` refetches the query that failed: a failed read changed nothing, so the screen says
// so and offers the one useful step.
export function Failure({
  error,
  devSignIn,
  onRetry,
}: {
  error: unknown;
  devSignIn: boolean;
  onRetry?: () => void;
}) {
  const code = codeOf(error);
  if (code === "UNAUTHORIZED") {
    return (
      <EmptyState
        text={strings.signInToContinue}
        action={devSignIn ? <a href="/dev-signin">{strings.devSignIn}</a> : undefined}
      />
    );
  }
  if (code === "FORBIDDEN") return <EmptyState text={strings.notPermitted} />;
  return (
    <div className={controls.banner} role="alert">
      <p className="body-strong">{strings.loadFailed}</p>
      <p className="secondary">{strings.loadFailedHelp}</p>
      {onRetry !== undefined && (
        <button type="button" className={controls.secondary} onClick={onRetry}>
          {strings.tryAgain}
        </button>
      )}
    </div>
  );
}
