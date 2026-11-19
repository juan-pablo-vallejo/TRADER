// The synthetic company, as data. A clean baseline that renders
// well on every office screen, plus one instance of each abnormal scenario the office screens
// need, each stated with the answer and the flags the API is expected to give.
// Nothing here is a real person, address or domain: `.invalid` is reserved (RFC 2606), and the
// coordinates are a point in Providence used only as a job's place. Consumed by demo/run.ts.
import type { SeedCompany } from "@trader/db";

import type { EntryFlag } from "../sync/reasons";
import { addDays } from "./ids";

export const DEMO: SeedCompany = {
  companyId: "019a4a00-0000-7000-8000-00000000de30",
  companyName: "Demo Painting Co.",
  timezone: "America/New_York",
  adminEmail: "office@demo.invalid",
  adminName: "Dana Ortiz",
};

export type Role = "admin" | "worker";

export type Persona = {
  key: string;
  name: string;
  email: string;
  // The sign-in number every invitation carries: +1 401 555 01xx, from the range kept for
  // fiction, so none is anyone's.
  phone: string;
  role: Role;
  // The job they record their days on; the invitation-only persona records none.
  job: "j1" | "j2" | null;
};

// Emails are lower case already: the development subject is `dev:` + the lower-cased email,
// and the browser's sign-in must find the rows these
// callers bind.
export const PEOPLE: readonly Persona[] = [
  {
    key: "luis",
    name: "Luis Herrera",
    email: "luis.herrera@demo.invalid",
    phone: "+14015550101",
    role: "worker",
    job: "j1",
  },
  {
    key: "marcus",
    name: "Marcus Bell",
    email: "marcus.bell@demo.invalid",
    phone: "+14015550102",
    role: "worker",
    job: "j2",
  },
  {
    key: "ana",
    name: "Ana Ruiz",
    email: "ana.ruiz@demo.invalid",
    phone: "+14015550103",
    role: "worker",
    job: "j1",
  },
  {
    key: "tom",
    name: "Tom Nguyen",
    email: "tom.nguyen@demo.invalid",
    phone: "+14015550104",
    role: "worker",
    job: "j1",
  },
  {
    key: "priya",
    name: "Priya Shah",
    email: "priya.shah@demo.invalid",
    phone: "+14015550105",
    role: "worker",
    job: "j1",
  },
  {
    key: "omar",
    name: "Omar Haddad",
    email: "omar.haddad@demo.invalid",
    phone: "+14015550106",
    role: "worker",
    job: "j2",
  },
  {
    key: "elena",
    name: "Elena Petrov",
    email: "elena.petrov@demo.invalid",
    phone: "+14015550107",
    role: "worker",
    job: "j2",
  },
  {
    key: "sam",
    name: "Sam Carter",
    email: "sam.carter@demo.invalid",
    phone: "+14015550108",
    role: "worker",
    job: null,
  },
];

export const CUSTOMERS = [
  {
    key: "whitmore",
    name: "Whitmore Residence",
    address: "14 Elmgrove Ave, Providence, RI",
    phone: "401-555-0114",
    email: null,
    notes: "Gate code at the side entrance.",
  },
  {
    key: "harbor",
    name: "Harbor View Condos",
    address: "200 Allens Ave, Providence, RI",
    phone: "401-555-0120",
    email: "manager@harborview.invalid",
    notes: "",
  },
  {
    key: "greenfield",
    name: "Greenfield Elementary",
    address: "55 School St, Seekonk, MA",
    phone: "",
    email: "facilities@greenfield.invalid",
    notes: "Work after 4 pm only.",
  },
  {
    key: "oldmill",
    name: "Old Mill Offices",
    address: "9 Mill Rd, Pawtucket, RI",
    phone: "",
    email: null,
    notes: "",
  },
] as const;

export type JobPlan = {
  key: string;
  name: string;
  customer: (typeof CUSTOMERS)[number]["key"];
  address: string;
  location: { lat: number; lng: number; radiusM: number } | null;
  status: "open" | "complete" | "archived";
};

// J1 is the located job: baseline stamps fall inside its radius; the out-of-radius scenario
// stamps a kilometre north of it. The other jobs have an address only (a stamp on a job with
// no place is never flagged; a missing one is).
export const JOBS: readonly JobPlan[] = [
  {
    key: "j1",
    name: "Whitmore exterior repaint",
    customer: "whitmore",
    address: "14 Elmgrove Ave, Providence, RI",
    location: { lat: 41.824, lng: -71.4128, radiusM: 150 },
    status: "open",
  },
  {
    key: "j2",
    name: "Harbor View unit 4B",
    customer: "harbor",
    address: "200 Allens Ave, Providence, RI",
    location: null,
    status: "open",
  },
  {
    key: "j3",
    name: "Greenfield hallway repaint",
    customer: "greenfield",
    address: "55 School St, Seekonk, MA",
    location: null,
    status: "open",
  },
  {
    key: "j4",
    name: "Whitmore garage",
    customer: "whitmore",
    address: "14 Elmgrove Ave, Providence, RI",
    location: null,
    status: "complete",
  },
  {
    key: "j5",
    name: "Harbor View lobby",
    customer: "harbor",
    address: "200 Allens Ave, Providence, RI",
    location: null,
    status: "complete",
  },
  {
    key: "j6",
    name: "Old Mill suite 200",
    customer: "oldmill",
    address: "9 Mill Rd, Pawtucket, RI",
    location: null,
    status: "archived",
  },
];

