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
  indicator. Office web: 1280 pt target, 12-column grid, dense tables, left navigation.
- Icons: one icon set at 24 pt with a 2 pt stroke, chosen with the first screen and never mixed
  with emoji.

## UI components

| Component          | Specification                                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary button     | 56 pt tall, full width, `accent`, `body-strong` label; one per screen; disabled uses `muted` with the reason shown beneath                          |
| Secondary button   | 48 pt, `surface` with `border`, `ink` label                                                                                                         |
| Destructive button | Secondary shape, `attention` border and label; never full width                                                                                     |
| Status pill        | 24 pt tall, tint plus the status word; the vocabulary `pending · syncing · synced · failed · needs attention · offline` is the same on every screen |
| Sync banner        | Full-width strip under the header whenever offline or anything is pending; `pending` tint; never dismissible                                        |
| Clock card         | Current job, elapsed `display` time, attestation level as a caption, one primary action                                                             |
| Job card           | 72 pt row: customer and job name, address, today's hours; tap selects                                                                               |
| Approval row (web) | Entry, who, job, time, hours; reason tags `offline`, `edited`, `time set by user`, `location`; approve and reject are buttons, never bare icons     |
| Form field         | `label` above, 48 pt input, helper or error text beneath in `attention`; numeric keyboards for quantities and money                                 |
| List row           | 56 pt, leading text, trailing value or chevron, hairline separator                                                                                  |
| Photo tile         | 96 pt square, upload-state pill in the corner, tap to view                                                                                          |
| Empty state        | One sentence and one action; no illustration                                                                                                        |
| Attention banner   | `attention` tint, what happened and what to do, persistent until resolved                                                                           |
| Data table (web)   | Sticky header, 44 pt rows, right-aligned numbers, no zebra striping, inline status pills                                                            |

## Localization

Crew app: English and Spanish, selectable in-app and defaulting to the device language. All
strings live in message catalogs with ICU plurals; dates, times and currency go through the
platform formatter in the company's timezone. Office web: English in V1, built through the same
catalog so Spanish is a translation, not a rewrite.

## Brand

The mark is the D Sierra Painting logo: the crossed roller and brush in two reds with an indigo
outline, over the name. Two files in `assets/brand/`, both on white with no alpha:

| File       | Size        | Use                                                                              |
| ---------- | ----------- | -------------------------------------------------------------------------------- |
| `logo.png` | 2048 × 2048 | Full mark with the name: splash, sign-in screen, office header, favicon          |
| `icon.png` | 1024 × 1024 | Tools glyph alone: app icon and adaptive icon, where the name would be illegible |

The mark sits on `surface` white, never on `canvas` or a tint, and is never recolored. Minimum
rendered size: 96 pt for `logo.png` so the name stays legible, 24 pt for `icon.png`. The
wordmark is "TRADER" set in `title`, weight 600, `ink`, placed beside or under the mark. Every
tenant sees this mark in V1; a per-company logo is listed after V1 in PRD.md.
