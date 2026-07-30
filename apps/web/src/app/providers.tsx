"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { useState } from "react";
import superjson from "superjson";

import { trpc } from "@/lib/trpc";

/**
 * **The transformer must match the server's.** `packages/api/src/trpc.ts` is the
 * home of that fact and explains why superjson is there at all: JSON turns Dates
 * into strings, and Phase 1's sync layer is almost entirely about timestamps. A
 * mismatch here does not throw — it silently hands every client a string where a
 * Date was sent. If you change one side, change both.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  // Created in state, not at module scope: a module-level client would be shared
  // across every request in a server process and leak one user's cache to another.
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [httpBatchLink({ url: "/api/trpc", transformer: superjson })],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
