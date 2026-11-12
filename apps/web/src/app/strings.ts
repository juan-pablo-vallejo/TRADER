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
  assignments: "Assignments",
  closeout: "Closeout",
  approvals: "Approvals",
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

  // Assignments
  planWork: "Plan work",
  emptyAssignments: "Nothing is planned for these days.",
  assignmentsExplain:
    "A plan says where someone is expected and when. It does not let anyone clock in: that is still the job's crew.",
  weekOf: "Week of",
  previousWeek: "Previous week",
  nextWeek: "Next week",
  person: "Person",
  allPeople: "Everyone",
  everyJob: "Every job",
  chooseJob: "Choose a job",
  planFrom: "From",
  planThrough: "Through",
  expectedStart: "Start",
  expectedEnd: "End",
  date: "Date",
  planned: "Planned",
  clockIn: "Clock-in",
  savePlan: "Save plan",
  removePlan: "Remove plan",
  removePlanEffect: (name: string, job: string) =>
    `${name} will no longer be planned on ${job} that day. Their hours and their crews do not change.`,
  planRemoved: "Plan removed.",
  plannedDays: (created: number, existing: number) =>
    `Planned ${created === 1 ? "1 day" : `${created} days`}.` +
    (existing === 0
      ? ""
      : ` ${existing === 1 ? "1 day was" : `${existing} days were`} already planned and ${existing === 1 ? "was" : "were"} left as ${existing === 1 ? "it was" : "they were"}.`),
  alreadyPlannedAll: "Every one of those days is already planned. No change.",
  endAfterStart: "The end must be after the start.",
  throughAfterFrom: "The last day cannot be before the first.",
  tooManyDays: "Plan at most 14 days at a time.",
  alreadyPlanned: "They are already planned on this job that day.",
  jobArchived: "That job is archived.",
  planGone:
    "This plan is no longer there, or you can no longer change it. Nothing was saved.",
  notOnCrew: "Not on this job's crew",
  notOnCrewHelp:
    "This plan does not let them clock in here — add them to the crew to allow it",
  jobArchivedHelp: "Nobody can clock in on an archived job",
  workerInactiveHelp: "A deactivated person cannot clock in",

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

  // Labor ledger (DESIGN, Worker ledger)
  ledger: "Labor ledger",
  ledgerExplain:
    "One person's recorded hours, day by day, with every entry behind them. Nothing here is erased: a repair is a new entry that waits for approval, and the entry it replaces stays on record.",
  showLedger: "Show ledger",
  ledgerRange: "Choose up to 31 days, the first no later than the last.",
  emptyLedger: "No hours are recorded for this person on these days.",
  ledgerOpenSession: (day: string) =>
    `A session started ${day} is still open. They cannot clock in again until it is ended or repaired.`,
  sessionCounts: {
    eligible: "Counts",
    pending: "Waiting for approval",
    rejected: "Rejected",
    voided: "Voided",
  },
  sessionClosedOut: "Closed out",
  entry: "Entry",
  recorded: "Recorded",
  enteredBy: "Entered by",
  // The cell says it whole: a narrow row shows no column heading.
  enteredByName: (name: string) => `Entered by ${name}`,
  flags: "Flags",
  approval: "Approval",
  entryId: "Id",
  entryTypes: {
    started: "Clock in",
    paused: "Break start",
    resumed: "Break end",
    ended: "Clock out",
    voided: "Void",
  },
  entryReplaced: "Replaced",
  entryVoids: "Voids this session",
  reasonTags: {
    offline: "offline",
    corrected: "edited",
    user_timed: "time set by user",
    location: "location",
    clock_skewed: "clock skew",
    after_closeout: "after closeout",
  },
  approvedByDefault: "Approved by default",
  approvalWaiting: "Waiting",
  approvedBy: (name: string) => `Approved by ${name}`,
  rejectedBy: (name: string) => `Rejected by ${name}`,

  // Labor repair, on the ledger (PRD, Office review)
  repair: "Repair",
  repairOf: (job: string, started: string) => `Repair ${job}, ${started}`,
  repairExplain:
    "Change a time or the job, or add an entry that is missing. Each change is a new entry that waits for approval.",
  repairClosedOut:
    "This day is closed out. The new entries will also be flagged after closeout.",
  repairTimes: "Times",
  repairAdded: "Entries to add",
  addEntry: "Add an entry",
  addedEntryType: (n: number) => `Entry ${n}`,
  addedEntryTime: (n: number) => `Entry ${n} time`,
  saveRepair: "Save repair",
  repairSaved: "Saved. The new entries wait for approval.",
  // An admin's own hours need no approval (PRD, Office approval).
  repairCounted: "Saved. These are your own hours, so they count without approval.",
  repairBadTime:
    "Enter a date and a time. A time the clocks skipped that day cannot be used.",
  repairTooMany: "At most 20 changes at a time. Save some, then make the rest.",
  repairUnsent:
    "That didn't go through. Try again: the same repair is sent, so it cannot be recorded twice.",
  repairChanged:
    "This ledger changed since it was shown. It has been refreshed: check it, then repair again.",
  voidSession: "Void session",
  voidSessionEffect:
    "This session's hours will no longer count. The session and its entries stay on record, and the void waits for approval.",
  addMissingHours: "Add missing hours",
  missingHoursExplain:
    "Hours nobody recorded: a clock in and, when it is known, the clock out. They wait for approval like every entry the office writes.",
  missingClockIn: "Clock in",
  missingClockOut: "Clock out (optional)",
  addHours: "Add hours",
  jobOptionArchived: (name: string) => `${name} · archived`,
  // One sentence per answer of labor.repair (labor/repair.ts); the ledger screen holds this
  // list to the server's codes.
  repairRejected: {
    no_open_session:
      "There is no open session at that time for one of these entries. Check the times.",
    session_already_open:
      "They are already clocked in at that time. End or correct that session first.",
    not_paused: "A break end needs a break start before it.",
    already_paused: "They are already on a break at that time.",
    target_missing:
      "This ledger changed since it was shown. Show the ledger again, then repair.",
    target_is_correction:
      "This ledger changed since it was shown. Show the ledger again, then repair.",
    correction_of_void: "A void cannot be corrected.",
    correction_type_mismatch:
      "This ledger changed since it was shown. Show the ledger again, then repair.",
    correction_job_mismatch: "Only a clock in can move to another job.",
    void_target_not_started:
      "This ledger changed since it was shown. Show the ledger again, then repair.",
    already_voided: "This session is already voided.",
    breaks_following_event:
      "That time would put an entry out of order with the ones after it. Change those in the same repair.",
    correction_superseded:
      "This ledger changed since it was shown. Show the ledger again, then repair.",
    correction_moves_session:
      "That time would move an entry into another session. Keep it inside its own.",
    job_id_mismatch: "An added entry must be on the session's job.",
    id_conflict: "That didn't go through. Nothing was saved; save again.",
    time_in_future: "One of these times has not happened yet.",
    repair_stale:
      "This ledger changed since it was shown. It has been refreshed: check it, then repair again.",
  },

  // Approvals (DESIGN, Approval row)
  approvalsExplain:
    "Entries that wait for the office before they count, oldest first. Approving keeps an entry as it was recorded; rejecting leaves it out. A decision cannot be changed: hours that are wrong are repaired from the labor ledger.",
  emptyApprovals: "Nothing is waiting for approval.",
  who: "Who",
  time: "Time",
  hours: "Hours",
  decision: "Decision",
  approve: "Approve",
  reject: "Reject",
  showMore: "Show more",
  whoEnteredBy: (who: string, by: string) => `${who}, entered by ${by}`,
  recordedAt: (when: string) => `Recorded ${when}`,
  receivedWhen: (when: string) => `Received ${when}`,
  loggedWhen: (when: string) => `Logged ${when}`,
  submittedWhen: (when: string) => `Submitted ${when}`,
  materialEntry: (facts: string) => `Material: ${facts}`,
  materialVoided: "voided",
  correctionAmend: (from: string, to: string) =>
    `Material correction: ${from} changed to ${to}`,
  correctionVoid: (facts: string) => `Material correction: void ${facts}`,
  correctionNote: (note: string) => `Note: ${note}`,
  ownEntry: "Your own entry. Another admin decides it.",
  approved: "Approved.",
  rejected: "Rejected.",
  alreadyDecided: {
    approved: "Someone else already approved this. Their decision stands.",
    rejected: "Someone else already rejected this. Their decision stands.",
  },
  rejectEffect: {
    labor:
      "These hours will be left out until the office repairs them from the labor ledger. A decision cannot be changed.",
    superseded:
      "A later correction replaced this entry, so rejecting it changes no hours. A decision cannot be changed.",
    void: "The session will stay as recorded and its hours will not be voided. A decision cannot be changed.",
    material:
      "This material will be left out of the job's cost. A decision cannot be changed.",
    material_correction:
      "The material will stay as it was before this correction. A decision cannot be changed.",
  },

  // Closeout (DESIGN, Closeout)
  closeoutExplain:
    "Review a job's day, then submit it. A submitted closeout is locked: later changes are correcting entries that go through approval, and entries that arrive afterwards wait for approval.",
  workDate: "Work date",
  reviewDay: "Review",
  reviewAgain: "Review again",
  closeoutArchived: "Archived job. Its status will not change.",
  closeoutNoCrew: "No crew on this job.",
  noCrewOption: "no crew",
  closeoutZone: (zone: string) => `Times in ${zone}.`,
  closeoutLabor: "Labor",
  closeoutMaterials: "Materials",
  closeoutNoLabor: "No labor on this day.",
  closeoutNoMaterials: "No materials on this day.",
  closeoutEmptyDay: "No labor or materials on this day. Submitting closes it out empty.",
  started: "Started",
  ended: "Ended",
  worked: "Worked",
  breaks: "Breaks",
  sessionNotes: "Notes",
  stillOpen: "Still open",
  sessionVoided: "Voided",
  sessionEdited: "Edited",
  duration: (h: number, m: number) => `${h} h ${String(m).padStart(2, "0")} min`,
  material: "Material",
  quantity: "Quantity",
  loggedBy: "Logged by",
  loggedAt: "Logged",
  statusAfter: "Job status after this day",
  closeoutNote: "Note (optional)",
  submitCloseout: "Submit closeout",
  sessionsOpenReason: (n: number) =>
    `${n === 1 ? "1 session is" : `${n} sessions are`} still open. End or repair ${n === 1 ? "it" : "them"} before closing out.`,
  closedOut: "Closed out.",
  closedOutStatusKept: "Closed out. The job's status was not changed.",
  closedOutAt: (when: string) =>
    `Closed out ${when}. Locked: what is shown below is the day as it stands now.`,
  closeoutUnsent:
    "That didn't go through. Try again: the same closeout is sent, so it cannot be recorded twice.",
  closeoutRejected: {
    id_conflict: "That didn't go through. Review the day again, then submit.",
    already_submitted: "This day was already closed out.",
    sessions_open:
      "A session on this day is still open. End or repair it, then review again.",
    work_date_in_future: "That day has not happened yet.",
    review_stale: "The day changed since this review. Check it again, then submit.",
  },

  // Profile
  contactPhone: "Contact phone",
  managedBySignIn: "Managed by your sign-in provider",
  save: "Save",
  saved: "Saved.",
} as const;
