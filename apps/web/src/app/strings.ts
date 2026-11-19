// The office's English strings, in one module. No message catalog is planned: the crew
// app's strings are two typed catalogs with no i18n library (DESIGN, Localization). Nothing
// crew-facing lives here.
export const strings = {
  wordmark: "TRADER",
  devSignIn: "Development sign-in",
  devSignInBadEmail: "Enter an email address.",
  email: "Email",
  signIn: "Sign in",
  signOut: "Sign out",

  // Navigation
  navigation: "Office",
  menu: "Menu",
  nav: {
    people: "People",
    customers: "Customers",
    jobs: "Jobs",
    schedule: "Schedule",
    hours: "Hours",
    invoices: "Invoices",
  },
  hoursTitle: "Hours",
  roster: "People",
  customers: "Customers",
  jobs: "Jobs",
  crews: "Crews",
  // The Weekly Schedule screen (DESIGN, Weekly Schedule): a shift is a "Shift", a job a
  // "Jobsite". One namespace, so its many words cannot collide with the flat keys above.
  schedule: {
    title: "Weekly Schedule",
    explain: "Planned shifts only. Hours worked and corrections are on the Hours screen.",
    previousWeek: "Previous week",
    nextWeek: "Next week",
    // The two steps as their buttons read; the names above are what a screen reader hears.
    previous: "Previous",
    next: "Next",
    thisWeek: "This week",
    weekOf: (from: string, to: string) => `${from} – ${to}`,
    view: "View",
    byEmployee: "By employee",
    byJobsite: "By jobsite",
    employee: "Employee",
    jobsite: "Jobsite",
    allEmployees: "All employees",
    showEmployee: "Show",
    day: "Day",
    addShift: "Add shift",
    addShiftFor: (name: string, day: string) => `Add a shift for ${name} on ${day}`,
    copyLastWeek: "Copy last week",
    noShifts: "No shifts this week.",
    people: (n: number) => (n === 1 ? "1 person" : `${n} people`),
    locked: "Locked",
    lockedExplain:
      "Someone has clocked in on this shift, so its jobsite, day and hours cannot change.",
    correctInLabor: "Correct attendance in Hours",
    shiftOf: (name: string) => `Shift — ${name}`,
    openShift: (name: string, jobsite: string, hours: string, day: string) =>
      `${name}, ${jobsite}, ${hours}, ${day}`,
    days: "Days",
    start: "Start",
    end: "End",
    save: "Save shift",
    add: "Add shift",
    addShifts: (n: number) => (n === 1 ? "Add 1 shift" : `Add ${n} shifts`),
    remove: "Remove shift",
    removeEffect: (name: string, jobsite: string, day: string) =>
      `${name} will no longer be scheduled at ${jobsite} on ${day}. Recorded hours do not change.`,
    removed: "Shift removed.",
    saved: "Shift saved.",
    added: (n: number) => (n === 1 ? "1 shift added." : `${n} shifts added.`),
    alreadyThere: (n: number) =>
      n === 1 ? " 1 was already there." : ` ${n} were already there.`,
    notAdded: (day: string, why: string) => `${day}: not added. ${why}`,
    pickDay: "Choose at least one day.",
    endAfterStart: "The end must be after the start.",
    overlap: (other: string, hours: string) => `Overlaps ${other} during ${hours}.`,
    thisShift: "This shift",
    cannotSave: "This cannot be saved:",
    overlapRefused:
      "One person is on one jobsite at a time. Change the hours or the day.",
    overlapsHeading: "Overlaps",
    issue: {
      duplicate: "That shift already exists.",
      overlap: (a: string, b: string, hours: string) =>
        `${a} and ${b} overlap during ${hours}.`,
      changed: "The schedule changed meanwhile. Close this and try again.",
    },
    refused: {
      authorization: (shift: string) =>
        `Someone has already clocked in on ${shift}, and this would change what allowed it.`,
      locked:
        "Someone has clocked in on this shift, so it cannot change. Correct attendance in Hours.",
      stale: "This shift changed meanwhile. Close this and try again.",
      userInactive: "That employee is deactivated.",
      jobArchived: "That jobsite is archived.",
    },
    copyTitle: "Copy last week",
    copyExplain: (from: string, to: string) =>
      `Copies the shifts of the week of ${from} to the week of ${to}.`,
    copyCreate: (n: number) => (n === 1 ? "Create 1 shift" : `Create ${n} shifts`),
    copyNothing: "There is nothing to create.",
    copyLeftOut: (n: number) =>
      n === 1 ? "1 shift is left out" : `${n} shifts are left out`,
    copyWillCreate: (n: number) =>
      n === 1 ? "1 shift will be created" : `${n} shifts will be created`,
    copyDone: (n: number) => (n === 1 ? "Created 1 shift." : `Created ${n} shifts.`),
    copyStale:
      "The schedule changed since this was shown. This is the copy as it would be now.",
    copyFailed: "Nothing was created. You can try the same copy again.",
    undoCopy: (n: number) =>
      n === 1 ? "Undo copy of 1 shift" : `Undo copy of ${n} shifts`,
    undoEffect: (n: number) =>
      `${n === 1 ? "The 1 shift" : `All ${n} shifts`} this copy created will be removed, including any changed since.`,
    undoLocked: (n: number) =>
      `A copy of ${n === 1 ? "1 shift" : `${n} shifts`} cannot be undone: someone has clocked in on one of them.`,
    undone: (n: number) => (n === 1 ? "Removed 1 shift." : `Removed ${n} shifts.`),
    leftOut: {
      user_inactive: "deactivated employee",
      job_archived: "archived jobsite",
      duplicate: "already there",
      overlap: "would overlap",
      authorization: "someone has already clocked in that day",
    },
  },
  approvals: "Approvals",
  profile: "Profile",
  // Invoices (DESIGN, Invoice line): a draft priced by the admin, issued once, void once.
  invoices: {
    nav: "Invoices",
    title: "Invoices",
    explain:
      "A draft is yours to change. Issuing gives it the next number and freezes it; after that the only change is to void it.",
    newDraft: "New invoice",
    job: "Jobsite",
    currency: "Currency",
    start: "Start draft",
    none: "No invoices yet.",
    number: "Number",
    customer: "Customer",
    state: "State",
    total: "Total",
    states: { draft: "Draft", issued: "Issued", void: "Void" },
    draftOf: (job: string) => `Draft — ${job}`,
    invoiceNo: (n: number) => `Invoice ${n}`,
    back: "All invoices",
    gone: "There is no invoice at this address.",
    forCustomer: (customer: string, job: string) => `${customer} · ${job}`,
    issuedBy: (who: string, when: string) => `Issued by ${who}, ${when}`,
    voidedBy: (who: string, when: string) => `Voided by ${who}, ${when}`,
    lines: "Lines",
    description: "Description",
    quantity: "Quantity",
    unit: "Unit",
    price: "Price each",
    amount: "Amount",
    addLine: "Add a line",
    removeLine: (n: number) => `Remove line ${n}`,
    lineOf: (n: number, label: string) => `Line ${n}: ${label}`,
    noLines: "No lines yet. Add one, or draw from the job below.",
    tax: "Tax",
    subtotal: "Subtotal",
    save: "Save draft",
    saved: "Draft saved.",
    unsaved: "Save the draft before issuing it.",
    badLine: (n: number) =>
      `Line ${n} needs a description, a quantity above zero and a price.`,
    badTax: "Enter the tax as an amount, or 0.",
    tooLarge: "An amount on this invoice is too large to store.",
    draw: "Draw from this job",
    drawExplain:
      "Adds the words and the quantity as a line. The price is yours to enter: nothing here comes from what the job cost.",
    laborOn: (day: string) => `Labor, ${day}`,
    hoursOf: (quantity: string) => `${quantity} h approved`,
    add: "Add",
    addOf: (label: string) => `Add ${label} as a line`,
    nothingToDraw: "This job has no approved hours and no receipts that count yet.",
    issue: "Issue invoice",
    issueEffect: (total: string) =>
      `This invoice for ${total} takes the next number and can no longer be changed. Its lines and its tax are frozen as they are saved now.`,
    issued: (n: number) => `Issued as invoice ${n}.`,
    noSeries:
      "This company has no invoice number series yet. It is created when the company is set up.",
    removeDraft: "Delete draft",
    removeEffect:
      "This draft and its lines will be deleted. It has no number, so none is lost.",
    removed: "Draft deleted.",
    voidIt: "Void invoice",
    pdf: "Save as PDF",
    sendHeading: "Email to the customer",
    sendExplain:
      "Sends this invoice as a PDF. Each send is kept here, whether it went or not.",
    sendTo: "Send to",
    send: "Send invoice",
    sendSent: "Sent.",
    sendFailed: "That send did not go. You can send it again.",
    noSends: "Not sent yet.",
    sentTo: (to: string, by: string, at: string) => `Sent to ${to} by ${by}, ${at}`,
    failedTo: (to: string, by: string, at: string) =>
      `Not sent to ${to} (tried by ${by}, ${at})`,
    sendFailures: {
      mail_not_configured: "Email is not set up for this office yet. Nothing was sent.",
      recipient_not_allowed:
        "This system may not send to that address. Nothing was sent.",
      provider_refused:
        "The mail service refused the message. Check the address and send again.",
      provider_unreachable:
        "The mail service could not be reached. Send it again in a moment.",
    },
    pdfSaved: (filename: string) => `Saved ${filename}.`,
    voidEffect: (n: number) =>
      `Invoice ${n} will be marked void. It keeps its number and its lines, and it cannot be issued again.`,
    voided: "Invoice voided.",
    isIssued: "This invoice is issued and can no longer be changed.",
    owed: "Owed",
    paid: "Paid",
    paidInFull: "Paid in full",
    payments: "Payments",
    noPayments: "No payment recorded yet.",
    paymentLine: (amount: string, day: string, method: string) =>
      `${amount} · ${day} · ${method}`,
    recordedBy: (who: string) => `Recorded by ${who}`,
    reversedMark: "Reversed",
    reversalMark: "Reversal",
    methods: {
      check: "Check",
      cash: "Cash",
      card: "Card",
      bank_transfer: "Bank transfer",
      other: "Other",
    },
    recordPayment: "Record a payment",
    recordExplain:
      "A note of money the customer paid. TRADER takes no payment and moves no money.",
    paymentAmount: "Amount",
    paymentDay: "Paid on",
    paymentMethod: "Method",
    paymentNote: "Note (optional)",
    record: "Record payment",
    recorded: "Payment recorded.",
    badAmount: "Enter the amount paid, above zero.",
    overpaid: (owed: string) => `That is more than the ${owed} still owed.`,
    reverse: "Reverse",
    reverseOf: (amount: string) => `Reverse the payment of ${amount}`,
    reverseEffect: (amount: string) =>
      `The payment of ${amount} will be marked reversed and will no longer count. Both entries stay on the invoice.`,
    hasPayments:
      "A payment still stands against this invoice. Reverse it before voiding.",
  },

  // States every screen can be in
  loading: "Loading…",
  signInToContinue: "Sign in to continue.",
  notOnRoster: "This sign-in is not on a roster. Ask your office.",
  signInNotSetUp: "Sign-in is not set up on this server.",
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
  goToOverview: "Go to the schedule",
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
  edit: "Edit",
  close: "Close",
  emailTaken: "Someone on this roster already has that email.",
  phoneTaken: "Someone on this roster already has that mobile number.",
  mobileNumber: "Mobile number",
  signInAddress: "Sign-in",
  mobileNumberNeeded: "Enter a mobile number.",
  mobileNumberInvalid: "Enter a ten-digit United States or Canada number.",
  inviteAddressHint:
    "The sign-in code is sent to this mobile number. An email is optional: the office can also sign in with a code sent to it.",
  saveRole: "Save role",
  deactivate: "Deactivate",
  reactivate: "Reactivate",
  lastAdmin: "This is the last admin. Make someone else an admin first.",
  deactivatePersonEffect: (name: string) =>
    `${name} will not be able to sign in or send hours from their phone. Hours the office already has stay on record.`,
  unchanged: "No change.",
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
  person: "Person",
  chooseJob: "Choose a job",
  planFrom: "From",
  planThrough: "Through",
  date: "Date",
  receivedAt: "Received",

  // Labor ledger (DESIGN, Worker ledger)
  ledger: "A person's entries",
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
    unscheduled: "not on the schedule",
  },
  approvedByDefault: "Approved by default",
  approvalWaiting: "Waiting",
  approvedBy: (name: string) => `Approved by ${name}`,
  rejectedBy: (name: string) => `Rejected by ${name}`,
  reconExplain:
    "Each person's approved hours by day and job, for the pay period or the days you choose. Hours count once they are approved and the session has ended; a day's time on a job is added up first, then rounded to the hundredth of an hour.",
  showHours: "Show hours",
  workDatesIn: (zone: string) => `Work dates in ${zone}.`,
  approvedHours: "Approved hours",
  reconTotal: (hours: string) => `${hours} h approved on these days`,
  hoursValue: (hours: string) => `${hours} h`,
  noApprovedHours: "No hours are approved on these days yet.",
  emptyReconciliation: "No hours are recorded on these days.",
  notInHours: "Not in these hours",
  notInHoursExplain:
    "What waits for approval, was rejected or is still open. None of it is in the approved hours above.",
  decideInApprovals: "Decide what waits in Approvals",
  repairInLedger: "Correct hours in a person's entries",
  waitingHours: "Waiting",
  unresolvedState: "Why",
  sessionsWaiting: (n: number) => `${n} waiting for approval`,
  sessionsRejected: (n: number) => `${n} rejected`,
  sessionsOpen: (n: number) => `${n} still open`,

  // Labor repair, on the ledger (PRD, Office review)
  repair: "Repair",
  repairOf: (job: string, started: string) => `Repair ${job}, ${started}`,
  repairExplain:
    "Change a time or the job, or add an entry that is missing. Each change is a new entry that waits for approval.",
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
  ownEntry: "Your own entry. Another admin decides it.",
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
  },
  closeoutZone: (zone: string) => `Times in ${zone}.`,
  worked: "Worked",
  breaks: "Breaks",
  stillOpen: "Still open",
  sessionEdited: "Edited",
  duration: (h: number, m: number) => `${h} h ${String(m).padStart(2, "0")} min`,

  // Profile
  contactPhone: "Contact phone",
  managedBySignIn: "Managed by your sign-in provider",
  signInNumber: "Sign-in number",
  signInNumberCaption: "Your sign-in code is sent here. The office changes it.",
  save: "Save",
  saved: "Saved.",
  approved: "Approved.",
  rejected: "Rejected.",
} as const;
