// Every string a worker reads, as one typed shape (every such string goes
// through the i18n layer with English and Spanish entries). A catalog is a plain object of
// this type, so a key missing from either language does not compile, and a test holds the
// two to the same keys with nothing left blank (test/i18n.test.ts). No library: two objects.
export type Catalog = {
  appName: string;
  loading: string;
  retry: string;
  // The sign-in screen (ui/phone-sign-in.tsx, sign-in-steps.ts). The same thing has the
  // same words as the office's form (apps/web/src/app/i18n, signInForm).
  signIn: {
    title: string;
    helper: string;
    address: string;
    send: string;
    sending: string;
    badAddress: string;
    codeTitle: string;
    codeTexted: (number: string) => string;
    codeEmailed: (address: string) => string;
    code: string;
    checking: string;
    submit: string;
    resend: string;
    resendIn: (seconds: number) => string;
    change: string;
    notOnRoster: string;
    codeWrong: string;
    codeExpired: string;
    tooMany: string;
    locked: string;
    failed: string;
    trouble: string;
    troubleNoCode: string;
    troubleNewPhone: string;
    troubleNeverInvited: string;
    // The Demo company's way in, with no text message.
    demo: string;
    demoHelp: string;
    demoPhone: string;
    demoCode: string;
    demoSubmit: string;
    badDemo: string;
    back: string;
    // A build with no way to sign in yet: said, never an empty screen.
    unavailable: string;
    // The development stand-in for the provider (sign-in-provider.ts): never in a release.
    developmentOnly: string;
  };
  tabs: { today: string; week: string; crew: string; settings: string };
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
    // The rebuilt screen (item 8): one card, one button.
    shiftHours: (start: string, end: string) => string;
    onTheClock: string;
    onBreak: string;
    since: (time: string) => string;
    switchJob: string;
    switchTitle: string;
    // Clock out asks once, in a sheet that names the job and the time worked.
    clockOutTitle: string;
    clockOutBody: (hours: string, job: string) => string;
    keepWorking: string;
    // A session still open from an earlier day.
    earlier: (job: string, day: string) => string;
    clockOutNow: string;
    callOffice: string;
    // Said by a screen reader when a tap has been saved; the mark itself is a check.
    captured: string;
    // The job, opened from its card.
    job: {
      address: string;
      noAddress: string;
      openMaps: string;
      notes: string;
      noNotes: string;
      close: string;
    };
  };
  entry: {
    types: { started: string; paused: string; resumed: string; ended: string };
    unsent: string;
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
    // The chip under a screen's title: where this phone's entries stand, in a word.
    chip: { sent: string; saved: string; sending: string; attention: string };
    // The sheet the chip opens.
    waitingTitle: string;
    nothingWaiting: string;
    close: string;
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
    // A day's total beside its name.
    dayTotal: (hours: string) => string;
    // Why the office may look at an entry, in words; `unscheduled` is above.
    flags: {
      offline: string;
      corrected: string;
      user_timed: string;
      location: string;
      clock_skewed: string;
    };
  };
  // Shift reminders: the phone's own notifications (reminders.tsx).
  reminders: {
    // One sentence of why, before the system's own question.
    why: string;
    turnOn: string;
    notNow: string;
    // In Me.
    label: string;
    on: string;
    off: string;
    refused: string;
    // Android's name for the kind of notification, in the system's settings.
    channel: string;
    startTitle: (job: string) => string;
    startBody: (time: string) => string;
    endTitle: (job: string) => string;
    endBody: (time: string) => string;
  };
  // The Crew tab: admins only, online only.
  crew: {
    title: string;
    offline: string;
    empty: string;
    refresh: string;
    byPerson: string;
    byJob: string;
    status: {
      working: string;
      break: string;
      late: string;
      expected: string;
      done: string;
    };
    noShift: string;
    earlierTitle: string;
    earlierRow: (job: string, day: string) => string;
    addAny: string;
    person: {
      shifts: string;
      noShifts: string;
      at: (job: string) => string;
      call: string;
      noPhone: string;
      add: string;
      move: string;
      close: string;
    };
    form: {
      who: string;
      job: string;
      noJobs: string;
      start: string;
      end: string;
      earlier: (what: string) => string;
      later: (what: string) => string;
      addTitle: string;
      addSave: string;
      added: string;
      moveTitle: (name: string) => string;
      moveFrom: (time: string) => string;
      moveEndKept: (time: string) => string;
      moveTell: string;
      moveSave: string;
      moved: string;
      cancel: string;
      pickPerson: string;
      pickJob: string;
    };
    refusal: {
      overlap: string;
      inactive: string;
      archived: string;
      sameJob: string;
      started: string;
      failed: string;
    };
    job: {
      here: string;
      nobodyHere: string;
      scheduled: string;
      located: string;
      notLocated: string;
      setLocation: string;
      confirmTitle: string;
      confirmBody: (job: string) => string;
      confirm: string;
      locating: string;
      noFix: string;
      set: string;
    };
  };
  age: {
    justNow: string;
    minutes: (n: number) => string;
    hours: (n: number) => string;
    days: (n: number) => string;
  };
  settings: {
    title: string;
    language: string;
    english: string;
    spanish: string;
    signOut: string;
    unsentKept: (count: number) => string;
    // Me: the person's own name and contact phone, and the build they are on.
    name: string;
    phone: string;
    phoneHelp: string;
    save: string;
    saved: string;
    saveFailed: string;
    build: (build: string) => string;
    // A staging build only: the answer to a long press on the build's number.
    testReportSent: string;
  };
};

export const LANGUAGES = ["en", "es"] as const;
export type Language = (typeof LANGUAGES)[number];
