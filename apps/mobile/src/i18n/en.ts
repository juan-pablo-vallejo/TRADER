import type { Catalog } from "./catalog";

export const en: Catalog = {
  appName: "TRADER",
  loading: "Loading…",
  retry: "Try again",
  signIn: {
    title: "Sign in",
    email: "Email",
    submit: "Sign in",
    failed: "That did not work. Check your connection and try again.",
    notOnRoster: "Nobody on a roster has that address. Ask the office.",
    unavailable: "Sign-in is not part of this build yet.",
    developmentOnly: "Development sign-in. It is not in a release build.",
  },
  tabs: { today: "Today", settings: "Settings" },
  today: {
    title: "Today",
    jobs: "Your jobsites",
    noJobs: "No jobsite is yours yet. Ask the office.",
    loadFailed: "This did not load. Nothing was changed.",
  },
  settings: {
    title: "Settings",
    signedInAs: (name) => `Signed in as ${name}`,
    language: "Language",
    english: "English",
    spanish: "Español",
    signOut: "Sign out",
  },
};
