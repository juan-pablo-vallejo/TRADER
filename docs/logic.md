# Behavioural Logic

The normative rules the system must obey, stated once and numbered so code, tests and reviews
can cite them. Every rule here is testable: it says what must hold, not what it is for.

_Why_ a rule is what it is → [DECISIONS.md](DECISIONS.md). _What the system is_, in narrative
form → [SPEC.md](SPEC.md). _When each rule gets built_ → [ROADMAP.md](ROADMAP.md). This file
owns the rules themselves; the others link here rather than restating them.

Rules are identified by group and number — `SESSION-3`, `ATTEST-5`. **Identifiers are permanent.**
A withdrawn rule keeps its number and is marked withdrawn; numbers are never reused, so a
citation in a two-year-old test never silently points at a different rule.

Rules marked **`[unbuilt]`** describe intended behaviour that no code implements yet. Rules with
an **open parameter** name a value that is deliberately undecided; the decision is tracked in
[DECISIONS.md](DECISIONS.md)'s Open table.

---

## AUTH — getting in

**`[unbuilt]`** — Clerk is chosen but not yet wired, and no invite or enrolment code exists.

**AUTH-1.** **Accounts are created by invitation only.** There is no public sign-up. A payroll
system with an open front door is a payroll system strangers can appear in.

**AUTH-2.** The one exception is the **first admin of a company**, provisioned by seed, because
nobody exists yet to invite them.

**AUTH-3.** An invitation is issued by an admin to a **phone number**, and is **single-use and
expiring**.

**AUTH-4.** Accepting an invitation **verifies the phone number once**, then enrols a **passkey
guarded by the device's biometrics**. This is what "sign up with Face ID" means in practice:
the device generates a keypair and Face ID guards the private half.

**AUTH-5.** After enrolment, **sign-in is passkey-only** — no SMS code on the happy path.

**AUTH-6.** The phone number is the **recovery channel**. Recovery re-verifies the phone and
enrols a **new** passkey; the previous credential is revoked rather than left live. A crew breaks
phones, so this path is ordinary rather than exceptional and must be self-service.

**AUTH-7.** Passkeys require **iOS 16+ or Android 9+**. A device below that cannot hold one, and
those users sign in by phone OTP instead. **This is a supported state, not an error** — the crew
does not get to choose their handset's age.

**AUTH-8.** **TRADER never stores passkey material.** Clerk holds the public key; the private key
never leaves the device's secure hardware and we never see it.

**AUTH-9.** Signing up **never grants a role.** A newly enrolled user is a `worker`; elevation is
a deliberate roster action (PERM-4).

**AUTH-10.** Deactivation (PERM-3) must **revoke the credential and the session**, not merely set
a flag. A phone already holding a valid passkey would otherwise keep working. Events a deactivated
device queued while offline are **rejected at sync**, not silently accepted — which is the one
place PERM-3 has to hold against a client that was authorised when it wrote.

---

## SESSION — the work-session state machine

A session is one worker's continuous stretch of work on one job. It exists only as a fold over
`work_session_events`; there is no session row to read or update.

**SESSION-1.** A worker has **at most one open session at any instant** on the folded timeline.

**SESSION-2.** The event types and their legal transitions:

| From           | Legal next events            |
| -------------- | ---------------------------- |
| _(no session)_ | `started`                    |
| `started`      | `paused`, `ended`, `voided`  |
| `paused`       | `resumed`, `ended`, `voided` |
| `resumed`      | `paused`, `ended`, `voided`  |
| `ended`        | _terminal_                   |
| `voided`       | _terminal_                   |

**SESSION-3.** Transition legality is evaluated against the **folded timeline with the incoming
event inserted at its `client_timestamp` position** — never against the latest-arrived state.
Events arrive late, out of order and in batches (SPEC §3), so a `resumed` that reaches the server
before its own `paused` is legal and must not be rejected.

**SESSION-4.** An event that is illegal under SESSION-3 is **rejected at the API boundary and
never written.** Append-only means a mistake is permanent, so validation happens before the
insert, not after. The client receives a typed error naming the conflicting event.

