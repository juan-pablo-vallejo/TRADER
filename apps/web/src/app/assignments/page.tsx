import { redirect } from "next/navigation";

// The Weekly Schedule took this screen's place (TASKS S6): an address kept in a bookmark or
// a note still opens the schedule.
export const dynamic = "force-dynamic";

export default function AssignmentsPage(): never {
  redirect("/schedule");
}
