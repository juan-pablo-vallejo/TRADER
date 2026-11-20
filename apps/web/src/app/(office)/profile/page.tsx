import { redirect } from "next/navigation";

// The profile is a part of Settings now: an old link or bookmark lands there.
export default function ProfilePage() {
  redirect("/settings");
}