**SESSION-5.** A mid-day job switch is two events — `ended` on the outgoing job, then `started`
on the incoming one — and **never an update to the first session.** The client emits both; they
sync independently.

**SESSION-6.** A partially-synced switch is a legal state, not an error. If `ended` on job A
arrives and `started` on job B does not, the worker simply has no open session; if they arrive
out of order, SESSION-3 orders them by `client_timestamp` and SESSION-1 still holds over the
result. Neither case may be repaired by inventing an event.

**SESSION-7.** `voided` nullifies an entire session rather than a single event. It is itself an
appended event and does not remove anything.

---

## DERIVE — derived values

Nothing in this group is stored as an editable field. Each is computed from the event fold, so
the ledger and the numbers can never disagree.

**DERIVE-1.** `work_date` is the calendar date of the session's `started` `client_timestamp`,
evaluated in `companies.timezone`. **Never entered, never editable.**

**DERIVE-2.** A session crossing midnight belongs entirely to its **start** date. A shift from
22:00 to 02:00 is four hours on the first day, not two on each.

**DERIVE-3.** Worked duration is the sum of intervals from each `started` or `resumed` to the
next `paused`, `ended` or `voided`. **Paused spans are excluded.**

**DERIVE-4.** A voided session contributes **zero** worked duration, regardless of what its
events would otherwise fold to.

**DERIVE-5.** An open session — one with no terminating event — is **excluded from payroll
totals** and surfaced in reconciliation as still open. It may be displayed as accruing against
the current time; that display value is never a payroll input.

**DERIVE-6.** All derivation is server-side. A device may compute the same values for display,
but on any disagreement the server's value is the one that counts (CONFLICT-5).

---

## CONFLICT — sync and conflict resolution

Because labor is append-only, true conflicts are rare by construction. These rules govern the
ones that remain. All of them live in **one readable handler at the API boundary** — deliberately
not a database constraint and not a locking scheme.

**CONFLICT-1.** The server upserts by the **client-generated UUIDv7**. A repeat of an
already-recorded `id` is a no-op that returns success. A client may retry the same write
indefinitely; the server records it once.

**CONFLICT-2.** Events are ordered by **`client_timestamp`**, with **`server_timestamp` as
tiebreaker**. An offline 15:00 clock-out that syncs at 18:00 beats a 14:00 event.

**CONFLICT-3.** Where two events genuinely compete — two devices ending the same session — the
**latest legitimate action under CONFLICT-2 wins.**

**CONFLICT-4.** A device whose clock is badly wrong must not be able to reorder history by
claiming an implausible time. Skew is measured **at sync time, not per event**: the push request
carries the device's current clock, and skew is `|device_now − server_now|`. Comparing an event's
own `client_timestamp` to `server_timestamp` would not work — a device offline for two days
produces a 48-hour gap legitimately, and that is the case SPEC §3 exists to serve. **Tolerance is
5 minutes.** Within it, `client_timestamp` orders events per CONFLICT-2. Beyond it the event is
**still written** — never rejected, per SESSION-4's permanence and the same logic as ATTEST-4 —
but is ordered by `server_timestamp` and flagged in `payload`. `client_timestamp` is recorded as
the device reported it and is never clamped: in an append-only payroll ledger, a rewritten time
is a time the worker did not act, and nothing downstream can undo it.

**CONFLICT-4a.** The pull cursor is a **keyset on `(server_timestamp, id)`, re-read with a
deliberate overlap window** rather than resumed exactly where it stopped. Transactions do not
become visible in `server_timestamp` order — a row can commit after a client has read past its
timestamp — so a precise cursor can silently skip a labor event. CONFLICT-1 makes the overlap
free: a redelivered event upserts by client UUID and is a no-op. **Batch 200; retry backs off
exponentially from 1s to 5min with jitter.**

**CONFLICT-5.** The losing device **snaps to server truth** on its next pull. Clients never argue
with the server.

**CONFLICT-6.** Sync runs on reconnect, on app foreground, and on a timer — **oldest-first**.
Each local record carries `pending → syncing → synced`, or `failed → retry`, and the UI shows
that state honestly rather than implying delivery.

**CONFLICT-7.** A submitted day closeout is **locked**. Every later change is a new correcting
event referencing the original through `payload`; nothing is edited and no correcting event is
special-cased in the schema.

