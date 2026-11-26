// The office's English catalog, and the shape of every catalog: `es.ts` is held to this
// one's keys by the compiler, so a key missing from either fails `pnpm typecheck`. Not
// `as const`: a sentence is a string in the shape, so another language's sentence fits it.
// The phone app's strings are its own two catalogs (apps/mobile/src/i18n).
import { MAX_JOBSITE_RADIUS_M } from "@trader/api/contract";

export const en = {
  devSignIn: "Development sign-in",
  devSignInBadEmail: "Enter an email address.",
  email: "Email",
  signIn: "Sign in",
  signOut: "Sign out",
  // The homepage's way in for the crew and the office.
  teamSignIn: "Team sign-in",
  // The homepage and `/get`, the page an invitation points to.
  getApp: "Get the app",
  whatsAppChat: "Message us on WhatsApp",
  emailUs: (address: string) => `Email ${address}`,
  photos: "Our work",
  // Under a photo of work under way, which carries the finished job beside it.
  swipeFinished: "Swipe to see it finished",
  // D'Sierra's homepage: what its sections and controls are called. Its own words, the
  // ones D'Sierra sent, are (public)/home-content.ts.
  home: {
    contact: "Contact",
    emailShort: "Email",
    beforeAfter: "Before and after",
    before: "Before",
    after: "After",
    whatWeDo: "What we do",
    services: "Services",
    projects: "Projects",
    team: "For the team",
    elsewhere: "More of our work",
    // A photo in the gallery opens larger, one at a time.
    viewPhoto: (what: string) => `View larger: ${what}`,
    viewer: "Photos of our work",
    previous: "Previous photo",
    next: "Next photo",
    photoOf: (n: number, total: number) => `${n} of ${total}`,
  },
  get: {
    title: "Get the TRADER app",
    explain: "The app the office invited you to: your week, and clocking in and out.",
    iphone: "Get it for iPhone",
    android: "Get it for Android",
    askOffice: "The link is not here yet. Ask the office for it.",
    androidNote:
      "On Android the office must first add your Google account to the testers. If the page says the app is not available, ask them to add you.",
    thenSignIn:
      "Then open the app and sign in with the mobile number or the email the office invited you with.",
    home: "Back to the homepage",
  },
  // The header's menu behind the person's name.
  account: "Your account",
  // The command menu (command-menu.tsx).
  command: {
    title: "Search or run",
    open: "Search",
    placeholder: "A person, a job, a customer, an invoice, or what to do",
    results: "What was found",
    hint: "Up and down to choose, Enter to go, Esc to close.",
    none: "Nothing by that name.",
    inactive: "Deactivated",
    kinds: {
      action: "Do",
      person: "Person",
      job: "Job",
      customer: "Customer",
      invoice: "Invoice",
    },
    actions: {
      shift: "New shift",
      invoice: "New invoice",
      invite: "Invite a person",
      export: "Export hours",
    },
  },
  // The keys of the tables and the schedule (keyboard-rows.tsx).
  keys: {
    title: "Keyboard",
    open: "Keyboard shortcuts",
    explain:
      "In any table and in the schedule. A key does nothing while you are typing in a field. Everything here can also be done with the pointer or with Tab.",
    // What each key does. The keys' own names are not words of a language
    // (keyboard-rows.tsx), but for the space bar.
    space: "Space",
    does: {
      next: "Next row. Once the focus is in a table, J and K move through its rows.",
      previous: "Previous row.",
      along: "Along the row: the next cell of the week in Hours and in the schedule.",
      open: "Open the row's panel or page.",
      close: "Close the panel. The focus goes back to where it was.",
      tab: "The next control, as everywhere.",
      help: "This list.",
    },
  },
  // The two tabs of one place: a job belongs to a customer.
  jobsTabs: "Jobs and customers",
  // Said to a screen reader while a list's first rows are on their way.
  loadingRows: "Loading",
  // Where a person chooses their language: each language under its own name.
  language: "Language",
  languages: { en: "English", es: "Español" },

  // Navigation
  navigation: "Office",
  menu: "Menu",
  skipToContent: "Skip to content",
  nav: {
    today: "Today",
    people: "People",
    customers: "Customers",
    jobs: "Jobs",
    schedule: "Schedule",
    hours: "Hours",
    invoices: "Invoices",
  },
  hoursTitle: "Hours",
  people: "People",
  customers: "Customers",
  jobs: "Jobs",
  // The Weekly Schedule screen: a shift is a "Shift", a job a
  // "Job". One namespace, so its many words cannot collide with the flat keys above.
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
    byPerson: "By person",
    byJobsite: "By job",
    person: "Person",
    jobsite: "Job",
    everyone: "Everyone",
    showPerson: "Show",
    day: "Day",
    addShift: "Add shift",
    addShiftFor: (name: string, day: string) => `Add a shift for ${name} on ${day}`,
    copyLastWeek: "Copy last week",
    noShifts: "No shifts this week.",
    people: (n: number) => (n === 1 ? "1 person" : `${n} people`),
    locked: "Started",
    lockedExplain:
      "Someone has clocked in on this shift, so its job, day and start are fixed. It can end early, and the person can move to another job.",
    addToday: "Add",
    personWeek: (name: string) => `${name}'s week`,
    personWeekEmpty: "No shifts this week yet.",
    endEarly: "End early",
    endEarlyAt: "Ends at",
    endEarlyEffect: (name: string, jobsite: string, was: string, at: string) =>
      `${name}'s shift at ${jobsite} will end at ${at} instead of ${was}. Recorded hours do not change: they clock out on their own phone.`,
    endedEarly: "The shift now ends earlier.",
    notEarlier: "Choose a time before the end the shift has now.",
    notAfterStart: "Choose a time after the shift's start.",
    move: "Move to another job",
    moveTo: "Move to",
    moveNow: (time: string) => `Moves at ${time}, the time now.`,
    moveEffect: (name: string, from: string, to: string, at: string, end: string) =>
      `From ${at}, ${name} is scheduled at ${to} until ${end}, and the shift at ${from} ends at ${at}. They switch job on their own phone.`,
    moved: "Moved. They switch job on their own phone.",
    moveNotNow: "Moving is for a shift that is under way today.",
    sameJob: "They are already on that job.",
    correctInLabor: "Correct in Hours",
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
    // A change shown at once, in the toast that offers Undo, and what became of it.
    did: {
      moved: (name: string, day: string) => `${name}'s shift moved to ${day}.`,
      changed: (name: string, hours: string) => `${name}'s shift changed to ${hours}.`,
      removed: (name: string, day: string) => `${name}'s shift on ${day} removed.`,
    },
    undo: "Undo",
    undoneChange: "Undone: the shift is as it was.",
    notDone: (why: string) => `Nothing was changed, and the week is as it was. ${why}`,
    notUndone: (why: string) => `It could not be undone. ${why}`,
    added: (n: number) => (n === 1 ? "1 shift added." : `${n} shifts added.`),
    alreadyThere: (n: number) =>
      n === 1 ? " 1 was already there." : ` ${n} were already there.`,
    notAdded: (day: string, why: string) => `${day}: not added. ${why}`,
    pickDay: "Choose at least one day.",
    endAfterStart: "The end must be after the start.",
    overlap: (other: string, hours: string) => `Overlaps ${other} during ${hours}.`,
    thisShift: "This shift",
    cannotSave: "This cannot be saved:",
    overlapRefused: "One person is on one job at a time. Change the hours or the day.",
    overlapsHeading: "Overlaps",
    issue: {
      duplicate: "That shift already exists.",
      overlap: (a: string, b: string, hours: string) =>
        `${a} and ${b} overlap during ${hours}.`,
      changed: "The schedule changed meanwhile. Close this and try again.",
    },
    refused: {
      started: (shift: string) =>
        `Someone has already clocked in on ${shift}, and this would change what allowed it.`,
      locked:
        "Someone has clocked in on this shift, so it cannot change. Correct its hours in Hours.",
      stale: "This shift changed meanwhile. Close this and try again.",
      userInactive: "That person is deactivated.",
      jobArchived: "That job is archived.",
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
      user_inactive: "deactivated person",
      job_archived: "archived job",
      duplicate: "already there",
      overlap: "would overlap",
      started: "someone has already clocked in that day",
    },
  },
  // A person's status on the company's today, as the phone's Crew tab words it.
  crewStatus: {
    working: "On the clock",
    break: "On a break",
    late: "Late",
    expected: "Expected",
    done: "Done",
  },
  // Today, where the office opens: three bands, rows and counts.
  todayScreen: {
    title: "Today",
    attention: "Needs attention",
    attentionClear: "Nothing needs attention.",
    stillOpen: (name: string, job: string, day: string) =>
      `${name} is still on the clock at ${job} since ${day}.`,
    correct: "Correct",
    correctOf: (name: string) => `Correct ${name}'s time in Hours`,
    late: (name: string, job: string, start: string) =>
      `${name} is late for ${job}, which started at ${start}.`,
    whatsApp: "WhatsApp",
    whatsAppOf: (name: string) => `Message ${name} on WhatsApp`,
    noNumber: "No number",
    more: (n: number) => (n === 1 ? "And 1 more" : `And ${n} more`),
    onTheClock: "On the clock now",
    nobodyWorking: "Nobody is on the clock.",
    at: (job: string, since: string) => `${job}, since ${since}`,
    onBreakAt: (job: string, since: string) => `On a break. ${job}, since ${since}`,
    expected: "Expected",
    expectedAt: (job: string, start: string) => `${job}, from ${start}`,
    done: "Done for today",
    worked: (hours: string) => `${hours} worked`,
    money: "Money",
    owed: (amount: string) => `${amount} owed`,
    owedInvoices: (n: number) => (n === 1 ? "on 1 invoice" : `on ${n} invoices`),
    nothingOwed: "Nothing is owed.",
    overdue: (amount: string) => `${amount} overdue`,
    drafts: (n: number) =>
      n === 0
        ? "No drafts waiting."
        : n === 1
          ? "1 draft waiting to be issued"
          : `${n} drafts waiting to be issued`,
    notInvoiced: (n: number) =>
      n === 0
        ? "Every complete job has an invoice."
        : n === 1
          ? "1 complete job has no invoice"
          : `${n} complete jobs have no invoice`,
    toInvoices: "Invoices",
    toJobs: "Jobs",
    asOf: (time: string) => `As of ${time}`,
  },
  // The privacy policy's and the terms' own frame; their words are legal-content.ts.
  legal: {
    privacy: "Privacy policy",
    terms: "Terms of use",
    lastChanged: (day: string) => `Last changed ${day}`,
    draft:
      "Draft. These words have not been approved yet and may change before TRADER is released.",
    operator: "Who operates TRADER",
    operatorToCome: "The operator's legal name is still to be added to this draft.",
    contactToCome:
      "An address for questions about privacy is still to be added to this draft.",
  },
  // Settings, behind the person's name: the company, the time clock, and Me.
  settings: {
    title: "Settings",
    company: "Company",
    companyExplain: "These details print on every invoice.",
    companyName: "Company name",
    companyEmail: "Email",
    howToPay: "How to pay",
    howToPayHint: "A few lines, printed as typed under “How to pay” on every invoice.",
    terms: "Payment terms, in days",
    termsHint:
      "Days from the day an invoice is issued to the day it is due. 0 is due on receipt.",
    badTerms: "Enter a whole number of days from 0 to 365.",
    badPhone: "Enter a phone number WhatsApp can open, with its country code.",
    timezone: "Timezone",
    timezoneHint:
      "Shown, not changed here: the hours already recorded are placed on their days by it.",
    saveCompany: "Save company",
    clock: "Time clock",
    on: "On",
    off: "Off",
    enforcement: "Schedule enforcement",
    enforcementIs: {
      on: "On: a person clocks in only on a shift of theirs, from 15 minutes before it starts.",
      off: "Off: a person clocks in on any open job, at any time.",
    },
    enforcementTurnOn: "Turn enforcement on",
    enforcementTurnOff: "Turn enforcement off",
    enforcementEffect: {
      on: "From the next time each phone syncs, a person can clock in only on a shift of theirs. Anyone with no shift today will not be able to start the clock until the office adds one.",
      off: "From the next time each phone syncs, anyone can clock in on any open job at any time, with or without a shift.",
    },
    stamps: "Location stamps",
    stampsIs: {
      on: "On: each clock tap records where the phone is, and a tap away from the jobsite is flagged.",
      off: "Off: no clock tap records a location, and none is flagged for one.",
    },
    stampsTurnOn: "Turn location stamps on",
    stampsTurnOff: "Turn location stamps off",
    stampsEffect: {
      on: "From the next time each phone syncs, it asks for the phone's location and records it at each clock tap. People set to Off on their own row stay off.",
      off: "From the next time each phone syncs, no clock tap records a location. People set to On on their own row stay on.",
    },
    me: "Me",
  },
  // Invoices: a draft priced by the admin, issued once, void once.
  invoices: {
    nav: "Invoices",
    title: "Invoices",
    explain:
      "A draft is yours to change. Issuing gives it the next number and freezes it; after that the only change is to void it.",
    newDraft: "New invoice",
    job: "Job",
    currency: "Currency",
    start: "Start draft",
    none: "No invoices yet.",
    number: "Number",
    customer: "Customer",
    total: "Total",
    states: { draft: "Draft", issued: "Issued", void: "Void" },
    // An invoice's status, as contract/invoice-status.ts names it.
    status: {
      draft: "Draft",
      issued: "Issued",
      partly_paid: "Partly paid",
      paid: "Paid",
      overdue: "Overdue",
      void: "Void",
    },
    statusHeader: "Status",
    issuedOn: "Issued",
    due: "Due",
    dueOn: (day: string) => `Due ${day}`,
    balance: "Balance",
    presets: {
      all: "All",
      drafts: "Drafts",
      outstanding: "Outstanding",
      overdue: "Overdue",
      paid: "Paid",
    },
    noneHere: "No invoices to show.",
    truncated: (shown: number) =>
      `Showing the newest ${shown}. Older invoices are on each job's page.`,
    figures: {
      outstanding: (amount: string) => `${amount} outstanding`,
      overdue: (amount: string) => `${amount} overdue`,
      paidThisMonth: (amount: string) => `${amount} paid this month`,
      nothing: "Nothing outstanding, nothing overdue, nothing paid this month.",
    },
    dueDate: "Due date (optional)",
    dueDateHint: "Leave it empty and issuing sets it from the company's payment terms.",
    draftOf: (job: string) => `Draft — ${job}`,
    invoiceNo: (n: number) => `Invoice ${n}`,
    back: "All invoices",
    gone: "There is no invoice at this address.",
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
    noLines: "No lines yet. Add one, or copy a day's hours from below.",
    tax: "Tax",
    subtotal: "Subtotal",
    save: "Save draft",
    saved: "Draft saved.",
    unsaved: "Save the draft before issuing it.",
    noLinesToIssue: "This draft cannot be issued until it has a line.",
    badLine: (n: number) =>
      `Line ${n} needs a description, a quantity above zero and a price.`,
    badTax: "Enter the tax as an amount, or 0.",
    tooLarge: "An amount on this invoice is too large to store.",
    draw: "This job's hours",
    drawExplain:
      "Hours recorded on this job, by day. Copying a day adds a line with those hours as its quantity. The price is yours to type.",
    hoursOf: (quantity: string) => `${quantity} h`,
    add: "Copy hours",
    addOf: (label: string) => `Copy ${label} into a new line`,
    nothingToDraw: "This job has no hours yet.",
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
    pdf: "Download PDF",
    sendHeading: "Email to the customer",
    sendExplain:
      "Sends this invoice as a PDF. Each send is kept here, whether it went or not.",
    sendTo: "Send to",
    send: "Send invoice",
    sendSent: "Sent.",
    sendFailed: "That did not go through. You can send it again.",
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
    unknownOutcome:
      "We could not tell whether that went through. The invoice was read again: look at it, and trying again is safe.",
    reversed: "Payment reversed.",
    notReversed: {
      void: "This invoice is void, so its payments stay as they are.",
      already_reversed: "That payment is already reversed.",
      is_reversal: "A reversal cannot itself be reversed.",
      id_conflict: "That did not go through. Try again.",
    },
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
  signInNotAdded: "No company has added this sign-in. Ask the office.",
  signInNotSetUp: "Sign-in is not set up on this server.",
  // The sign-in page ((auth)/sign-in-frame.tsx) and its form (sign-in/sign-in-form.tsx):
  // one field for a mobile number or an email, then the code. The same thing has the same
  // name in the phone app (apps/mobile/src/i18n).
  signInForm: {
    // Google's own words for its button, which may be translated and not reworded
    // (developers.google.com/identity/branding-guidelines, read 2026-11-23).
    google: "Continue with Google",
    or: "or",
    googleRefused: "No company has added that Google account. Ask the office.",
    signingIn: "Signing you in…",
    gettingReady: "Getting sign-in ready…",
    notLoaded: "Sign-in could not load. Check your connection, then reload this page.",
    backToSignIn: "Back to sign-in",
    usePasskey: "Use a passkey",
    passkeyFailed: "That passkey did not work. Sign in with a code.",
    helper: "Enter your mobile number or email. We will send you a code.",
    address: "Mobile number or email",
    send: "Send me a code",
    sending: "Sending…",
    badAddress: "Enter a ten-digit mobile number or an email address.",
    codeTitle: "Enter the code",
    codeTexted: (number: string) => `We texted it to ${number}.`,
    codeEmailed: (address: string) => `We emailed it to ${address}.`,
    code: "Code",
    checking: "Checking…",
    resend: "Send another code",
    resendIn: (seconds: number) => `Send another code in ${seconds} s`,
    change: "Use a different number or email",
    codeWrong: "That code did not work. Check it, or ask for a new one.",
    codeExpired: "That code has expired. Ask for a new one.",
    tooMany: "Too many tries. Wait a few minutes, then try again.",
    locked: "This sign-in is locked for now. Try again later, or ask the office.",
    failed: "That did not go through. Check your connection and try again.",
    unfinished: "Sign-in could not finish here. Ask the office.",
    trouble: "Trouble signing in?",
    troubleNoCode:
      "No code yet? Wait 30 seconds, then ask for a new one. You can also use your email if the office has it.",
    troubleNewDevice:
      "New phone, lost passkey, or Face ID not working? Sign in with a code. Then turn it on again.",
    troubleNeverInvited: "Never invited? Only the office can add you. Ask them.",
  },
  notPermitted: "Not permitted.",
  requestFailed: "That did not go through. Nothing was saved. Try again.",
  // Under a field the browser finds wrong as a form is sent, in place of its own bubble.
  fieldRefusal: {
    missing: "Fill this in.",
    email: "Enter an email address.",
    other: "This is not a value this field takes.",
  },
  loadFailed: "This page did not load.",
  refreshFailed: (time: string) => `Could not refresh: this is as of ${time}.`,
  loadFailedHelp: "Nothing was changed. Check the connection and try again.",
  tryAgain: "Try again",
  pageError: "Something went wrong on this page.",
  pageErrorHelp: "Nothing was saved by the step that failed. Try again to carry on.",
  reload: "Reload",
  // What stands in for a page that could not be shown (status-screen.tsx).
  fallback: {
    notFoundCode: "Error 404",
    notFoundTitle: "We cannot find that page",
    notFoundBody:
      "The address may be mistyped, or the page may have moved. Nothing was changed.",
    errorCode: "Something went wrong",
    goToToday: "Go to Today",
    goHome: "Go to the homepage",
    goBack: "Go back",
    tryAgain: "Try again",
    reference: "Reference",
  },
  cancel: "Cancel",

  // Editors and create forms
  details: "Details",

  // People
  emptyPeople: "Nobody has been invited yet.",
  addPerson: "Invite a person",
  invite: "Invite",
  name: "Name",
  role: "Role",
  status: "Status",
  edit: "Edit",
  unsavedInPanel:
    "What you changed here is not saved. Save it, or press Escape again to discard it.",
  close: "Close",
  emailTaken: "Another person already has that email.",
  phoneTaken: "Another person already has that mobile number.",
  // The Demo company in production (packages/api, core/demo-door.ts).
  companyClosed: "This demo company cannot invite anyone.",
  mobileNumber: "Mobile number",
  signInAddress: "Sign-in",
  addressNeeded: "Enter a mobile number or an email.",
  mobileNumberInvalid: "Enter a ten-digit United States or Canada number.",
  inviteAddressHint:
    "Give a mobile number, an email, or both. They sign in with a code sent to whichever they type.",
  deactivate: "Deactivate",
  reactivate: "Reactivate",
  lastAdmin: "This is the last admin. Make someone else an admin first.",
  deactivatePersonEffect: (name: string) =>
    `${name} will not be able to sign in or send hours from their phone. Hours the office already has stay on record.`,
  unchanged: "No change.",
  active: "Active",
  // Where a person's invitation stands (packages/api, contract/invitation.ts).
  invitationStatus: {
    not_sent: "Not sent",
    sent: "Sent · not verified",
    verified: "Verified",
  },
  deactivated: "Deactivated",
  roles: { admin: "Admin", worker: "Worker" },
  // A passkey in the office (clerk-passkeys.tsx): the offer on Today right after a code,
  // and the list in Settings.
  passkeys: {
    title: "Passkeys",
    explain:
      "A passkey signs you in to the office with this device's own lock, without a code. Your face or fingerprint never leaves the device.",
    offer:
      "Sign in faster next time: add a passkey, and this device's own lock signs you in without a code.",
    add: "Add a passkey",
    notNow: "Not now",
    added: "Passkey added. Next time, choose Use a passkey.",
    removed: "Passkey removed.",
    none: "No passkeys yet.",
    unnamed: "Passkey",
    addedOn: (day: string) => `Added ${day}`,
    lastUsed: (day: string) => `last used ${day}`,
    neverUsed: "never used",
    remove: "Remove",
    removeEffect: (name: string) =>
      `${name} will no longer sign you in. You can still sign in with a code, and add a passkey again.`,
    signInAgain: "Sign in again",
    failures: {
      sign_in_again:
        "Sign in again first: a passkey can be added or removed within ten minutes of signing in.",
      cancelled: "Nothing was changed.",
      exists: "This device already has a passkey for you.",
      unsupported: "This browser cannot use passkeys.",
      failed: "That did not go through. Try again.",
    },
  },
  // A person, opened from their row in a side panel.
  personPanel: {
    open: (name: string) => `Open ${name}`,
    makeAdmin: "Make an admin",
    makeAdminEffect: (name: string) =>
      `${name} will see and change everything in this office: everyone's hours, the schedule, invoices and this list.`,
    makeWorker: "Make a worker",
    makeWorkerEffect: (name: string) =>
      `${name} will no longer open this office: only their own week, their hours and Me.`,
    ownRole: "Your own role is changed by another admin.",
    location: "Location stamps",
    locationExplain:
      "Whether their clock taps record where the phone is. As the company follows the setting for everyone.",
    locationAs: { company: "As the company", on: "On", off: "Off" },
    saveLocation: "Save location",
    numbers: "Numbers",
    signInNumber: (number: string) => `Sign-in: ${number}`,
    contactNumber: (number: string) => `Contact: ${number}`,
    noNumber: "No number on record.",
    whileDeactivated: "Reactivate this person first to change this.",
    theirWeek: "Their week in Hours",
    invitation: "Invitation",
    invitationExplain:
      "They have not signed in yet. Send them where to get the app: the message is written, in English and Spanish, ready to send with the buttons below.",
    invitedOn: (day: string) => `Invited ${day}`,
    sendByWhatsApp: "Send by WhatsApp",
    sentIt: "I sent it",
    sendByEmail: "Send by email",
    emailGoesTo: (email: string) =>
      `By email, TRADER sends the same message to ${email}.`,
    emailed: (email: string) => `Sent to ${email}.`,
    byWhatsApp: (by: string, at: string) => `By WhatsApp from ${by}, ${at}`,
    copiedBy: (by: string, at: string) => `Copied by ${by}, ${at}, not yet sent`,
    openedBy: (by: string, at: string) =>
      `Opened in WhatsApp by ${by}, ${at}, not yet sent`,
    byEmail: (by: string, at: string) => `By email, sent by ${by}, ${at}`,
    emailNotSent: (by: string, at: string) => `Email not sent (tried by ${by}, ${at})`,
    refused: {
      id_conflict: "That did not go through. Try again.",
      deactivated: "They are deactivated. Nothing was sent.",
      signed_in: "They have already signed in. Nothing was sent.",
      no_email: "They have no email on record.",
      no_number: "They have no sign-in number on record.",
      no_link: "This server has no address of its own to link to. Nothing was sent.",
      too_many: "That is enough email for one day. Send it again tomorrow.",
      company_closed: "This demo company cannot invite anyone.",
    },
    copyInvitation: "Copy the message",
    copied: "Copied. Paste it into a WhatsApp message to them, then press I sent it.",
    opened: "When it has gone in WhatsApp, press I sent it.",
    // The addresses a worker signs in with, changed by the office (people.setEmail,
    // people.setSignInPhone).
    addresses: "Sign-in addresses",
    addressesExplain:
      "What they type to sign in. Leave one empty to take it away: one of the two always stays.",
    adminAddresses:
      "An admin's sign-in addresses are not changed here. Ask TRADER support: support@jpteq.app",
    signInNumberField: "Sign-in number",
    changeEmail: "Change the email",
    changeNumber: "Change the sign-in number",
    changeEffect: (name: string, address: string) =>
      `Whoever has ${address} will be able to sign in as ${name}. ${name} is signed out everywhere and signs in again with it.`,
    removeEffect: (name: string, address: string) =>
      `${name} will no longer sign in with ${address}, and is signed out everywhere.`,
    addressChanged: "Changed. They are signed out, and sign in with it from now on.",
    addressMatched: "Their sign-in now matches this.",
    emailInvalid: "Enter an email address, or leave it empty to take it away.",
    addressRefused: {
      admin:
        "An admin's sign-in addresses are not changed here. Ask TRADER support: support@jpteq.app",
      deactivated: "They are deactivated. Nothing was changed.",
      last_address:
        "They need one address to sign in with. Give them the other one first.",
      email_taken: "Another person already has that email.",
      phone_taken: "Another person already has that mobile number.",
      address_held: "That address cannot be used. Nothing was changed.",
      no_login:
        "This person has no sign-in to change yet. It can be changed once they have signed in.",
      company_closed: "This demo company cannot change anyone's address.",
    },
    addressWas: {
      email: {
        given: (to: string, by: string, at: string) =>
          `Email ${to} given by ${by}, ${at}`,
        changed: (from: string, to: string, by: string, at: string) =>
          `Email changed from ${from} to ${to} by ${by}, ${at}`,
        removed: (from: string, by: string, at: string) =>
          `Email ${from} taken away by ${by}, ${at}`,
      },
      sign_in_phone: {
        given: (to: string, by: string, at: string) =>
          `Sign-in number ${to} given by ${by}, ${at}`,
        changed: (from: string, to: string, by: string, at: string) =>
          `Sign-in number changed from ${from} to ${to} by ${by}, ${at}`,
        removed: (from: string, by: string, at: string) =>
          `Sign-in number ${from} taken away by ${by}, ${at}`,
      },
    },
    invitedNote: (name: string) =>
      `${name} is invited. Now tell them where to get the app.`,
  },
  // Hours narrowed to one person, from their panel.
  onlyPerson: (name: string) => `Only ${name}.`,
  showEveryone: "Show everyone",

  // Customers
  emptyCustomers: "No customers yet.",
  addCustomer: "Add customer",
  customerAdded: (name: string) => `${name} added.`,
  address: "Address",
  phone: "Phone",
  companyPhoneHelp:
    "The crew messages the office on WhatsApp at this number. Include the country code; a number without one is read as a United States number.",
  notes: "Notes",
  jobsUnarchived: (n: number) =>
    `${n === 1 ? "1 of this customer's jobs is" : `${n} of this customer's jobs are`} not archived. Archive ${n === 1 ? "it" : "them"} first.`,
  deactivateCustomerEffect:
    "No new job can be added for this customer. Its past jobs stay.",

  remove: "Remove",

  // Jobs
  jobForm: {
    open: (name: string) => `Open ${name}`,
    editShort: "Edit",
    added: (name: string) => `${name} added.`,
    newCustomer: "+ A new customer",
    newCustomerName: "New customer's name",
    hoursWeek: "Hours this week",
    hoursToDate: "Hours to date",
    notes: "Notes for the crew",
    notesHint: "The crew sees these on their phones, on the job's card.",
    location: "Location (optional)",
    locationHint:
      "Paste the coordinates from a map, like 41.8240, -71.4128, or a maps address that shows them.",
    locationFromCrew:
      "An admin can also set it from the phone's Crew tab, standing at the jobsite.",
    locationProblem: {
      empty: "Paste the coordinates, or leave the location empty.",
      short_link:
        "A short maps link hides the coordinates. Open it, press and hold the place on the map, and copy the two numbers it shows.",
      unreadable:
        "That is not a pair of coordinates or a maps address that shows them. It looks like 41.8240, -71.4128.",
      out_of_range: "Those numbers are not a place: check the coordinates.",
    },
    badRadius: `Enter the radius in whole meters, from 1 to ${MAX_JOBSITE_RADIUS_M}.`,
  },
  // One job's own page.
  jobPage: {
    back: "All jobs",
    gone: "There is no job at this address.",
    steps: "Where this job stands",
    step: {
      scheduled: "Scheduled",
      hoursRecorded: "Hours recorded",
      invoiced: "Invoiced",
      paid: "Paid",
    },
    notYet: (step: string) => `Not yet: ${step}`,
    schedule: "Schedule",
    createInvoice: "Create invoice",
    openDraft: "Open its draft",
    noHoursClosed: "No hours were recorded on this job, so there is nothing to invoice.",
    waitingForHours: "Hours appear here once the crew clocks in on this job.",
    waitingForPayment: "A payment is noted on the invoice itself.",
    people: "People",
    hoursLine: (week: string, toDate: string) =>
      `${week} h this week, ${toDate} h to date.`,
    onItNow: "On it now",
    scheduledThisWeek: "Scheduled this week",
    noPeople: "Nobody is scheduled on this job this week, and nobody has hours on it.",
    noInvoices: "No invoices for this job yet.",
    location: "Location",
    locationIs: (pair: string, radius: number) => `${pair}, within ${radius} m`,
    none: "None",
    edit: "Edit the details",
    openJob: (name: string) => `${name}: where the job stands`,
  },
  emptyJobs: "No jobs to show.",
  addJob: "Add job",
  job: "Job",
  customer: "Customer",
  chooseCustomer: "Choose a customer",
  radiusM: "Radius (m)",
  show: "Show",
  allJobs: "All",
  jobStatus: { open: "Open", complete: "Complete", archived: "Archived" },
  saveDetails: "Save details",
  setStatus: "Set status",
  archiveJobEffect:
    "The job leaves the phones' job list and nobody can be scheduled on it. Its hours and invoices stay.",
  customerInactive: "That customer is deactivated.",
  customerInactiveOnStatus:
    "This customer is deactivated. Reactivate them, or move the job to another customer first.",
  hasInvoices: "This job has invoices; its customer can no longer change.",
  archivedNote:
    "Archived jobs leave the phones' job list on the next sync; anyone still on the clock there can still clock out.",
  person: "Person",
  chooseJob: "Choose a job",
  planFrom: "From",
  planThrough: "Through",
  date: "Date",

  // Hours
  hoursRange: "Choose up to 31 days, the first no later than the last.",
  emptyHours: "No hours are recorded for this person on these days.",
  hoursOpenSince: (day: string) =>
    `Still on the clock since ${day}. They cannot clock in again until that time is ended or corrected.`,
  sessionCounts: {
    eligible: "Counts",
    voided: "Voided",
  },
  // The cell says it whole: a narrow row shows no column heading.
  flags: "Flags",
  entryTypes: {
    started: "Clock in",
    paused: "Break start",
    resumed: "Break end",
    ended: "Clock out",
    voided: "Void",
  },
  // The day panel: a person's day, entry by entry.
  dayOf: (name: string, day: string) => `${name}, ${day}`,
  entryWas: (time: string) => `Was ${time}`,
  entryBy: (name: string) => `Recorded by ${name}`,
  entryReceived: (when: string) => `received ${when}`,
  noLocation: "No location",
  offSite: "Off-site",
  previewWorked: (worked: string) => `These times give ${worked} worked.`,
  previewOpen: (worked: string) =>
    `These times give ${worked} worked so far, with no clock out.`,
  previewNone: "Enter every time, in order, to see the hours they give.",
  entryVoids: "Voids this time",
  reasonTags: {
    offline: "offline",
    corrected: "corrected",
    user_timed: "entered by hand",
    location: "location",
    clock_skewed: "phone clock off",
    unscheduled: "not on the schedule",
  },
  reconExplain:
    "Each person's hours by day and job, for the days you choose. Every entry counts; a flag says why you may want to look at it. A day's time on a job is added up first, then rounded to the hundredth of an hour.",
  workDatesIn: (zone: string) => `Work dates in ${zone}.`,
  noHoursYet: "No hours have ended on these days yet.",
  reconTotal: (hours: string) => `${hours} h on these days`,
  hoursValue: (hours: string) => `${hours} h`,
  emptyReconciliation: "No hours are recorded on these days.",

  // Correcting hours
  correct: "Correct",
  correctionOf: (job: string, started: string) => `Correct ${job}, ${started}`,
  correctionExplain:
    "Change a time or the job, or add an entry that is missing. Each change is a new entry and counts at once.",
  correctionTimes: "Times",
  correctionAdded: "Entries to add",
  addEntry: "Add an entry",
  addedEntryType: (n: number) => `Entry ${n}`,
  addedEntryTime: (n: number) => `Entry ${n} time`,
  saveCorrection: "Save correction",
  correctionSaved: "Saved.",
  correctionBadTime:
    "Enter a date and a time. A time the clocks skipped that day cannot be used.",
  correctionTooMany: "At most 20 changes at a time. Save some, then make the rest.",
  correctionUnsent:
    "That did not go through. Try again: the same correction is sent, so it cannot be recorded twice.",
  correctionChanged:
    "These hours changed since they were shown. They have been refreshed: check them, then correct them again.",
  voidSession: "Void this time",
  voidSessionEffect:
    "This time will no longer count. If it is still on the clock, it is clocked out first. Its entries stay on record.",
  addMissingHours: "Add missing hours",
  missingHoursExplain:
    "Hours nobody recorded: a clock in and, when it is known, the clock out. They count at once, flagged as entered by hand.",
  missingClockIn: "Clock in",
  missingClockOut: "Clock out (optional)",
  addHours: "Add hours",
  // One sentence per answer of labor.correct (labor/correct.ts); hours/day-panel.tsx holds this
  // list to the server's codes.
  correctionRejected: {
    no_open_session:
      "They were not on the clock at that time for one of these entries. Check the times.",
    session_already_open:
      "They are already on the clock at that time. End or correct that time first.",
    not_paused: "A break end needs a break start before it.",
    already_paused: "They are already on a break at that time.",
    target_missing:
      "These hours changed since they were shown. Show them again, then correct them.",
    target_is_correction:
      "These hours changed since they were shown. Show them again, then correct them.",
    correction_of_void: "A void cannot be corrected.",
    correction_type_mismatch:
      "These hours changed since they were shown. Show them again, then correct them.",
    correction_job_mismatch: "Only a clock in can move to another job.",
    void_target_not_started:
      "These hours changed since they were shown. Show them again, then correct them.",
    already_voided: "This time is already voided.",
    breaks_following_event:
      "That time would put an entry out of order with the ones after it. Change those in the same correction.",
    correction_superseded:
      "These hours changed since they were shown. Show them again, then correct them.",
    correction_moves_session:
      "That time would move an entry into another stretch on the clock. Keep it between its own clock in and clock out.",
    job_id_mismatch: "An added entry must be on the same job as the rest of that time.",
    id_conflict: "That did not go through. Nothing was saved. Save again.",
    time_in_future: "One of these times has not happened yet.",
    correction_stale:
      "These hours changed since they were shown. They have been refreshed: check them, then correct them again.",
    void_leaves_session_open:
      "This time is still on the clock, so voiding it alone would leave them clocked in. Refresh, then void it again.",
  },

  // The Hours screen as a week: people by days, the presets, the strip of who is still on the clock
  // and the export's dialog.
  week: {
    thisWeek: "This week",
    lastWeek: "Last week",
    dates: "Dates",
    flaggedOnly: "Flagged only",
    show: "Show these dates",
    caption: (range: string) => `Hours by person and day, ${range}`,
    listCaption: (range: string) => `Hours by person, date and job, ${range}`,
    total: "Total",
    allPeople: "Everyone",
    openDay: (name: string, day: string) => `${name}, ${day}: open the entries`,
    openHeading: "Still on the clock",
    openSince: (name: string, job: string, day: string) =>
      `${name} at ${job}, since ${day}`,
    openExplain: "No clock-out yet, so this time is in no figure below.",
    stillOpenBadge: "on the clock",
    emptyFlagged: "Nothing is flagged on these days.",
    export: "Export for payroll",
    exportTitle: "Export hours for payroll",
    exportTotal: (hours: string) => `${hours} h in all`,
    exportFlagged: (n: number) =>
      n === 0
        ? "No flagged entries."
        : n === 1
          ? "1 flagged entry you may want to look at first."
          : `${n} flagged entries you may want to look at first.`,
    exportOpen: (n: number) =>
      n === 0
        ? "Nobody is still on the clock."
        : n === 1
          ? "1 person is still on the clock. That time is not in the file."
          : `${n} people are still on the clock. That time is not in the file.`,
    exportHolds:
      "One row per person, day and job, with each row's flags. Hours only: no rates and no pay. Nothing is frozen: the same dates later give the hours as they are then.",
    download: "Download CSV",
    downloaded: (filename: string) => `Saved ${filename}.`,
  },

  hours: "Hours",
  timesIn: (zone: string) => `Times in ${zone}.`,
  worked: "Worked",
  breaks: "Breaks",
  stillOpen: "Still on the clock",
  timeCorrected: "Corrected",
  duration: (h: number, m: number) => `${h} h ${String(m).padStart(2, "0")} min`,

  // Me
  managedBySignIn: "The office changes it.",
  adminAddressesCaption: "Ask TRADER support to change it: support@jpteq.app",
  signInNumber: "Sign-in number",
  signInNumberCaption: "Your sign-in code is sent here. The office changes it.",
  save: "Save",
  saved: "Saved.",
};

export type Catalog = typeof en;
