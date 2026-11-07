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

  // Navigation
  navigation: "Office",
  menu: "Menu",
  roster: "Roster",
  profile: "Profile",

  // States every screen can be in
  loading: "Loading…",
  signInToContinue: "Sign in to continue.",
  notPermitted: "Not permitted.",
  requestFailed: "Request failed.",
  requestFailedHelp:
    "Nothing was saved. Try again; if it keeps failing, tell the office.",

  // Roster
  emptyRoster: "Nobody is on the roster yet.",
  addPerson: "Add a person",
  addToRoster: "Add to roster",
  name: "Name",
  role: "Role",
  status: "Status",
  hourlyRate: "Hourly rate",
  edit: "Edit",
  close: "Close",
  emailTaken: "Someone on this roster already has that email.",
  saveRole: "Save role",
  deactivate: "Deactivate",
  reactivate: "Reactivate",
  lastAdmin: "This is the last admin. Make someone else an admin first.",
  unchanged: "No change.",
  effectiveFrom: "Effective from",
  addRate: "Add rate",
  rateExists: "A rate already starts on that day. Pick another day.",
  badAmount: "Enter an amount like 25.00.",
  rateHistory: "Rate history",
  noRates: "No rate yet.",
  unpriced: "—",
  invited: "Invited",
  active: "Active",
  deactivated: "Deactivated",
  roles: { admin: "Admin", foreman: "Foreman", worker: "Worker" },

  // Profile
  contactPhone: "Contact phone",
  managedBySignIn: "Managed by your sign-in provider",
  save: "Save",
  saved: "Saved.",
} as const;
