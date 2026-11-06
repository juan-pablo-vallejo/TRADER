// The identity adapter seam at the HTTP edge (RULES: three thin seams). The development
// adapter is the only implementation until Clerk's (Stage 6) replaces it here; packages/api
// never sees a token.
import { createDevIdentityAdapter, type IdentityAdapter } from "@trader/api";

export const webIdentity: IdentityAdapter = createDevIdentityAdapter();
