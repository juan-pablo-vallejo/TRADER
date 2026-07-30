import type { AppRouter } from "@trader/api";
import { createTRPCReact } from "@trpc/react-query";

/**
 * `AppRouter` is imported as a **type only**. Without that, Metro follows the
 * import and tries to bundle the server — and its Postgres driver — into the
 * app. The `consistent-type-imports` lint rule exists to make that a build
 * error rather than a mystery at runtime.
 */
export const trpc = createTRPCReact<AppRouter>();

/**
 * Where the API lives.
 *
 * An iOS simulator shares the host's loopback, so `localhost` works there. A
 * physical device does not — it needs this Mac's address on the LAN, which is
 * why this is an env var rather than a constant. `EXPO_PUBLIC_` is the prefix
 * Expo inlines into the client bundle.
 */
export const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
