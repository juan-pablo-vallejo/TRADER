import { redirect } from "next/navigation";

// `/` opens the first destination (DESIGN, Layout): the office starts on its jobs, not on a
// page of links the navigation already shows.
export const dynamic = "force-dynamic";

export default function Home(): never {
  redirect("/jobs");
}
