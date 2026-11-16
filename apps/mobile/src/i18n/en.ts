import type { Catalog } from "./catalog";

export const en: Catalog = {
  appName: "TRADER",
  loading: "Loading…",
  retry: "Try again",
  signIn: {
    title: "Sign in",
    email: "Email",
    phone: "Your mobile number",
    sendCode: "Send me a code",
    codeSent: "We sent a code to your phone by text message.",
    code: "Code",
    changeNumber: "Use a different number",
    badPhone: "Enter your ten-digit mobile number.",
    badCode: "That code did not work. Check it, or ask for a new one.",
    submit: "Sign in",
    failed: "That did not work. Check your connection and try again.",
    notOnRoster: "Nobody on a roster signs in with that. Ask the office.",
    unavailable: "Sign-in is not part of this build yet.",
    developmentOnly: "Development sign-in. It is not in a release build.",
  },
  tabs: { today: "Today", week: "Schedule", settings: "Settings" },
  today: {
    title: "Today",
    jobs: "Your jobsites",
    noJobs: "No jobsite is yours yet. Ask the office.",
    firstLoad: "This phone has not loaded your jobsites yet. Connect and try again.",
    off: "You are off the clock.",
    working: (job, since) => `On the clock at ${job} since ${since}.`,
    paused: (job) => `On a break at ${job}.`,
    clockIn: "Clock in",
    clockInAt: (job) => `Clock in at ${job}`,
    clockOut: "Clock out",
    pause: "Start break",
    resume: "End break",
    switchTo: (job) => `Switch to ${job}`,
    hoursToday: (hours) => `${hours} worked today`,
    shiftNow: (job, start, end) => `Your shift: ${job}, ${start}–${end}.`,
    shiftLater: (job, start) =>
      `Your next shift is at ${job} at ${start}. You can clock in 15 minutes before.`,
    noMoreShifts: "You have no more shifts today.",
    noShift: "You have no shift today. Ask the office.",
    undecided:
      "The office has to settle today's schedule before you can clock in. Ask the office.",
    attention: "Needs attention",
  },
  entry: {
    types: {
      started: "Clock in",
      paused: "Break started",
      resumed: "Break ended",
      ended: "Clock out",
    },
    unsent: "Saved on this phone. It will be sent when there is a connection.",
    review: "Sent. The office has to approve it before it counts.",
    reviewUnscheduled:
      "Sent. It was outside your schedule, so the office has to approve it before it counts.",
    reviewClock:
      "Sent. This phone's clock looked wrong, so the office has to approve it before it counts.",
    refused: "The office's system did not accept this entry.",
    refusals: {
      not_scheduled:
        "You had no shift at that jobsite then. Ask the office to add your hours.",
      time_in_future:
        "This phone's clock was ahead. Set the time automatically and ask the office to add your hours.",
      session_already_open:
        "You were already on the clock. Ask the office to check your hours.",
      no_open_session:
        "You were not on the clock then. Ask the office to check your hours.",
      not_permitted: "You are not on that jobsite. Ask the office to add your hours.",
      other: (code) => `Ask the office to add your hours. Tell them: ${code}.`,
    },
  },
  sync: {
    upToDate: "Everything is sent.",
    unsent: (count) =>
      count === 1 ? "1 entry not sent yet." : `${count} entries not sent yet.`,
    offline: "No connection. Your entries are saved on this phone.",
    working: "Sending…",
    paused:
      "Sending is paused by the office's system. Your entries are saved on this phone.",
    readOnly: "Sending is paused for now. Your entries are saved on this phone.",
    updateRequired: "Update the app to send your entries. They are saved on this phone.",
    signInAgain: "Sign in again to send your entries. They are saved on this phone.",
    wrongClock:
      "This phone's clock looks wrong. Set the time automatically in the phone's settings.",
    now: "Send now",
  },
  week: {
    title: "Schedule",
    updated: (age) => `Updated ${age}.`,
    never: "Not loaded on this phone yet.",
    stale: "This may be out of date. Connect to check it.",
    refresh: "Check now",
    empty: "You have no shifts in the next two weeks.",
    today: "Today",
    clockInFrom: (start, end) => `Clock in ${start}–${end}`,
    undecided: "The office has to settle this day's overlapping shifts.",
    hours: "Your hours",
    noHours: "No hours in the last two weeks.",
    open: "On the clock",
    waiting: "Waiting for the office",
  },
  age: {
    justNow: "just now",
    minutes: (n) => (n === 1 ? "1 minute ago" : `${n} minutes ago`),
    hours: (n) => (n === 1 ? "1 hour ago" : `${n} hours ago`),
    days: (n) => (n === 1 ? "1 day ago" : `${n} days ago`),
  },
  settings: {
    title: "Settings",
    signedInAs: (name) => `Signed in as ${name}`,
    language: "Language",
    english: "English",
    spanish: "Español",
    signOut: "Sign out",
    unsentKept: (count) =>
      count === 1
        ? "1 entry has not been sent. It stays on this phone and is sent when you sign in again."
        : `${count} entries have not been sent. They stay on this phone and are sent when you sign in again.`,
  },
};
