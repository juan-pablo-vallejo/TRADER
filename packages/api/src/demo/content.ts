// The synthetic company (TASKS, Stage 4: demo fixture), as data. A clean baseline that renders
// well on every office screen, plus one instance of each abnormal scenario the Stage 4 screens
// need, each stated with the answer and the approval reasons the API is expected to give.
// Nothing here is a real person, address or domain: `.invalid` is reserved (RFC 2606), and the
// coordinates are a point in Providence used only as a job's place. Consumed by demo/run.ts.
import type { SeedCompany } from "@trader/db";

import type { ApprovalReason } from "../sync/reasons";
import { addDays } from "./ids";

export const DEMO: SeedCompany = {
  companyId: "019a4a00-0000-7000-8000-00000000de30",
  companyName: "Demo Painting Co.",
  timezone: "America/New_York",
  adminEmail: "office@demo.invalid",
  adminName: "Dana Ortiz",
};

export type Role = "admin" | "foreman" | "worker";

export type Persona = {
  key: string;
  name: string;
  email: string;
  // The sign-in number every invitation carries: +1 401 555 01xx, from the range kept for
  // fiction, so none is anyone's.
  phone: string;
  role: Role;
  // Which crew's labor they record; the invitation-only persona records none.
  crew: "a" | "b" | null;
};

// Emails are lower case already: the development subject is `dev:` + the lower-cased email
// (ARCHITECTURE, development sign-in), and the browser's sign-in must find the rows these
// callers bind.
export const PEOPLE: readonly Persona[] = [
  {
    key: "luis",
    name: "Luis Herrera",
    email: "luis.herrera@demo.invalid",
    phone: "+14015550101",
    role: "foreman",
    crew: "a",
  },
  {
    key: "marcus",
    name: "Marcus Bell",
    email: "marcus.bell@demo.invalid",
    phone: "+14015550102",
    role: "foreman",
    crew: "b",
  },
  {
    key: "ana",
    name: "Ana Ruiz",
    email: "ana.ruiz@demo.invalid",
    phone: "+14015550103",
    role: "worker",
    crew: "a",
  },
  {
    key: "tom",
    name: "Tom Nguyen",
    email: "tom.nguyen@demo.invalid",
    phone: "+14015550104",
    role: "worker",
    crew: "a",
  },
  {
    key: "priya",
    name: "Priya Shah",
    email: "priya.shah@demo.invalid",
    phone: "+14015550105",
    role: "worker",
    crew: "a",
  },
  {
    key: "omar",
    name: "Omar Haddad",
    email: "omar.haddad@demo.invalid",
    phone: "+14015550106",
    role: "worker",
    crew: "b",
  },
  {
    key: "elena",
    name: "Elena Petrov",
    email: "elena.petrov@demo.invalid",
    phone: "+14015550107",
    role: "worker",
    crew: "b",
  },
  {
    key: "sam",
    name: "Sam Carter",
    email: "sam.carter@demo.invalid",
    phone: "+14015550108",
    role: "worker",
    crew: null,
  },
];

export const CREWS = {
  a: { name: "Crew A — Herrera", foreman: "luis" },
  b: { name: "Crew B — Bell", foreman: "marcus" },
} as const;

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
  crew: "a" | "b" | null;
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
    crew: "a",
    status: "open",
  },
  {
    key: "j2",
    name: "Harbor View unit 4B",
    customer: "harbor",
    address: "200 Allens Ave, Providence, RI",
    location: null,
    crew: "b",
    status: "open",
  },
  {
    key: "j3",
    name: "Greenfield hallway repaint",
    customer: "greenfield",
    address: "55 School St, Seekonk, MA",
    location: null,
    crew: null,
    status: "open",
  },
  {
    key: "j4",
    name: "Whitmore garage",
    customer: "whitmore",
    address: "14 Elmgrove Ave, Providence, RI",
    location: null,
    crew: "a",
    status: "complete",
  },
  {
    key: "j5",
    name: "Harbor View lobby",
    customer: "harbor",
    address: "200 Allens Ave, Providence, RI",
    location: null,
    crew: "b",
    status: "complete",
  },
  {
    key: "j6",
    name: "Old Mill suite 200",
    customer: "oldmill",
    address: "9 Mill Rd, Pawtucket, RI",
    location: null,
    crew: null,
    status: "archived",
  },
];

