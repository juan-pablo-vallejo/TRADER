import { ReconciliationScreen } from "./reconciliation-screen";
import { signInPath } from "../../server/identity-mode";

// Reconciliation (TASKS, Stage 4): a dynamic server page rendering one client component,
// which calls the API through the route handler like the phone does. `?period=<id>` names the
// pay period to open on (the pay-periods screen links here); anything that is not an id is
// ignored, and whether the id is a period the caller may read is the API's answer.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ReconciliationPage(props: PageProps<"/reconciliation">) {
  const { period } = await props.searchParams;
  return (
    <ReconciliationScreen
      signInHref={signInPath(process.env)}
      initialPeriod={typeof period === "string" && UUID.test(period) ? period : null}
    />
  );
}
