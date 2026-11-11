// The demo run (TASKS, Stage 4: demo fixture): the synthetic company written through the real
// procedures, as the office and the phones would write it, in a numbered sequence of steps.
// Nothing here opens a transaction or names a table: every write is a call on `appRouter`
// through a caller whose context holds the application-role pool (`app`), so the runtime guard
// (db guard.ts) refuses an owner pool on the first call. The one owner write, the bootstrap of
// company, counter and first admin, is handed in as `bootstrap` and is the seed's (db seed.ts).
// Full atomicity is impossible without bypassing one-transaction-per-call (ARCHITECTURE,
// 2026-11-04), so the database the caller prepared is the unit of atomicity: a failed step
// throws DemoFailure naming the step and what answered, and target.ts's recovery drops that
// database. Consumed by run-demo.ts and the demo tests.
import type { Db, SeedCompany } from "@trader/db";

import { createContext } from "../core/context";
import { logReporter } from "../core/report";
import { appRouter } from "../router";
import type { ApprovalReason } from "../sync/reasons";
import { createCallerFactory } from "../core/trpc";
import {
  AMENDED_RECEIPT,
  BASELINE_TIMES,
  CREW_JOB,
  CREWS,
  CUSTOMERS,
  DEMO,
  EXPECTED,
  JOBS,
  PEOPLE,
  PRIYA_LAST_DAY,
  RATES,
  RECEIPTS,
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
  crews: number;
  crewMembers: number;
  payRates: number;
  events: number;
  materials: number;
  materialCorrections: number;
  closeouts: number;
  approvals: number;
  decided: number;
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
// query or its parameters (MEMORY: DrizzleQueryError's message holds both).
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
  kind: "labor_event" | "material";
  schemaVersion: 1;
  payload: unknown;
  reasons: ApprovalReason[];
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
    crews: 0,
    crewMembers: 0,
    payRates: 0,
    events: 0,
    materials: 0,
    materialCorrections: 0,
    closeouts: 0,
    approvals: 0,
    decided: 0,
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

  // One caller per persona: the identity the development adapter would verify (ARCHITECTURE,
  // development sign-in: the subject is `dev:` + the lower-cased email), so the browser's
  // sign-in later resolves the same bound rows.
  const callers = new Map<string, Caller>();
  const callerFor = (email: string): Caller => {
    let c = callers.get(email);
    if (c === undefined) {
      c = makeCaller(
        createContext({
          db: opts.app,
          identity: { subject: `dev:${email}`, email, emailVerified: true },
          reporter: logReporter,
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
  const crewIds = new Map<string, string>();
  const jobIds = new Map<string, string>();
  const materialIds = new Map<string, string>();
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
        const reasons = "reasons" in r.ack ? r.ack.reasons : [];
        if (reasons.join(",") !== planned.reasons.join(",")) {
          fail(
            `record ${planned.kind} ${planned.id} flagged [${reasons.join(", ")}], planned [${planned.reasons.join(", ")}]`,
          );
        }
        if (planned.kind === "labor_event") summary.events++;
        else summary.materials++;
        summary.approvals += reasons.length > 0 ? 1 : 0;
      });
    }
  };

  type Facts = {
    capturedOffline?: boolean;
    timeSetByUser?: boolean;
    stamp?: { lat: number; lng: number; accuracyM: number } | null;
    attestation?: "biometric" | "device_credential" | "none";
  };

  // One labor event record for `who` on their crew's job.
  const labor = (
    who: string,
    day: number,
    type: "started" | "paused" | "resumed" | "ended",
    time: string,
    reasons: ApprovalReason[],
    facts: Facts = {},
  ): Record_ => {
    const p = person(who);
    const when = at(day, time);
    const id = idAt(when);
    eventIds.set(`${who}:${day}:${type}`, id);
    const defaultStamp =
      type === "started" || type === "ended"
        ? p.crew === "a"
          ? STAMPS.inside
          : STAMPS.harbor
        : null;
    return {
      id,
      kind: "labor_event",
      schemaVersion: 1,
      payload: {
        workerId: userIds.get(who)!,
        jobId: jobIds.get(CREW_JOB[p.crew!])!,
        type,
        clientTimestamp: when,
        attestationLevel: facts.attestation ?? "biometric",
        location: facts.stamp === undefined ? defaultStamp : facts.stamp,
        timeSetByUser: facts.timeSetByUser ?? false,
        capturedOffline: facts.capturedOffline ?? false,
      },
      reasons,
    };
  };

  const receipt = (
    who: string,
    day: number,
    time: string,
    job: string,
    facts: { description: string; quantity: string; unit: string },
    reasons: ApprovalReason[],
  ): Record_ => {
    const when = at(day, time);
    const id = idAt(when);
    materialIds.set(`${who}:${day}`, id);
    return {
      id,
      kind: "material",
      schemaVersion: 1,
      payload: {
        jobId: jobIds.get(job)!,
        ...facts,
        loggedAt: when,
        capturedOffline: false,
      },
      reasons,
    };
  };

  // An ordinary day's four events, with the day's scenario facts applied.
  const ordinaryDay = (who: string, day: number): Record_[] => {
    const offline = SCENARIOS.offlineDay.who === who && SCENARIOS.offlineDay.day === day;
    const userTimed =
      SCENARIOS.userTimedEnd.who === who && SCENARIOS.userTimedEnd.day === day;
    const outside =
      SCENARIOS.outOfRadiusStart.who === who && SCENARIOS.outOfRadiusStart.day === day;
    const base: ApprovalReason[] = offline ? SCENARIOS.offlineDay.reasons : [];
    const facts: Facts = offline ? { capturedOffline: true } : {};
    return [
      labor(
        who,
        day,
        "started",
        BASELINE_TIMES.started,
        outside ? [...base, ...SCENARIOS.outOfRadiusStart.reasons] : base,
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
        userTimed ? [...base, ...SCENARIOS.userTimedEnd.reasons] : base,
        {
          ...facts,
          ...(userTimed ? { timeSetByUser: true, attestation: "none" } : {}),
        },
      ),
    ];
  };

  // The foreman closes the crew's job for the day: review, then submit with the fingerprint.
  const closeout = async (crew: "a" | "b", day: number) => {
    const foreman = CREWS[crew].foreman;
    const jobId = jobIds.get(CREW_JOB[crew])!;
    const review = await as(foreman).closeout.review({ jobId, workDate: days[day]! });
    if (review.closeout !== null)
      fail(`day ${days[day]} on ${CREW_JOB[crew]} is already closed`);
    const when = at(day, "16:30");
    const answer = await as(foreman).closeout.submit({
      id: idAt(when),
      jobId,
      workDate: days[day]!,
      jobStatus: "open",
      note: day === 0 && crew === "a" ? "Scraped and primed the south wall." : null,
      clientTimestamp: when,
      reviewFingerprint: review.fingerprint,
    });
    expectResult(answer, "accepted");
    summary.closeouts++;
  };

  // --- The steps -------------------------------------------------------------------------

  await step("bootstrap the company, its counter and its first admin", async () => {
    await opts.bootstrap(DEMO);
    summary.users = 1;
  });

  await step("invite the roster", async () => {
    for (const p of PEOPLE) {
      const a = expectResult(
        await admin().roster.invite({ email: p.email, name: p.name, role: p.role }),
        "invited",
      );
      if (a.result === "invited") userIds.set(p.key, a.user.id);
      summary.users++;
    }
  });

  await step("set pay rates", async () => {
    for (const r of RATES(opts.anchor)) {
      expectResult(
        await admin().roster.setPayRate({
          userId: userIds.get(r.who)!,
          effectiveFrom: r.effectiveFrom,
          hourlyRateCents: r.hourlyRateCents,
        }),
        "added",
      );
      summary.payRates++;
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

  await step("form the crews", async () => {
    for (const key of ["a", "b"] as const) {
      const crew = CREWS[key];
      const a = expectResult(
        await admin().crew.create({
          name: crew.name,
          foremanUserId: userIds.get(crew.foreman)!,
        }),
        "created",
      );
      if (a.result !== "created") return;
      crewIds.set(key, a.crew.id);
      summary.crews++;
      // The foreman is a member from creation (crews/write.ts).
      summary.crewMembers++;
      for (const p of PEOPLE.filter((p) => p.crew === key && p.role !== "foreman")) {
        expectResult(
          await admin().crew.addMember({
            crewId: a.crew.id,
            userId: userIds.get(p.key)!,
          }),
          "added",
        );
        summary.crewMembers++;
      }
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
          crewId: j.crew === null ? null : crewIds.get(j.crew)!,
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

  // Two working weeks, day by day: everybody's events (and the day's receipts) reach the office,
  // then each foreman closes the day. Priya's Wednesday arrives late, after its closeout and
  // before any later day of hers, which is the only order the ledger accepts a backdated day in.
  const late = SCENARIOS.lateOfflineDay;
  for (let day = 0; day < days.length; day++) {
    await step(`record ${days[day]}`, async () => {
      for (const p of PEOPLE) {
        if (p.crew === null) continue;
        if (p.key === late.who && (day === late.day || day > PRIYA_LAST_DAY)) continue;
        const records = ordinaryDay(p.key, day);
        for (const r of RECEIPTS) {
          if (r.who === p.key && r.day === day) {
            records.push(
              receipt(
                p.key,
                day,
                "10:15",
                r.job,
                {
                  description: r.description,
                  quantity: r.quantity,
                  unit: r.unit,
                },
                [],
              ),
            );
          }
        }
        await push(p.key, records);
      }
    });
    if (day < days.length - 1) {
      await step(`close out ${days[day]}`, async () => {
        await closeout("a", day);
        await closeout("b", day);
      });
    }
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

  await step("record a receipt after its day's closeout", async () => {
    const s = SCENARIOS.lateReceipt;
    await push(s.who, [
      receipt(
        s.who,
        s.day,
        s.time,
        s.job,
        {
          description: s.description,
          quantity: s.quantity,
          unit: s.unit,
        },
        s.reasons,
      ),
    ]);
  });

  await step("amend a sealed receipt", async () => {
    const original = AMENDED_RECEIPT.original;
    const foreman = CREWS[person(original.who).crew!].foreman;
    const when = at(days.length - 1, "17:00");
    const a = expectResult(
      await as(foreman).material.correct({
        id: idAt(when),
        materialId: materialIds.get(`${original.who}:${original.day}`)!,
        correction: { kind: "amend", ...AMENDED_RECEIPT.amend },
        note: AMENDED_RECEIPT.note,
        clientTimestamp: when,
      }),
      "accepted",
    );
    if (a.result === "accepted") {
      summary.materialCorrections++;
      summary.approvals++;
    }
  });

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
            jobId: jobIds.get(CREW_JOB[person(s.who).crew!])!,
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
      summary.approvals++;
    }
  });

  await step("decide the oldest pending approvals", async () => {
    const queue = await admin().approval.queue({ limit: SCENARIOS.decisions.length });
    if (queue.items.length < SCENARIOS.decisions.length) {
      fail(
        `${queue.items.length} pending approvals, ${SCENARIOS.decisions.length} planned`,
      );
    }
    for (const [n, decision] of SCENARIOS.decisions.entries()) {
      expectResult(
        await admin().approval.decide({
          approvalId: queue.items[n]!.approvalId,
          decision,
        }),
        "decided",
      );
      summary.decided++;
    }
  });

  await step("deactivate a worker and demote a foreman", async () => {
    expectResult(
      await admin().roster.deactivate({
        userId: userIds.get(SCENARIOS.deactivatedWorker)!,
      }),
      "updated",
    );
    expectResult(
      await admin().roster.setRole({
        userId: userIds.get(SCENARIOS.demotedForeman)!,
        role: "worker",
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

  // The run's own account against the plan: a drift in either is a failure, not a surprise in
  // the office.
  for (const key of Object.keys(EXPECTED) as (keyof typeof EXPECTED)[]) {
    if (summary[key] !== EXPECTED[key]) {
      fail(`${key}: wrote ${summary[key]}, planned ${EXPECTED[key]}`);
    }
  }
  return summary;
}
