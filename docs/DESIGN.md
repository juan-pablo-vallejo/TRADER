# TRADER — Design

How the product looks and behaves on screen. Every token here is a decision; the first screen
built turns them into a `theme` module per app, and nothing hard-codes a color or a size.

## Design principles

1. **Built for the jobsite.** Gloves, sunlight, one hand, a phone going back in a pocket. Targets
   are at least 48 pt, the primary action is one large button, and crew-facing text never drops
   below 15 pt.
2. **Honest state, always visible.** Every screen shows whether the device is offline and whether
   the day's entries have reached the office. A spinner is never a substitute for a state.
3. **One screen, one decision.** The crew app asks one question at a time: which job, clock in or
   out, submit or not. Settings and history live behind a single secondary route.
4. **Spanish is a first-class language, not a translation pass.** Layouts are measured with
   Spanish strings, which run about 30% longer; nothing truncates and nothing is fixed-width.
5. **Ceremony matches consequence.** Clocking in is one tap plus the biometric prompt. Submitting
   a closeout shows what is being submitted first. Nothing is confirmed with a bare "Are you
   sure?".
6. **Accessible by default.** WCAG AA contrast, dynamic type up to the OS's large sizes, every
   control labelled for a screen reader, and color never the only carrier of meaning — status
   always has a word or an icon beside it.
7. **Plain.** No illustration beyond the brand mark, no gradients, no decorative motion. Motion
   exists only to show a state changing, and it respects the reduce-motion setting.

## Design tooling

This document is the authority for every decided token, component and rule. Figma is where
alternatives are explored and populated screens are reviewed before a change is decided: a
frame is a proposal until its outcome is written here, and nothing in code follows a frame this
document does not yet reflect. One file, _TRADER — Office_, on the owner's team, with three
pages: _Tokens_, generated from the web theme module and never hand-edited; _Screens as built_,
the populated office screens at 390 and 1280; _Explorations_, dated, one per review finding.
Frames and screenshots stay in Figma; the repository holds this document and the code.

## Color palette

Light theme only in V1; dark theme is listed after V1. One accent, reserved for actions and the
active session; one brand red, reserved for the mark; three status colors, reserved for status.
The accent and the brand red are sampled from the logo (see Brand). Values are sRGB hex.

| Token           | Hex       | Use                                                  |
| --------------- | --------- | ---------------------------------------------------- |
| `ink`           | `#111827` | Primary text, the wordmark                           |
| `ink-secondary` | `#4B5563` | Secondary text, captions                             |
| `border`        | `#D1D5DB` | Hairlines, input borders                             |
| `surface`       | `#FFFFFF` | Cards, inputs, sheets                                |
| `canvas`        | `#F3F4F6` | Screen background                                    |
| `accent`        | `#2808AC` | Primary button, active session, links (logo indigo)  |
| `on-accent`     | `#FFFFFF` | Text and icons on `accent`                           |
| `brand`         | `#BC0C0C` | Mark and wordmark only; never a control or a status  |
| `synced`        | `#166534` | Delivered to the office; approved                    |
| `pending`       | `#92400E` | On the device, not yet delivered; offline banner     |
| `attention`     | `#991B1B` | Rejected, failed, needs approval, destructive        |
| `muted`         | `#6B7280` | Disabled and placeholder only — exempt from contrast |

Tints for pills and banners are the status color at 10% over `surface`, with the text in the
status color. Verified contrast: every text token above `muted` meets 4.5:1 on `surface`, on
`canvas` and on its own tint (lowest: `brand` on its tint, 5.5:1; `accent` on its tint, 10.0:1);
`on-accent` on `accent` is 12.2:1. `brand` and `attention` are both reds, which is why `brand`
never colors a control: an action is indigo, a problem is dark red, and the mark is neither.

## Typography

System fonts: SF Pro on iOS, Roboto on Android, `system-ui` on web. No custom font in V1 — it
would cost bundle size and an offline load path for nothing a crew would notice.

