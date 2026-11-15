// Every string the crew reads, as one typed shape (RULES: every crew-facing string goes
// through the i18n layer with English and Spanish entries). A catalog is a plain object of
// this type, so a key missing from either language does not compile, and a test holds the
// two to the same keys with nothing left blank (test/i18n.test.ts). No library: two objects.
export type Catalog = {
  appName: string;
  loading: string;
  retry: string;
  signIn: {
    title: string;
    email: string;
    submit: string;
    failed: string;
    notOnRoster: string;
    // A build with no way to sign in yet: said, never an empty screen.
    unavailable: string;
    developmentOnly: string;
  };
  tabs: { today: string; settings: string };
  today: {
    title: string;
    jobs: string;
    noJobs: string;
    loadFailed: string;
  };
  settings: {
    title: string;
    signedInAs: (name: string) => string;
    language: string;
    english: string;
    spanish: string;
    signOut: string;
  };
};

export const LANGUAGES = ["en", "es"] as const;
export type Language = (typeof LANGUAGES)[number];
