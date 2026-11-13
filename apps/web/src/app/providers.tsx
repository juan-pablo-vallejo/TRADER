"use client";

// The query client and the tRPC client for the office (ARCHITECTURE, office web client). The
// transformer must match the server's: api trpc.ts is the home of that fact (JSON turns Dates
// into strings; superjson keeps them). A mismatch does not throw — it hands every screen a
// string where a Date was sent — so if one side changes, change both. The browser calls the
// same route handler the phone does, with its cookie; no server-side caller exists.
// Consumed by layout.tsx.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createContext, useContext, useState, type ReactNode } from "react";
import superjson from "superjson";

import { TRPCProvider } from "./trpc";

import type { AppRouter } from "@trader/api";

// One client per browser, never at module scope on the server (it would be shared across
// requests) and not thrown away if React suspends during the first render (the vendor's note).
let browserQueryClient: QueryClient | undefined;

function makeQueryClient() {
  // An answer of UNAUTHORIZED or FORBIDDEN is a state the screen shows, not a transient.
  // `networkMode: "always"`: the office is online-only (DESIGN, Layout). The library's default
  // pauses a request while the browser reports offline and sends it on reconnect, so a write
  // pressed with no signal would land minutes later, unannounced. Here it fails at once and
  // the screen says so; nothing is queued.
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, networkMode: "always" },
      mutations: { networkMode: "always" },
    },
  });
}

function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

// Whether Clerk's provider is around the office (layout.tsx): Clerk's hooks throw outside
// it, so the components that use them (clerk-session.tsx) are drawn only when this is true.
const ClerkOn = createContext(false);
export const useClerkOn = () => useContext(ClerkOn);

export function Providers({ children, clerk }: { children: ReactNode; clerk: boolean }) {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      // `maxItems` is the server's batch cap (server/handler.ts, MAX_BATCH_SIZE): a larger
      // set of calls is split into several requests instead of being refused.
      links: [httpBatchLink({ url: "/api/trpc", transformer: superjson, maxItems: 10 })],
    }),
  );
  return (
    <ClerkOn value={clerk}>
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          {children}
        </TRPCProvider>
      </QueryClientProvider>
    </ClerkOn>
  );
}
