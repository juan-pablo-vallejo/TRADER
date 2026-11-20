// Errors from the phone reach Sentry through this file and no other. With no DSN in the
// build (`EXPO_PUBLIC_SENTRY_DSN` blank, as on a development machine) nothing is started
// and every function here does nothing: silent, never a failure of its own.
//
// Errors only. No tracing, no session tracking, no replay, no logs, no screenshot, no
// breadcrumbs, no failed-request capture, and no personal data switch; then, as the net
// under those, every event from JavaScript is rebuilt from an allow-list (report-event.ts).
// A crash in native code is reported by the platform's own SDK and does not pass that
// allow-list: it carries the device's model and system version and the native stack, and
// with the switches below nothing the app holds.
import * as Sentry from "@sentry/react-native";
import type { ComponentType } from "react";

import { BUILD, environment, sentryDsn } from "./config";
import { scrubEvent, screenTag } from "./report-event";
import type { Stage } from "./sync/failures";

export const reporting = sentryDsn !== null;

export function startReporting(): void {
  if (sentryDsn === null) return;
  Sentry.init({
    dsn: sentryDsn,
    environment: environment ?? "development",
    sendDefaultPii: false,
    maxBreadcrumbs: 0,
    tracesSampleRate: 0,
    enableAutoPerformanceTracing: false,
    enableAutoSessionTracking: false,
    enableCaptureFailedRequests: false,
    enableUserInteractionTracing: false,
    enableAppHangTracking: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    attachStacktrace: false,
    enableLogs: false,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: () => null,
    initialScope: { tags: { build: String(BUILD) } },
  });
}

// The screen a report is from. Called as the route changes.
export function reportScreen(pathname: string): void {
  if (!reporting) return;
  Sentry.setTag("screen", screenTag(pathname));
}

// A sync call that failed for a reason other than no connection (sync/failures.ts decides
// which, and that each is said once).
export function reportSyncFailure(stage: Stage, kind: string, error: unknown): void {
  if (!reporting) return;
  Sentry.captureException(error, {
    tags: { sync_stage: stage, sync_failure: kind },
    fingerprint: ["sync", stage, kind],
  });
}

// The root layout, wrapped as Sentry asks, only where reporting is on.
export const withReporting = <P extends Record<string, unknown>>(
  component: ComponentType<P>,
): ComponentType<P> => (reporting ? Sentry.wrap(component) : component);
