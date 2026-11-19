"use client";

// The company's name in the header, from `company.get`: the name an admin keeps in Settings
// and the one an invoice prints. Absent while it loads and for anyone the API refuses (a
// worker has no office), so nothing is ever shown that the server did not say.
// Consumed by header.tsx.
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "./trpc";

export function CompanyName({ className }: { className: string }) {
  const trpc = useTRPC();
  const company = useQuery(trpc.company.get.queryOptions());
  if (!company.isSuccess) return null;
  return <span className={className}>{company.data.name}</span>;
}
