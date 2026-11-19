// The two sign-in routes, by name. No imports: the browser's bundle reads these too, and
// nothing of the server may follow them there. Consumed by identity-mode.ts, the layout and
// the Clerk session components.
export const DEV_SIGN_IN_PATH = "/dev-signin";
export const SIGN_IN_PATH = "/sign-in";

// Where a signed-in person lands: the office's first screen. `/` is the public homepage.
export const OFFICE_HOME = "/schedule";
