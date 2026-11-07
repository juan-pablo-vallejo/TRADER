"use client";

// The query client and the tRPC client for the office (ARCHITECTURE, office web client). The
// transformer must match the server's: api trpc.ts is the home of that fact (JSON turns Dates
// into strings; superjson keeps them). A mismatch does not throw — it hands every screen a
// string where a Date was sent — so if one side changes, change both. The browser calls the
// same route handler the phone does, with its cookie; no server-side caller exists.
// Consumed by layout.tsx.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { useState, type ReactNode } from "react";
import superjson from "superjson";

import { TRPCProvider } from "./trpc";

import type { AppRouter } from "@trader/api";

// One client per browser, never at module scope on the server (it would be shared across
// requests) and not thrown away if React suspends during the first render (the vendor's note).
let browserQueryClient: QueryClient | undefined;

function makeQueryClient() {
  // An answer of UNAUTHORIZED or FORBIDDEN is a state the screen shows, not a transient.
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: "/api/trpc", transformer: superjson })],
    }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
