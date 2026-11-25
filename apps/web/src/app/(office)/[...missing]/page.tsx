import { notFound } from "next/navigation";

// Any address that is not a page: answered inside the office, so its header and menu stay
// and the person goes on from there (../not-found.tsx). An address that is not public is
// the office's already (server/sign-in-paths.ts).
export default function Missing() {
  notFound();
}
