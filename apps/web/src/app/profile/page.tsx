import { devIdentityEnabled } from "@trader/api";

import { ProfileForm } from "./profile-form";

// Own profile (ARCHITECTURE, own profile): a dynamic server page rendering one client
// component, which reads and writes the caller's own record through the route handler.
export const dynamic = "force-dynamic";

export default function ProfilePage() {
  return <ProfileForm devSignIn={devIdentityEnabled(process.env)} />;
}
