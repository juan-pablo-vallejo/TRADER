import type { ReactNode } from "react";

import { SessionFrame } from "../session-frame";

// Sign-in's layout: the session frame, so Clerk's provider is around its form, and nothing
// drawn. No header, no menu: there is nothing to go to before a person is someone. The
// page draws its own surroundings (sign-in-frame.tsx), because this layout is also around
// the not-found screen /sign-in answers under the development identity.
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <SessionFrame>{children}</SessionFrame>;
}
