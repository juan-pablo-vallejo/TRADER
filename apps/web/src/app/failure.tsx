// What a screen shows when its query fails: UNAUTHORIZED
// and FORBIDDEN are states, drawn as the empty state; anything else is the attention banner.
// A refused caller is offered this server's sign-in (identity-mode.ts) — or, where a Clerk
// session exists and the API still knows nobody, told so (clerk-session.tsx).
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

// A read as the screens hold it (TanStack Query's result): a refresh that fails keeps the
// rows the read last had.
type Read = {
  isError: boolean;
  data: unknown;
  error: unknown;
  dataUpdatedAt: number;
  refetch: () => unknown;
};
const refused = (read: Read) =>
  ["UNAUTHORIZED", "FORBIDDEN"].includes(codeOf(read.error) ?? "");

// The read that leaves the screen nothing to show: one that failed before it ever had
// rows, or one the server refused (a session gone is not a stale list). The whole-screen
// Failure is for this one alone.
export function blocking<R extends Read>(reads: R[]): R | undefined {
  return reads.find((read) => read.isError && (read.data === undefined || refused(read)));
}

// A refresh that failed while the screen still holds rows: the rows stay, under one line
// that says they could not be refreshed and as of when they are, with Try again.
export function RefreshFailed({ reads }: { reads: Read[] }) {
  const { t, f } = useStrings();
  const failed = reads.find(
    (read) => read.isError && read.data !== undefined && !refused(read),
  );
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // The status region is on the page from the start and takes its words when a refresh
  // fails: a region inserted already holding them may not be announced.
  return (
    <div role="status" data-refresh-status>
      {failed !== undefined && (
        <p className={`secondary ${controls.note} ${controls.error}`} data-refresh-failed>
          {t.refreshFailed(f.clock(new Date(failed.dataUpdatedAt), zone))}{" "}
          <button
            type="button"
            className={controls.textAction}
            onClick={() =>
              reads.filter((read) => read.isError).forEach((read) => void read.refetch())
            }
          >
            {t.tryAgain}
          </button>
        </p>
      )}
    </div>
  );
}
