import type { AppRouter } from "@trader/api";
import { createTRPCReact } from "@trpc/react-query";

/**
 * `AppRouter` is imported as a **type only** — importing it as a value would pull
 * the server, the database client and its drivers into the browser bundle.
 */
export const trpc = createTRPCReact<AppRouter>();
