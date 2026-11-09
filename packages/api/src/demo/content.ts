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
    role: "foreman",
    crew: "a",
  },
  {
    key: "marcus",
    name: "Marcus Bell",
    email: "marcus.bell@demo.invalid",
    role: "foreman",
    crew: "b",
  },
  {
    key: "ana",
    name: "Ana Ruiz",
    email: "ana.ruiz@demo.invalid",
    role: "worker",
    crew: "a",
  },
  {
    key: "tom",
    name: "Tom Nguyen",
    email: "tom.nguyen@demo.invalid",
    role: "worker",
    crew: "a",
  },
  {
    key: "priya",
    name: "Priya Shah",
    email: "priya.shah@demo.invalid",
    role: "worker",
    crew: "a",
  },
  {
    key: "omar",
    name: "Omar Haddad",
    email: "omar.haddad@demo.invalid",
    role: "worker",
    crew: "b",
  },
  {
    key: "elena",
    name: "Elena Petrov",
    email: "elena.petrov@demo.invalid",
    role: "worker",
    crew: "b",
  },
  {
    key: "sam",
    name: "Sam Carter",
    email: "sam.carter@demo.invalid",
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

// Effective-dated rates in cents (RULES: integer minor units). One worker's rate changes on the
// anchor so the roster shows a history.
export const RATES = (anchor: string) =>
  [
    { who: "ana", effectiveFrom: addDays(anchor, -365), hourlyRateCents: 2800 },
    { who: "ana", effectiveFrom: anchor, hourlyRateCents: 3000 },
    { who: "tom", effectiveFrom: addDays(anchor, -365), hourlyRateCents: 2600 },
    { who: "priya", effectiveFrom: addDays(anchor, -365), hourlyRateCents: 2500 },
    { who: "omar", effectiveFrom: addDays(anchor, -365), hourlyRateCents: 2700 },
  ] as const;

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

// Receipts logged with the day's events (no approval reason). `day` is an index into
// workDays(); the day-2 receipt on J2 is the one the foreman amends after it is sealed.
export const RECEIPTS = [
  {
    who: "ana",
    day: 0,
    job: "j1",
    description: "Exterior acrylic, white, 5 gal",
    quantity: "2",
    unit: "pail",
  },
  {
    who: "omar",
    day: 1,
    job: "j2",
    description: "Eggshell interior, Harbor Grey",
    quantity: "3",
    unit: "gal",
  },
  {
    who: "tom",
    day: 3,
    job: "j1",
    description: "Painter's tape 1.5 in",
    quantity: "6",
    unit: "roll",
  },
  {
    who: "elena",
    day: 5,
    job: "j2",
    description: "Primer, stain blocking",
    quantity: "1",
    unit: "gal",
  },
  {
    who: "luis",
    day: 7,
    job: "j1",
    description: "Caulk, exterior, white",
    quantity: "12",
    unit: "tube",
  },
] as const;

export const AMENDED_RECEIPT = {
  original: RECEIPTS[1],
  amend: { description: "Eggshell interior, Harbor Grey", quantity: "4", unit: "gal" },
  note: "Fourth gallon on the same receipt.",
} as const;

// The abnormal scenarios, each once. Expected reasons are in the enum's order (sync/reasons.ts);
// run.ts compares every acknowledgement to them exactly, so a drifted rule fails the run.
export const SCENARIOS = {
  // Tom's phone had no signal on the last day: captured offline, synced the same evening.
  offlineDay: { who: "tom", day: 9, reasons: ["offline"] as ApprovalReason[] },
  // Omar forgot to clock out and set the time himself on the last day.
  userTimedEnd: { who: "omar", day: 9, reasons: ["user_timed"] as ApprovalReason[] },
  // Ana clocked in from the supply store on the last day: a kilometre outside J1's radius.
  outOfRadiusStart: { who: "ana", day: 9, reasons: ["location"] as ApprovalReason[] },
  // Priya's Wednesday of week one reached the office after that day's closeout: her phone was
  // offline until Thursday. Pushed after the closeout, before any later day of hers.
  lateOfflineDay: {
    who: "priya",
    day: 2,
    times: { started: "07:30", ended: "14:00" },
    reasons: ["offline", "after_closeout"] as ApprovalReason[],
  },
  // The office corrects Elena's last clock-out from 15:30 to 16:00: an office event is
  // user-timed and unstamped, so it carries those reasons with `corrected`.
  repairedEnd: {
    who: "elena",
    day: 9,
    time: "16:00",
    reasons: ["corrected", "user_timed", "location"] as ApprovalReason[],
  },
  // A receipt from Friday of week one, logged by Elena, pushed after that day's closeout.
  lateReceipt: {
    who: "elena",
    day: 4,
    job: "j2",
    time: "13:00",
    description: "Drop cloths, canvas",
    quantity: "4",
    unit: "each",
    reasons: ["after_closeout"] as ApprovalReason[],
  },
  // The amend of a sealed receipt is its own pending approval, `corrected`.
  amendedReceipt: { reasons: ["corrected"] as ApprovalReason[] },
  // Priya leaves after week one; Marcus steps down as foreman, so Crew B needs one.
  deactivatedWorker: "priya",
  demotedForeman: "marcus",
  // Old Mill's only job is archived, then the customer is deactivated.
  deactivatedCustomer: "oldmill",
  // The admin decides the first three pending approvals, oldest first.
  decisions: ["approved", "approved", "rejected"] as const,
} as const;

// Days the deactivated worker is absent before leaving: nothing of hers after week one.
export const PRIYA_LAST_DAY = 4;

// What a complete run writes, by the plan above. The run reports what it wrote; the test holds
// both to these numbers.
export const EXPECTED = {
  users: 1 + PEOPLE.length,
  customers: CUSTOMERS.length,
  jobs: JOBS.length,
  crews: 2,
  crewMembers: PEOPLE.filter((p) => p.crew !== null).length,
  payRates: 5,
  // Six people for ten days and Priya for four, four events each; her late day of two; one
  // office correction.
  events: 6 * 10 * 4 + 4 * 4 + 2 + 1,
  materials: RECEIPTS.length + 1,
  materialCorrections: 1,
  // Nine closed days on each crew's job.
  closeouts: 9 * 2,
  // Offline day 4, user-timed 1, out of radius 1, late day 2, correction 1, late receipt 1,
  // amend 1.
  approvals: 4 + 1 + 1 + 2 + 1 + 1 + 1,
  decided: 3,
} as const;