// The job each crew records its days on.
export const CREW_JOB = { a: "j1", b: "j2" } as const;

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
  // captured, so it says so — captured offline — and carries `offline` (V1-D01: an entry that
  // claimed to be online that long ago would be flagged instead). The admin approves the
  // ordinary ones in a step of their own; the scenarios below stay pending.
  backlog: { reasons: ["offline"] as ApprovalReason[] },
  // Luis's second Thursday reached the office claiming an online capture, days after the
  // fact: the server's receipt comparison flags every event of it, at the time it claims.
  lateOnlineDay: { who: "luis", day: 8, reasons: ["clock_skewed"] as ApprovalReason[] },
  // Tom's last day is the one ordinary day the office has not approved yet.
  offlineDay: { who: "tom", day: 9, reasons: ["offline"] as ApprovalReason[] },
  // Omar forgot to clock out and set the time himself on the last day.
  userTimedEnd: {
    who: "omar",
    day: 9,
    reasons: ["offline", "user_timed"] as ApprovalReason[],
  },
  // Ana clocked in from the supply store on the last day: a kilometre outside J1's radius.
  outOfRadiusStart: {
    who: "ana",
    day: 9,
    reasons: ["offline", "location"] as ApprovalReason[],
  },
  // Priya's Wednesday of week one reached the office a day late: her phone was offline until
  // Thursday. Pushed before any later day of hers.
  lateOfflineDay: {
    who: "priya",
    day: 2,
    times: { started: "07:30", ended: "14:00" },
    reasons: ["offline"] as ApprovalReason[],
  },
  // The office corrects Elena's last clock-out from 15:30 to 16:00: an office event is
  // user-timed and unstamped, so it carries those reasons with `corrected`.
  repairedEnd: {
    who: "elena",
    day: 9,
    time: "16:00",
    reasons: ["corrected", "user_timed", "location"] as ApprovalReason[],
  },
  // Priya leaves after week one; Marcus steps down as foreman, so Crew B needs one.
  deactivatedWorker: "priya",
  demotedForeman: "marcus",
  // Old Mill's only job is archived, then the customer is deactivated.
  deactivatedCustomer: "oldmill",
} as const;

// Days the deactivated worker is absent before leaving: nothing of hers after week one.
export const PRIYA_LAST_DAY = 4;

// The week the office is planning: the one after the two recorded weeks, which with the
// default anchor is the week the demo is opened in. `days` are offsets from that Monday.
// Ordinary plans on a person's own crew's job, and one of each thing the office is shown
// when a plan does not let its person clock in: Tom and Elena planned on jobs that are not
// their crews' (J3 has no crew; J1 is crew A's and Elena is on crew B), and Priya planned
// before she is deactivated. A plan never changes any of that (V1-D07).
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
  crews: 2,
  crewMembers: PEOPLE.filter((p) => p.crew !== null).length,
  // Six people for ten days and Priya for four, four events each; her late day of two; one
  // office correction.
  events: 6 * 10 * 4 + 4 * 4 + 2 + 1,
  // Every pushed clock event and the correction.
  approvals: 6 * 10 * 4 + 4 * 4 + 2 + 1,
  // The ordinary backlog: every event flagged `offline` alone, Priya's late day included, but
  // Tom's last day's four. Omar's user-timed end and Ana's out-of-radius start carry a second
  // reason, Luis's claimed-online day is `clock_skewed`: they stay pending.
  decided: 6 * 10 * 4 + 4 * 4 + 2 - 2 - 4 - 4,
  // One row per planned person, job and day.
  assignments: PLANS.reduce((n, p) => n + p.days.length, 0),
} as const;

// What the run's labor comes to, worked out by hand from the plan above; run.ts reads
// `labor.hours` last and holds it to these, so a drifted rounding or approval rule fails the
// run. An ordinary day is 5 h, lunch, 3 h: 8.00 h. Hours are hundredths.
//
// Two days read through `labor.hours`: Priya's late day, approved, 07:30 to 14:00; and
// Elena's last, whose clock-out the office moved to 16:00 — 8.50 h, waiting with the
// correction, and nothing of the day approved meanwhile.
export const EXPECTED_HOURS = [
  { who: "priya", day: 2, job: "j1", approved: 650, pending: 0, pendingSessions: 0 },
  { who: "elena", day: 9, job: "j2", approved: 0, pending: 850, pendingSessions: 1 },
] as const;