---

## PERM — roles and permissions

Enforced **server-side at the API layer**. Client UI also hides what a role cannot do; that is
cosmetic and never the gate.

**PERM-1.** The matrix. ✓ permitted, ✗ denied, — not applicable.

| Capability                           | Worker   | Foreman     | Admin |
| ------------------------------------ | -------- | ----------- | ----- |
| Clock self in/out, pause/resume      | ✓        | ✓           | ✓     |
| Switch own job                       | ✓        | ✓           | ✓     |
| View own sessions                    | ✓        | ✓           | ✓     |
| View assigned jobs                   | ✓        | ✓           | ✓ all |
| Log materials                        | assigned | own jobs    | ✓     |
| View crew labor                      | ✗        | own jobs    | ✓     |
| Close out the day                    | own day¹ | crew's jobs | ✓     |
| View others' pay rates               | ✗        | ✗           | ✓     |
| Roster CRUD, pay rates               | ✗        | ✗           | ✓     |
| Customers, jobs, invoices            | ✗        | read-only²  | ✓     |
| Reconciliation dashboard             | ✗        | ✗           | ✓     |
| Issue corrections to submitted labor | ✗        | ✗           | ✓     |
| **Mutate a submitted labor record**  | **✗**    | **✗**       | **✗** |

¹ Whether a worker may close out their own day is an open decision, due before Phase 3.
² Read-only on the customers attached to the foreman's own jobs.

**PERM-2.** **No role mutates a submitted labor record — including admin.** This is the boundary
the whole permission model exists to protect; corrections are always new events (CONFLICT-7).

**PERM-3.** A deactivated account is rejected by `protectedProcedure` exactly as an anonymous one
is. Deletion is defined as deactivate-and-anonymise, so an account that could still clock in
afterwards would make that definition cosmetic.

**PERM-4.** Role is never written by a request path. It is set by seeding or by deliberate
roster action, never by the just-in-time provisioning that runs on sign-in.

---

## ATTEST — attribution of consequential actions

**Partly built.** `work_session_events.attestation_level` exists and the sync boundary records
what the client reports, defaulting to `none` — so ATTEST-3 and ATTEST-4 hold end to end on the
server. **The device-side check is `[unbuilt]`**: nothing yet invokes Face ID or
BiometricPrompt, so every event currently records `none` honestly rather than because
biometrics failed. ATTEST-5 through ATTEST-12, the web approval path, are `[unbuilt]` and
scheduled for Phase 3.

**ATTEST-1.** The scope rule: **an action that becomes payroll or money must be attributable to
a person present at the moment it was taken.** Concretely — clock in/out, pause/resume, job
switch, day-closeout submission, admin corrections to submitted labor, and invoice status
changes. Material logging is deliberately **excluded**: it is high-frequency and low-consequence,
and gating it would train the crew to resent the prompt.

**ATTEST-2.** On mobile the check is **OS-mediated device biometrics** — Face ID, Touch ID, or
Android's BiometricPrompt — invoked through the platform's local-authentication API. **The
biometric template never leaves the device and TRADER never receives it.** We store the fact that
the OS reported success, not anything about the face or finger.

**ATTEST-3.** Attestation is recorded at one of three levels, and **the level achieved is stored
on the event**: `biometric`, `device_credential` (the OS passcode fallback), or `none`.

**ATTEST-4.** **Attestation never blocks a labor event.** If biometrics fail, are unenrolled, or
the device has no passcode set, the event is written with the level honestly recorded. This
mirrors SPEC §3's treatment of location: evidence when present, never a precondition. A worker
who cannot clock in cannot be paid, and that failure is worse than a weaker attestation — while
a pattern of `none` is visible to the office precisely because it was recorded rather than
silently accepted.

**ATTEST-5.** Web has no biometric, so a **high-consequence web action pushes an approval
challenge to the actor's enrolled phone**, which they approve with Face ID; the approval returns
and the web action completes. This closes the gap rather than exempting the web app from
ATTEST-1.

**ATTEST-6.** A web challenge is **single-use, short-lived, and bound to one specific action.**
An approval cannot be replayed or applied to a different action than the one it was issued for.