// A stamp inside J1's radius, one a kilometre north of it, and one near J2 (no place: unflagged).
export const STAMPS = {
  inside: { lat: 41.8241, lng: -71.4127, accuracyM: 12 },
  outside: { lat: 41.833, lng: -71.4128, accuracyM: 9 },
  harbor: { lat: 41.8012, lng: -71.4009, accuracyM: 15 },
} as const;

// Ten weekdays from the anchor Monday: two working weeks.
export const workDays = (anchor: string): string[] =>
  [0, 1, 2, 3, 4, 7, 8, 9, 10, 11].map((n) => addDays(anchor, n));

// An ordinary day: in at seven, half an hour's lunch, out at half past three.
export const BASELINE_TIMES = {
  started: "07:00",
  paused: "12:00",
  resumed: "12:30",
  ended: "15:30",
} as const;

// The abnormal scenarios, each once. Expected reasons are in the enum's order (sync/reasons.ts);
// run.ts compares every acknowledgement to them exactly, so a drifted rule fails the run.
export const SCENARIOS = {
  // The history is a backlog: every seeded clock event is delivered long after it was
  // captured, so it says so — captured offline — and carries `offline` (an entry that
  // claimed to be online that long ago would be flagged `clock_skewed` instead).
  backlog: { reasons: ["offline"] as EntryFlag[] },
  // Luis's second Thursday reached the office claiming an online capture, days after the
  // fact: the server's receipt comparison flags every event of it, at the time it claims.
  lateOnlineDay: { who: "luis", day: 8, reasons: ["clock_skewed"] as EntryFlag[] },
  // Omar forgot to clock out and set the time himself on the last day.
  userTimedEnd: {
    who: "omar",
    day: 9,
    reasons: ["offline", "user_timed"] as EntryFlag[],
  },
  // Ana clocked in from the supply store on the last day: a kilometre outside J1's radius.
  outOfRadiusStart: {
    who: "ana",
    day: 9,
    reasons: ["offline", "location"] as EntryFlag[],
  },
  // Priya's Wednesday of week one reached the office a day late: her phone was offline until
  // Thursday. Pushed before any later day of hers.
  lateOfflineDay: {
    who: "priya",
    day: 2,
    times: { started: "07:30", ended: "14:00" },
    reasons: ["offline"] as EntryFlag[],
  },
  // The office corrects Elena's last clock-out from 15:30 to 16:00: an office event is
  // user-timed and unstamped, so it carries those reasons with `corrected`.
  repairedEnd: {
    who: "elena",
    day: 9,
    time: "16:00",
    reasons: ["corrected", "user_timed", "location"] as EntryFlag[],
  },
  // Priya leaves after week one; Marcus joins the office as a second admin.
  deactivatedWorker: "priya",
  madeAdmin: "marcus",
  // Old Mill's only job is archived, then the customer is deactivated.
  deactivatedCustomer: "oldmill",
} as const;

// Days the deactivated worker is absent before leaving: nothing of hers after week one.
export const PRIYA_LAST_DAY = 4;

// The week the office is planning: the one after the two recorded weeks, which with the
// default anchor is the week the demo is opened in. `days` are offsets from that Monday.
// Ordinary plans on a person's own job, Tom and Elena each planned on a second job, and
// Priya planned before she is deactivated.
export const planWeek = (anchor: string): string[] =>
  [14, 15, 16, 17, 18].map((n) => addDays(anchor, n));

export const PLANS = [
  { who: "ana", job: "j1", days: [0, 1, 2, 3, 4], start: "07:00", end: "15:30" },
  { who: "omar", job: "j2", days: [0, 1, 2, 3, 4], start: "07:00", end: "15:30" },
  { who: "tom", job: "j1", days: [0, 1, 2], start: "07:00", end: "15:30" },
  { who: "tom", job: "j3", days: [3, 4], start: "16:00", end: "20:00" },
  { who: "elena", job: "j2", days: [0, 1], start: "07:00", end: "11:30" },
  { who: "elena", job: "j1", days: [0, 1], start: "12:30", end: "15:30" },
  { who: "priya", job: "j1", days: [0], start: "07:00", end: "15:30" },
] as const;

// What a complete run writes, by the plan above. The run reports what it wrote; the test holds
// both to these numbers.
export const EXPECTED = {
  users: 1 + PEOPLE.length,
  customers: CUSTOMERS.length,
  jobs: JOBS.length,
  // Six people for ten days and Priya for four, four events each; her late day of two; one
  // office correction.
  events: 6 * 10 * 4 + 4 * 4 + 2 + 1,
  // One row per planned person, job and day.
  assignments: PLANS.reduce((n, p) => n + p.days.length, 0),
} as const;

// What the run's labor comes to, worked out by hand from the plan above; run.ts reads
// `labor.hours` last and holds it to these, so a drifted rounding or flag rule fails the run.
// An ordinary day is 5 h, lunch, 3 h: 8.00 h. Hours are hundredths. Priya's late day, 07:30
// to 14:00; and Elena's last, whose clock-out the office moved to 16:00: 8.50 h, counted at
// once, the correction's flags beside the day's own.
export const EXPECTED_HOURS = [
  { who: "priya", day: 2, job: "j1", hundredths: 650, flags: ["offline"] },
  {
    who: "elena",
    day: 9,
    job: "j2",
    hundredths: 850,
    flags: ["offline", "corrected", "user_timed", "location"],
  },
] as const;