| Style         | Size / line | Weight                       | Use                                         |
| ------------- | ----------- | ---------------------------- | ------------------------------------------- |
| `display`     | 40 / 44     | 600, tabular figures         | Elapsed time on the clock screen            |
| `title`       | 24 / 30     | 600                          | Screen title                                |
| `heading`     | 20 / 26     | 600                          | Section and card titles                     |
| `body`        | 17 / 24     | 400                          | Default text                                |
| `body-strong` | 17 / 24     | 600                          | Job names, amounts                          |
| `secondary`   | 15 / 20     | 400                          | Meta and captions — the floor for crew text |
| `label`       | 13 / 16     | 600, uppercase, 0.5 tracking | Field labels and pill text; office meta     |

Numbers that get compared — times, hours, money — use tabular figures. Money renders from
integer cents through the locale formatter; dates and times render in the company's timezone.

## Layout and spacing

- 4 pt grid. Screen padding 16; card padding 16; 12 between stacked controls; 24 between
  sections.
- Corner radius 8 on cards and inputs, 12 on the primary button. One elevation level: a 1 pt
  `border`, no drop shadows.
- Crew app: single column, portrait, safe-area aware; the primary button docks above the home
  indicator. Office web: responsive, usable on a phone and a desktop. Wide: 1280 pt target,
  12-column grid, dense tables, left navigation. Narrow: one column, table rows stacked,
  navigation in a menu, targets at least 48 pt. One breakpoint, 768 pt: narrow below it, wide at
  or above it, set with the first office screen. No screen scrolls sideways at any width: a
  data table whose own column is under 720 pt shows its rows the narrow way.
- Office shell: a 56 pt header with the mark, the wordmark, the signed-in name linking to the
  profile, and Sign out. Navigation is grouped by the work, not the table: Work — Jobs,
  Customers; People — Roster, Crews, Refused entries; a destination appears when its screen exists, and `/` opens
  the first one. Keyboard focus is a 2 pt `accent` outline, offset 2 pt.
- Icons: one icon set at 24 pt with a 2 pt stroke, chosen by the first screen that needs one and
  never mixed with emoji.
- The office web is online-only. A request made with no connection fails at once with its
  result note or the load-failure banner; nothing is held and sent later, so the screen never
  shows a write the server has not confirmed. The sync banner and the delivery-state pills
  belong to the crew app, where entries are held.

## UI components