**ATTEST-7.** The phone prompt **names the action in the worker's own terms** — "Approve:
correct 3.5h on the Fenwick job for M. Reyes" — never a bare "Approve request". Blind approval
under notification fatigue is the known failure mode of push-based approval, and an unreadable
prompt causes it.

**ATTEST-8.** **A web challenge fails closed.** Push delivery is best-effort and can be delayed
or dropped; on timeout or non-delivery the action does **not** happen, and the admin is told it
did not.

**ATTEST-9.** ATTEST-4 and ATTEST-8 point opposite ways on purpose. A worker recording their own
work must never be blocked, because blocking costs them pay. An admin altering someone else's
record may be blocked freely, because the cost is a delay on a correction that is not urgent.
The asymmetry follows the consequence, not the platform.

**ATTEST-10.** ATTEST-5 requires the mobile app, so no web action may be gated on it before the
app ships. An admin with no phone needs a documented alternative before Phase 3, and no such
alternative is defined yet.

**ATTEST-11.** Attestation strength is **staged**, and events are shaped for the upgrade from the
start. Phase 1 records the result of a local biometric check. Phase 3 — when web approval brings
server-issued challenges anyway — upgrades both paths to a Secure Enclave key gated by biometrics,
signing the challenge. See [DECISIONS.md](DECISIONS.md) for why the weaker form is correct first.

**ATTEST-12.** Automation may propose an action; **only a person's action creates a record.** A
geofence, a schedule or any other detection may raise the prompt, but the confirmation is what
writes the event — which is what keeps `initiator_user_id` meaningful. The governing principle
is SPEC §3's; this is its rule form.

---

## INVOICE — billing and payment

**`[unbuilt]`** — invoicing is Phase 4 and payment capture arrives with it. `payments` is not yet
a table.

**INVOICE-1.** An invoice number is **allocated when the invoice is sent, never when the draft is
created**, and is sequential per company. Allocating at draft leaves a gap every time a draft is
abandoned, and an unexplained gap in an invoice sequence is the first thing an auditor asks about.

**INVOICE-2.** Line items are **snapshots**. Generation copies the labor and material amounts in;
the `job_id` and `material_id` links are kept for drill-down and are **never re-read to recompute
a total**. Otherwise a Phase 3 correction to a worker's hours would silently alter an invoice
already in a customer's inbox.

**INVOICE-3.** A **sent invoice is immutable.** A change is a new invoice or a credit note, never
an edit — the same principle as the labor ledger, for the same reason.

**INVOICE-4.** **Status is derived, not set.** `void` is the one explicit state; otherwise status
follows the sum of attached payments against the total: unsent → `draft`, sent with nothing paid
→ `sent`, part-paid → `partially_paid`, settled → `paid`, and more than the total → `overpaid`.
A field an admin ticks can disagree with the money; a derivation cannot.

**INVOICE-5.** Cash and cheque are recorded as **payment rows with a method**, not as a status
toggle. Manual and online payments then reconcile through exactly one mechanism.

**INVOICE-6.** **TRADER never receives customer funds.** The contractor's own processor account is
the payee. Holding customer money and later disbursing it is money transmission, which carries
state-by-state licensing — a burden with no upside at this scale.

**INVOICE-7.** **Card data never enters TRADER.** Payment is a processor-hosted checkout, which
keeps us at the lightest PCI self-assessment. Never build a card form, however convenient it looks
later.

**INVOICE-8.** Refunds and disputes belong to the **contractor's processor dashboard**. TRADER
reflects their outcome and does not mediate them.

**INVOICE-9.** **Tax is entered per invoice by the admin.** TRADER does the arithmetic and claims
no tax expertise: RI and MA treat painting labor and materials differently, and encoding a guess
would be worse than asking.

**INVOICE-10.** All money is **integer minor units**. The sum of line totals equals the subtotal,
and subtotal plus tax equals the total, exactly — no floating point anywhere in the chain.

**INVOICE-11.** **Delivery is best-effort and its failure is visible.** If the email does not
send, the invoice still exists and the admin can download the PDF or copy the payment link. A
delivery that silently failed is worse than one that never went.
