import { ProfileForm } from "./profile-form";
import { signInPath } from "../../server/identity-mode";

// Own profile (ARCHITECTURE, own profile): a dynamic server page rendering one client
// component, which reads and writes the caller's own record through the route handler.
export const dynamic = "force-dynamic";

export default function ProfilePage() {
  return <ProfileForm signInHref={signInPath(process.env)} />;
}