| Component                | Specification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary button           | 56 pt tall, full width, `accent`, `body-strong` label; one per screen; disabled uses `muted` with the reason shown beneath; office web, wide: 48 pt, as wide as its label                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Secondary button         | 48 pt, `surface` with `border`, `ink` label                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Destructive button       | Secondary shape, `attention` border and label; never full width                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Destructive action (web) | Two presses. The first replaces the button with one sentence saying what will happen to the person or record, the destructive button, and Cancel; the second does it. The sentence names the consequence ("…will not be able to sign in"), never asks "Are you sure?". In a list, the sentence and buttons take the line beneath the item                                                                                                                                                                                                                                                                                           |
| Status pill              | 24 pt tall, tint plus the status word; the vocabulary `pending · syncing · synced · failed · needs attention · offline` is the same on every screen. Office record states are words in `ink-secondary`; only an exception is a pill — `Invited` in the `pending` tint, `Needs a foreman` in the `attention` tint                                                                                                                                                                                                                                                                                                                    |
| Record states (crew)     | What each pill means for an entry, never a new word: `pending` — on this phone, waiting, including while the office has paused sync or the app needs an update; `syncing`; `synced`; `failed` — a send did not get through and will be tried again; `needs attention` — the office's server refused this entry. A refused entry opens to its reason in plain words and "Tell the office — it can enter these hours for you"; it is never deleted or hidden, and a held entry is never shown as refused                                                                                                                              |
| Sync banner              | Full-width strip under the header whenever offline or anything is pending; `pending` tint; never dismissible. It says why entries are waiting, always with the count held and "Your entries are saved on this phone": offline; sync paused by the office (`read_only`, `paused`) — "They will send when sync is back"; update required — "Update TRADER to send them", with the store link as a secondary button. Clocking in and out stays available in every one                                                                                                                                                                  |
| Own history (crew)       | The worker's own sessions, materials and assignments by day, read-only, each with its delivery pill and, when it waits for the office, the reason tags of the approval row. No edit control anywhere: one line, "Something wrong? Ask the office to correct it." Never another worker's entries                                                                                                                                                                                                                                                                                                                                     |
| Clock card               | Current job, elapsed `display` time, attestation level as a caption, one primary action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Job card                 | 72 pt row: customer and job name, address, today's hours; tap selects                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Approval row (web)       | Entry, who, job, time, hours; reason tags `offline`, `edited`, `time set by user`, `location`, `clock skew`, `after closeout`; approve and reject are buttons, never bare icons. A `clock skew` entry shows the time the phone recorded and the time the server received it, labelled, side by side: approving keeps the recorded time, rejecting leaves the hours out until the office repairs them; no control edits the time in place. A material entered by the office carries "Entered by the office" and the admin's name                                                                                                     |
| Form field               | `label` above, 48 pt input, helper or error text beneath in `attention`; numeric keyboards for quantities and money                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| List row                 | 56 pt, leading text, trailing value or chevron, hairline separator                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Photo tile               | 96 pt square, upload-state pill in the corner, tap to view                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Empty state              | One sentence and one action; no illustration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Attention banner         | `attention` tint, what happened and what to do, persistent until resolved                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Data table (web)         | Sticky header, 44 pt rows, right-aligned numbers, no zebra striping, inline status pills. Narrow: each row is two lines — its name in `body-strong`, the other cells in `secondary` joined by a middle dot, an empty cell omitted — with the row's action trailing                                                                                                                                                                                                                                                                                                                                                                  |
| Page header (web)        | The screen `title` and at most one primary action on one row. The list comes next; a create form opens beneath the header only when its action is pressed, and closes when it has saved                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Refused entries (web)    | A lookup, not a list: who sent the entries and the day the server received them, then Find. One sentence above the form says what is kept and for how long, that the day is the day received and may be later than the day worked, and that the entry itself stays on the phone. Results are a data table — result in plain words (`Refused`, `Not processed; the phone sends it again`, `The whole send failed`), the kind of entry, the reason code as the server gave it, the time received, the first eight characters of the request id. Read-only: no control repairs, resends or deletes; an empty result is the empty state |
| Row editor (web)         | Opens beneath its row. Sections, each with its own secondary button, under a `body-strong` heading when it holds more than one field; a destructive button stands last and alone; removing one item from a list is an `attention` text action, never a bordered button                                                                                                                                                                                                                                                                                                                                                              |
| Result note              | `secondary`, beneath the control that caused it, announced to a screen reader: "Saved." in `synced`, a refusal in `attention`, "No change." in `ink-secondary`. Every write answers with one — a successful write never ends in silence — and a row being edited stays on screen, whatever the list's filter, until its editor is closed                                                                                                                                                                                                                                                                                            |
| Load failure (web)       | The attention banner in place of the list: the page did not load, nothing was changed, and a "Try again" secondary button that refetches. A failed write is never this banner; it is the result note beneath its control                                                                                                                                                                                                                                                                                                                                                                                                            |
| Assignment row           | Date, job and expected start–end under a "Planned" label in `ink-secondary`; never shown as hours, summed, or colored as a status. Office only: when the worker could not clock in on that job as crews stand, the row carries a `Not on this job's crew` pill in the `attention` tint and the sentence "This plan does not let them clock in here — add them to the crew to allow it"; saving the assignment is never blocked by it                                                                                                                                                                                                |
| Closeout (web)           | Review first, then one primary button to submit what was reviewed. For an admin on an archived job or a job with no crew, a `secondary` line above the review says so ("Archived job", "No crew on this job") and that the job's status will not change; the review and the submit are otherwise the foreman's                                                                                                                                                                                                                                                                                                                      |
| Material entry (web)     | The office's form for a receipt the crew never logged: job, date, description, quantity, unit, optional cost. Saved rows read "Entered by the office" with the admin's name wherever the receipt appears; on a closed-out day the result note says it now waits for another admin's approval. Never an editor for a receipt someone else logged                                                                                                                                                                                                                                                                                     |
| Pay-period close (web)   | A destructive action. Its sentence states the consequence — the period and its export can never be changed — and, when anything is unresolved, the counts ("7 entries still wait for approval; they will be paid as adjustments in a later period") with a checkbox the admin must tick before the destructive button enables                                                                                                                                                                                                                                                                                                       |
| Adjustment line (web)    | In the reconciliation view and the payroll export preview, under an "Adjustments from earlier periods" heading, apart from the period's own hours: worker, job, "worked" date, signed hours in tabular figures; never merged into a day's total                                                                                                                                                                                                                                                                                                                                                                                     |
| Invoice line (web)       | Draft only: description, quantity, unit, and a customer price field the admin fills. A line drawn from labor or a material arrives with its description and quantity and an empty price; the job's cost is shown beside the invoice as "Job cost — for your reference", never inside a price field. An issued invoice shows no field at all                                                                                                                                                                                                                                                                                         |
| Export panel (web)       | Three separately named secondary buttons, never one "Export": "QuickBooks Online — invoices (CSV)", "QuickBooks Desktop — invoices (IIF)", "Payroll hours (CSV)". Under each, what the file contains and the import steps for that edition; a `secondary` list headed "Enter by hand" names what the file leaves out — a tax setup the import does not take, credit memos — with the figures to enter and the totals to reconcile against. No text promises the import will succeed                                                                                                                                                 |
| Profile form             | Name and contact phone as form fields; email read-only, captioned "Managed by your sign-in provider"; no role, company or identity field                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Job suggestion           | Card above the job list: "Suggested job" with "from an approximate location — check before clocking in"; never a distance, a map or "you are here"; its primary button is the normal clock-in for that job, with "Choose another job" beside it; absent with no permission, no reading, a low-accuracy reading, no match, several matches or a stale job list; never clocks in by itself                                                                                                                                                                                                                                            |
| Location explainer       | Shown once before the OS permission prompt: the one reading that suggests a job stays on this phone and is never sent; a clock-in, clock-out or job switch you confirm sends its location stamp to the office, as every clock event does, and one without a stamp goes to office approval; declining keeps manual job selection, and nothing ever clocks in by itself; "Not now" is a secondary button; re-offered only from settings                                                                                                                                                                                               |

