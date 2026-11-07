import { devIdentityEnabled } from "@trader/api";

import { CustomersScreen } from "./customers-screen";

// Customers (TASKS, Stage 4): a dynamic server page rendering one client component, which
// calls the API through the route handler like the phone does.
export const dynamic = "force-dynamic";

export default function CustomersPage() {
  return <CustomersScreen devSignIn={devIdentityEnabled(process.env)} />;
}
