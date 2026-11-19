// The demo run: the synthetic company written through the real
// procedures, as the office and the phones would write it, in a numbered sequence of steps.
// Nothing here opens a transaction or names a table: every write is a call on `appRouter`
// through a caller whose context holds the application-role pool (`app`), so the runtime guard
// (db guard.ts) refuses an owner pool on the first call. The one owner write, the bootstrap of
// company, counter and first admin, is handed in as `bootstrap` and is the seed's (db seed.ts).
// Full atomicity is impossible without bypassing one-transaction-per-call,
// so the database the caller prepared is the unit of atomicity: a failed step
// throws DemoFailure naming the step and what answered, and target.ts's recovery drops that
// database. Consumed by run-demo.ts and the demo tests.
import { randomUUID } from "node:crypto";

import type { Db, SeedCompany } from "@trader/db";

import { createContext } from "../core/context";
import { localDirectory } from "../core/identity";
import { logReporter } from "../core/report";
import { appRouter } from "../router";
import type { EntryFlag } from "../sync/reasons";
import { createCallerFactory } from "../core/trpc";
import {
  BASELINE_TIMES,
  CUSTOMERS,
  DEMO,
  EXPECTED,
  EXPECTED_HOURS,
  JOBS,
  PEOPLE,
  PLANS,
  planWeek,
  PRIYA_LAST_DAY,
  SCENARIOS,
  STAMPS,
  workDays,
  type Persona,
} from "./content";
import { atZone, seededRandom, uuidv7At } from "./ids";

export type Step = { index: number; name: string };

export type Summary = {
  steps: number;
  users: number;
  customers: number;
  jobs: number;
  events: number;
  assignments: number;
};

export type RunOptions = {
  app: Db;
  bootstrap: (company: SeedCompany) => Promise<void>;
  // YYYY-MM-DD, a Monday: the first of ten working days.
  anchor: string;
  // After each committed step.
  onStep?: (step: Step) => void;
  // Tests only: thrown before the named step runs.
  failAt?: (step: Step) => void;
};

// A step that did not answer as planned. The message names the step and the answer, never a
// query or its parameters (DrizzleQueryError's message holds both).
export class DemoFailure extends Error {
  constructor(
    public readonly step: Step,
    message: string,
  ) {
    super(`step ${step.index} (${step.name}): ${message}`);
  }
}

const MAX_RECORDS = 100;

// The application's router as a server-side caller: the same procedures the route handler
// serves, called in-process with a context built per persona.
const makeCaller = createCallerFactory(appRouter);
type Caller = ReturnType<typeof makeCaller>;

type Record_ = {
  id: string;
  kind: "labor_event";
  schemaVersion: 1;
  payload: unknown;
  reasons: EntryFlag[];
};

