import { redirect } from "next/navigation";

// `/` opens the first destination: the week's schedule.
export const dynamic = "force-dynamic";

export default function Home(): never {
  redirect("/schedule");
}
