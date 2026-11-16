import { redirect } from "next/navigation";

// `/` opens the first destination (DESIGN, Layout): the Overview, what waits today.
export const dynamic = "force-dynamic";

export default function Home(): never {
  redirect("/overview");
}