export async function runDemo(opts: RunOptions): Promise<Summary> {
  const tz = DEMO.timezone;
  const days = workDays(opts.anchor);
  const random = seededRandom(`trader-demo:${opts.anchor}`);
  const idAt = (at: Date) => uuidv7At(at.getTime(), random);
  const at = (day: number, time: string) => atZone(days[day]!, time, tz);
  const now = () => new Date();

  const summary: Summary = {
    steps: 0,
    users: 0,
    customers: 0,
    jobs: 0,
    events: 0,
    assignments: 0,
  };

  let current: Step = { index: 0, name: "start" };
  const step = async (name: string, body: () => Promise<void>) => {
    current = { index: current.index + 1, name };
    opts.failAt?.(current);
    await body();
    summary.steps = current.index;
    opts.onStep?.(current);
  };
  // Typed on the binding, so TypeScript narrows after a call (a `never`-returning function
  // narrows only when its declared type is explicit).
  const fail: (message: string) => never = (message) => {
    throw new DemoFailure(current, message);
  };
  // An answer that is not one of the planned results fails the step, naming the result and code.
  const expectResult = <T extends { result: string }>(
    answer: T,
    ...ok: T["result"][]
  ): T => {
    if (!ok.includes(answer.result)) {
      const code = (answer as { code?: string }).code;
      fail(`answered ${answer.result}${code === undefined ? "" : ` ${code}`}`);
    }
    return answer;
  };

  // One caller per persona: the identity the development adapter would verify
  // (the subject is `dev:` + the lower-cased email), so the browser's
  // sign-in later resolves the same bound rows.
  const callers = new Map<string, Caller>();
  const callerFor = (email: string): Caller => {
    let c = callers.get(email);
    if (c === undefined) {
      c = makeCaller(
        createContext({
          db: opts.app,
          identity: { subject: `dev:${email}`, email, emailVerified: true },
          // The demo's people exist in its database only: no provider is told of them.
          directory: localDirectory,
          reporter: logReporter,
          requestId: randomUUID(),
        }),
      );
      callers.set(email, c);
    }
    return c;
  };
  const person = (key: string): Persona => PEOPLE.find((p) => p.key === key)!;
  const as = (key: string) => callerFor(person(key).email);
  const admin = () => callerFor(DEMO.adminEmail);

  const userIds = new Map<string, string>();
  const customerIds = new Map<string, string>();
  const jobIds = new Map<string, string>();
  // Every accepted labor event by (who, day, type); the repair names one.
  const eventIds = new Map<string, string>();

  // A push as a phone sends it: oldest first, at most 100 records, the device clock right.
  // Every record must answer `accepted` with exactly its planned reasons.
  const push = async (who: string, records: Record_[]) => {
    for (let i = 0; i < records.length; i += MAX_RECORDS) {
      const batch = records.slice(i, i + MAX_RECORDS);
      const out = await as(who).sync.push({
        protocolVersion: 1,
        deviceNow: now(),
        records: batch.map(({ reasons: _reasons, ...r }) => r),
      });
      if (out.results.length !== batch.length) {
        fail(`${batch.length} records pushed, ${out.results.length} answered`);
      }
      out.results.forEach((r, n) => {
        const planned = batch[n]!;
        if (r.result !== "accepted") {
          fail(
            `record ${planned.kind} ${planned.id} answered ${r.result} ${"code" in r ? r.code : ""}`,
          );
        }
        const reasons = "flags" in r.ack ? r.ack.flags : [];
        if (reasons.join(",") !== planned.reasons.join(",")) {
          fail(
            `record ${planned.kind} ${planned.id} flagged [${reasons.join(", ")}], planned [${planned.reasons.join(", ")}]`,
          );
        }
        summary.events++;
      });
    }
  };

  type Facts = {
    capturedOffline?: boolean;
    timeSetByUser?: boolean;
    stamp?: { lat: number; lng: number; accuracyM: number } | null;
  };

  // One labor event record for `who` on their own job.
  const labor = (
    who: string,
    day: number,
    type: "started" | "paused" | "resumed" | "ended",
    time: string,
    reasons: EntryFlag[],
    facts: Facts = {},
  ): Record_ => {
    const p = person(who);
    const when = at(day, time);
    const id = idAt(when);
    eventIds.set(`${who}:${day}:${type}`, id);
    const defaultStamp =
      type === "started" || type === "ended"
        ? p.job === "j1"
          ? STAMPS.inside
          : STAMPS.harbor
        : null;
    return {
      id,
      kind: "labor_event",
      schemaVersion: 1,
      payload: {
        workerId: userIds.get(who)!,
        jobId: jobIds.get(p.job!)!,
        type,
        clientTimestamp: when,
        location: facts.stamp === undefined ? defaultStamp : facts.stamp,
        timeSetByUser: facts.timeSetByUser ?? false,
        capturedOffline: facts.capturedOffline ?? false,
      },
      reasons,
    };
  };

  // An ordinary day's four events, with the day's scenario facts applied.
  const ordinaryDay = (who: string, day: number): Record_[] => {
    const userTimed =
      SCENARIOS.userTimedEnd.who === who && SCENARIOS.userTimedEnd.day === day;
    const outside =
      SCENARIOS.outOfRadiusStart.who === who && SCENARIOS.outOfRadiusStart.day === day;
    // The seeded history is a backlog, and says so (content.ts, SCENARIOS.backlog) — but for
    // the one day that claims an online capture and is flagged for it (lateOnlineDay).
    const claimsOnline =
      SCENARIOS.lateOnlineDay.who === who && SCENARIOS.lateOnlineDay.day === day;
    const base: EntryFlag[] = claimsOnline
      ? SCENARIOS.lateOnlineDay.reasons
      : SCENARIOS.backlog.reasons;
    const facts: Facts = claimsOnline ? {} : { capturedOffline: true };
    return [
      labor(
        who,
        day,
        "started",
        BASELINE_TIMES.started,
        outside ? SCENARIOS.outOfRadiusStart.reasons : base,
        {
          ...facts,
          ...(outside ? { stamp: STAMPS.outside } : {}),
        },
      ),
      labor(who, day, "paused", BASELINE_TIMES.paused, base, facts),
      labor(who, day, "resumed", BASELINE_TIMES.resumed, base, facts),
      labor(
        who,
        day,
        "ended",
        BASELINE_TIMES.ended,
        userTimed ? SCENARIOS.userTimedEnd.reasons : base,
        {
          ...facts,
          ...(userTimed ? { timeSetByUser: true } : {}),
        },
      ),
    ];
  };

  // --- The steps -------------------------------------------------------------------------

  await step("bootstrap the company, its counter and its first admin", async () => {
    await opts.bootstrap(DEMO);
    summary.users = 1;
  });

  await step("invite the roster", async () => {
    for (const p of PEOPLE) {
      const a = expectResult(
        await admin().roster.invite({
          email: p.email,
          phone: p.phone,
          name: p.name,
          role: p.role,
        }),
        "invited",
      );
      if (a.result === "invited") userIds.set(p.key, a.user.id);
      summary.users++;
    }
  });

  await step("add customers", async () => {
    for (const c of CUSTOMERS) {
      const a = await admin().customer.create({
        name: c.name,
        address: c.address,
        phone: c.phone,
        email: c.email,
        notes: c.notes,
      });
      customerIds.set(c.key, a.customer.id);
      summary.customers++;
    }
  });

  await step("add jobs and set their status", async () => {
    for (const j of JOBS) {
      const a = expectResult(
        await admin().job.create({
          customerId: customerIds.get(j.customer)!,
          name: j.name,
          address: j.address,
          location: j.location,
        }),
        "created",
      );
      if (a.result !== "created") return;
      jobIds.set(j.key, a.job.id);
      summary.jobs++;
      if (j.status !== "open") {
        expectResult(
          await admin().job.setStatus({ jobId: a.job.id, status: j.status }),
          "updated",
        );
      }
    }
  });

  // Two working weeks, day by day. Priya's Wednesday arrives late, before any later day of
  // hers, which is the only order the ledger accepts a backdated day in.
  const late = SCENARIOS.lateOfflineDay;
  for (let day = 0; day < days.length; day++) {
    await step(`record ${days[day]}`, async () => {
      for (const p of PEOPLE) {
        if (p.job === null) continue;
        if (p.key === late.who && (day === late.day || day > PRIYA_LAST_DAY)) continue;
        const records = ordinaryDay(p.key, day);
        await push(p.key, records);
      }
    });
    if (day === late.day) {
      await step(`record ${late.who}'s late day ${days[day]}`, async () => {
        await push(late.who, [
          labor(late.who, day, "started", late.times.started, late.reasons, {
            capturedOffline: true,
          }),
          labor(late.who, day, "ended", late.times.ended, late.reasons, {
            capturedOffline: true,
          }),
        ]);
      });
    }
  }

  await step("correct a clock-out from the office", async () => {
    const s = SCENARIOS.repairedEnd;
    const source = eventIds.get(`${s.who}:${s.day}:ended`)!;
    const when = at(s.day, s.time);
    const id = idAt(when);
    const a = expectResult(
      await admin().labor.repair({
        workerId: userIds.get(s.who)!,
        operations: [
          {
            kind: "correct",
            id,
            correctsEventId: source,
            replacesEventId: source,
            type: "ended",
            jobId: jobIds.get(person(s.who).job!)!,
            clientTimestamp: when,
          },
        ],
      }),
      "accepted",
    );
    if (a.result === "accepted") {
      const reasons = a.events[0]?.reasons ?? [];
      if (reasons.join(",") !== s.reasons.join(",")) {
        fail(
          `correction flagged [${reasons.join(", ")}], planned [${s.reasons.join(", ")}]`,
        );
      }
      summary.events++;
    }
  });

  // Before the deactivation below: a plan is refused for a person already deactivated.
  await step("plan the coming week", async () => {
    const week = planWeek(opts.anchor);
    for (const p of PLANS) {
      const a = expectResult(
        await admin().assignment.create({
          userId: userIds.get(p.who)!,
          jobId: jobIds.get(p.job)!,
          // Ids from the run's seed, so a second run finds its own shifts.
          days: p.days.map((d) => ({
            id: idAt(new Date(`${week[d]!}T00:00:00Z`)),
            workDate: week[d]!,
          })),
          expectedStart: p.start,
          expectedEnd: p.end,
        }),
        "planned",
      );
      if (a.result !== "planned") return;
      const refusedDay = a.days.find((d) => d.result === "rejected");
      if (refusedDay !== undefined)
        fail(`${p.who} on ${p.job}, ${refusedDay.workDate}: ${refusedDay.code}`);
      summary.assignments += a.days.filter((d) => d.result === "created").length;
    }
  });

  await step("deactivate a worker and make another an admin", async () => {
    expectResult(
      await admin().roster.deactivate({
        userId: userIds.get(SCENARIOS.deactivatedWorker)!,
      }),
      "updated",
    );
    expectResult(
      await admin().roster.setRole({
        userId: userIds.get(SCENARIOS.madeAdmin)!,
        role: "admin",
      }),
      "updated",
    );
  });

  await step("deactivate a customer whose jobs are archived", async () => {
    expectResult(
      await admin().customer.deactivate({
        customerId: customerIds.get(SCENARIOS.deactivatedCustomer)!,
      }),
      "updated",
    );
  });

  // Last, with everything written: two days read as the office reads them and held to the
  // figures worked out by hand (content.ts).
  await step("read hours against the plan", async () => {
    for (const h of EXPECTED_HOURS) {
      const day = days[h.day]!;
      const { cells } = await admin().labor.hours({
        from: day,
        to: day,
        workerId: userIds.get(h.who)!,
      });
      const [cell] = cells;
      if (
        cells.length !== 1 ||
        cell === undefined ||
        cell.job.id !== jobIds.get(h.job) ||
        cell.hundredths !== h.hundredths ||
        cell.flags.join() !== h.flags.join()
      ) {
        fail(`${h.who} on ${day} read ${JSON.stringify(cells)}`);
      }
    }
  });

  // The run's own account against the plan: a drift in either is a failure, not a surprise in
  // the office.
  for (const key of Object.keys(EXPECTED) as (keyof typeof EXPECTED)[]) {
    if (summary[key] !== EXPECTED[key]) {
      fail(`${key}: wrote ${summary[key]}, planned ${EXPECTED[key]}`);
    }
  }
  return summary;
}
