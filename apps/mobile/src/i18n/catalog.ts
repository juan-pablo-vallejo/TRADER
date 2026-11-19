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
    phone: string;
    sendCode: string;
    codeSent: string;
    code: string;
    changeNumber: string;
    badPhone: string;
    badCode: string;
    submit: string;
    failed: string;
    notOnRoster: string;
    // A build with no way to sign in yet: said, never an empty screen.
    unavailable: string;
    developmentOnly: string;
  };
  tabs: { today: string; week: string; settings: string };
  today: {
    title: string;
    jobs: string;
    noJobs: string;
    // Nothing has been pulled on this phone yet and the server cannot be reached.
    firstLoad: string;
    off: string;
    working: (job: string, since: string) => string;
    paused: (job: string) => string;
    clockIn: string;
    clockInAt: (job: string) => string;
    clockOut: string;
    pause: string;
    resume: string;
    switchTo: (job: string) => string;
    hoursToday: (hours: string) => string;
    // Under the weekly schedule.
    shiftNow: (job: string, start: string, end: string) => string;
    shiftLater: (job: string, start: string) => string;
    noMoreShifts: string;
    noShift: string;
    attention: string;
  };
  entry: {
    types: { started: string; paused: string; resumed: string; ended: string };
    unsent: string;
    // The server stored it and the office has to approve it before it counts.
    refused: string;
    refusals: {
      not_scheduled: string;
      time_in_future: string;
      session_already_open: string;
      no_open_session: string;
      not_permitted: string;
      other: (code: string) => string;
    };
  };
  sync: {
    upToDate: string;
    unsent: (count: number) => string;
    offline: string;
    working: string;
    paused: string;
    readOnly: string;
    updateRequired: string;
    signInAgain: string;
    wrongClock: string;
    now: string;
  };
  week: {
    title: string;
    updated: (age: string) => string;
    never: string;
    stale: string;
    refresh: string;
    empty: string;
    today: string;
    hours: string;
    noHours: string;
    open: string;
    unscheduled: string;
  };
  age: {
    justNow: string;
    minutes: (n: number) => string;
    hours: (n: number) => string;
    days: (n: number) => string;
  };
  settings: {
    title: string;
    signedInAs: (name: string) => string;
    language: string;
    english: string;
    spanish: string;
    signOut: string;
    unsentKept: (count: number) => string;
  };
};

export const LANGUAGES = ["en", "es"] as const;
export type Language = (typeof LANGUAGES)[number];