## Localization

Crew app: English and Spanish, selectable in-app and defaulting to the device language. All
strings live in message catalogs with ICU plurals; dates, times and currency go through the
platform formatter in the company's timezone. Office web: English in V1, built through the same
catalog so Spanish is a translation, not a rewrite.

## Brand

The mark is the D Sierra Painting logo: the crossed roller and brush in two reds with an indigo
outline, over the name. Two files in `assets/brand/`, both on white with no alpha:

| File       | Size        | Use                                                                        |
| ---------- | ----------- | -------------------------------------------------------------------------- |
| `logo.png` | 2048 × 2048 | Full mark with the name: splash, sign-in screen, favicon                   |
| `icon.png` | 1024 × 1024 | Tools glyph alone: app icon, adaptive icon, and the office header at 32 pt |

The mark sits on `surface` white, never on `canvas` or a tint, and is never recolored. Minimum
rendered size: 96 pt for `logo.png` so the name stays legible, 24 pt for `icon.png`. The
wordmark is "TRADER", weight 600, `ink`, placed beside or under the mark: set in `title` where
it stands alone (splash, sign-in), and in `heading` inside the 56 pt office header, where
`title` would crowd the signed-in name on a phone. Every tenant sees this mark in V1; a
per-company logo is listed after V1 in PRD.md.
