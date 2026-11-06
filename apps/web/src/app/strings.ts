// The office's English strings, in one module until the message catalog (TASKS, Stage 5)
// exists; DESIGN wants office English through the same catalog as the crew app, so this file
// is what moves there. Nothing crew-facing lives here.
export const strings = {
  wordmark: "TRADER",
  markAlt: "D Sierra Painting",
  empty: "Nothing to show yet.",
  devSignIn: "Development sign-in",
  devSignInBadEmail: "Enter an email address.",
  email: "Email",
  signIn: "Sign in",
  signOut: "Sign out",
} as const;
