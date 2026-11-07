// The office's typed client (ARCHITECTURE, office web client): the TanStack React Query
// binding, which the vendor recommends for new projects over the classic `@trpc/react-query`.
// `AppRouter` is a type import only — a value import would pull the server and the database
// driver into the browser bundle, which the lint rule makes an error. Consumed by
// providers.tsx and every client component that calls the API.
import type { AppRouter } from "@trader/api";
import { createTRPCContext } from "@trpc/tanstack-react-query";

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
