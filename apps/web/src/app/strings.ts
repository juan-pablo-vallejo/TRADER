// The office's English strings, in one module until the message catalog (TASKS, Stage 5)
// exists; DESIGN wants office English through the same catalog as the crew app, so this file
// is what moves there. Nothing crew-facing lives here.
export const strings = {
  wordmark: "TRADER",
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
  customers: "Customers",
  jobs: "Jobs",
  crews: "Crews",
  profile: "Profile",
  work: "Work",
  people: "People",

  // States every screen can be in
  loading: "Loading…",
  signInToContinue: "Sign in to continue.",
  notPermitted: "Not permitted.",
  requestFailed: "That didn't go through. Nothing was saved; try again.",
  loadFailed: "This page didn't load.",
  loadFailedHelp: "Nothing was changed. Check the connection and try again.",
  tryAgain: "Try again",
  pageError: "Something went wrong on this page.",
  pageErrorHelp:
    "Nothing was saved by the step that failed. Reload the page to carry on.",
  reload: "Reload",
  notFound: "There is no page at this address.",
  goToJobs: "Go to Jobs",
  cancel: "Cancel",

  // Editors and create forms
  details: "Details",
  location: "Location (optional)",
  leadsCrew: "Leads this crew",
  chooseForemanFirst: "Choose a foreman to add the crew.",

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
  deactivatePersonEffect: (name: string) =>
    `${name} will not be able to sign in or send hours from their phone. Hours the office already has stay on record.`,
  unchanged: "No change.",
  effectiveFrom: "Effective from",
  addRate: "Add rate",
  rateExists: "A rate already starts on that day. Pick another day.",
  badAmount: "Enter an amount like 25.00.",
  payRate: "Pay rate",
  rateHistory: "Rate history",
  noRates: "No rate yet.",
  unpriced: "—",
  invited: "Invited",
  active: "Active",
  deactivated: "Deactivated",
  roles: { admin: "Admin", foreman: "Foreman", worker: "Worker" },

  // Customers
  emptyCustomers: "No customers yet.",
  addCustomer: "Add customer",
  address: "Address",
  phone: "Phone",
  notes: "Notes",
  none: "—",
  jobsUnarchived: (n: number) =>
    `${n === 1 ? "1 of this customer's jobs is" : `${n} of this customer's jobs are`} not archived. Archive ${n === 1 ? "it" : "them"} first.`,
  deactivateCustomerEffect:
    "No new job can be added for this customer. Its past jobs stay.",

  // Crews
  emptyCrews: "No crews yet.",
  addCrew: "Add crew",
  crew: "Crew",
  foreman: "Foreman",
  members: "Members",
  chooseForeman: "Choose a foreman",
  choosePerson: "Choose a person",
  needsForeman: "Needs a foreman",
  changeForeman: "Change foreman",
  addMember: "Add member",
  remove: "Remove",
  deactivateCrew: "Deactivate crew",
  deactivateCrewEffect:
    "No job can be assigned to this crew, and its foreman can no longer record crew hours or close out its days.",
  removeMemberEffect: (name: string) =>
    `Hours ${name} recorded on this crew's jobs and has not synced yet will be refused when they arrive.`,
  userInactive: "That person is deactivated.",
  notAForeman: "The foreman must have the Foreman role.",
  reactivateCrewFirst: "Reactivate the crew first",
  changeForemanFirst: "Change the foreman first",
  jobsAssigned: (n: number) =>
    `${n === 1 ? "1 job is" : `${n} jobs are`} assigned to this crew. Reassign or archive ${n === 1 ? "it" : "them"} first.`,

  // Jobs
  emptyJobs: "No jobs to show.",
  addJob: "Add job",
  job: "Job",
  customer: "Customer",
  chooseCustomer: "Choose a customer",
  unassigned: "Unassigned",
  latitude: "Latitude",
  longitude: "Longitude",
  radiusM: "Radius (m)",
  locationAllOrNone: "Enter all three or none.",
  show: "Show",
  allJobs: "All",
  jobStatus: { open: "Open", complete: "Complete", archived: "Archived" },
  saveDetails: "Save details",
  assign: "Assign",
  setStatus: "Set status",
  customerInactive: "That customer is deactivated.",
  crewInactive: "That crew is deactivated.",
  customerInactiveOnStatus:
    "This customer is deactivated. Reactivate them, or move the job to another customer first.",
  crewInactiveOnStatus:
    "This job's crew is deactivated. Reactivate it or reassign the job first.",
  hasInvoices: "This job has invoices; its customer can no longer change.",
  archivedNote:
    "Archived jobs leave the crew's list on the next sync; open sessions still clock out.",

  // Refused entries
  refusals: "Refused entries",
  refusalsExplain:
    "What the server refused or could not process from a phone, kept for 30 days. Entries are listed under the person whose phone sent them and the day the server received them, which may be later than the day worked. The entry itself stays on the phone.",
  sentBy: "Sent by",
  receivedOn: "Received on",
  findRefusals: "Find",
  emptyRefusals: "Nothing from this person was refused on this day.",
  refusalResult: "Result",
  refusalKind: "Entry",
  refusalCode: "Reason code",
  receivedAt: "Received",
  requestId: "Request",
  refusalOutcomes: {
    rejected: "Refused",
    omitted: "Not processed; the phone sends it again",
    request_failed: "The whole send failed",
  },
  refusalKinds: {
    labor_event: "Hours",
    material: "Material",
    closeout: "Day closeout",
    material_correction: "Material correction",
    unknown: "—",
  },

  // Profile
  contactPhone: "Contact phone",
  managedBySignIn: "Managed by your sign-in provider",
  save: "Save",
  saved: "Saved.",
} as const;
