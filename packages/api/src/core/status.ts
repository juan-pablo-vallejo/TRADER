// The kill switch's state: what a cooperative build may do on the
// network now. Pure over the environment record and the client it is handed, like
// dev-identity.ts; read per request, never at module load. Advisory: push and pull do
// not read it. No state stops capture or touches a record.
import type { z } from "zod";

import {
  PLATFORMS,
  type ServiceState,
  STATES,
  statusInput,
  statusOutput,
} from "../contract/status";

export { PLATFORMS, type ServiceState, STATES, statusInput, statusOutput };

const RANK: Record<ServiceState, number> = {
  normal: 0,
  read_only: 1,
  paused: 2,
  update_required: 3,
};

type Platform = (typeof PLATFORMS)[number];

export const CONFIG_VARS = [
  "TRADER_SYNC_MODE",
  "TRADER_MIN_BUILD_IOS",
  "TRADER_MIN_BUILD_ANDROID",
] as const;
type ConfigVar = (typeof CONFIG_VARS)[number];
const MIN_BUILD: Record<Platform, ConfigVar> = {
  ios: "TRADER_MIN_BUILD_IOS",
  android: "TRADER_MIN_BUILD_ANDROID",
};

// Not strict: a later build that sends one more field must still be answered. `build` is the
// native build number, a positive integer increasing within its platform; `z.int()` is bounded
// to safe integers.
export type StatusClient = z.infer<typeof statusInput>;
export type ProtocolRange = { min: number; max: number };

const MODES = ["read_only", "paused"] as const;
const BUILD = /^[1-9][0-9]{0,14}$/;

// Blank is the default: `normal`, and a minimum build of 1. Anything else unparseable is null.
function mode(value: string | undefined): ServiceState | null {
  if (value === undefined || value === "") return "normal";
  return MODES.find((m) => m === value) ?? null;
}
function minimumBuild(value: string | undefined): number | null {
  if (value === undefined || value === "") return 1;
  if (!BUILD.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

// The kill-switch variables that do not parse, by name, in CONFIG_VARS order. Also read at
// start by the deployment's environment check (apps/web, deploy-env.ts), which refuses to
// start on any; a running server that meets one answers `paused` below.
export function invalidConfigVars(env: Record<string, string | undefined>): ConfigVar[] {
  return [
    ...(mode(env.TRADER_SYNC_MODE) === null ? (["TRADER_SYNC_MODE"] as const) : []),
    ...PLATFORMS.map((p) => MIN_BUILD[p]).filter((v) => minimumBuild(env[v]) === null),
  ];
}

// The most restrictive of the configured mode, the build's and the protocol's verdicts. An
// invalid variable in any of the three is `paused`, never `normal`: a pause loses nothing, and a
// mistyped `paused` must not ship as normal. `invalid` names the variables, never their values.
export function serviceStatus(
  env: Record<string, string | undefined>,
  client: StatusClient,
  protocols: ProtocolRange,
): { state: ServiceState; invalid: ConfigVar[] } {
  const invalid = invalidConfigVars(env);
  const configured = mode(env.TRADER_SYNC_MODE);
  const minimums: Partial<Record<Platform, number>> = {};
  for (const p of PLATFORMS) {
    const m = minimumBuild(env[MIN_BUILD[p]]);
    if (m !== null) minimums[p] = m;
  }
  const verdicts: ServiceState[] = [configured ?? "paused"];
  if (invalid.length > 0) verdicts.push("paused");
  const minimum = minimums[client.platform];
  if (minimum !== undefined && client.build < minimum) verdicts.push("update_required");
  if (client.protocolVersion < protocols.min) verdicts.push("update_required");
  // A client newer than the server: the server was rolled back behind it. Wait, do not update.
  if (client.protocolVersion > protocols.max) verdicts.push("paused");
  const state = verdicts.reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
  return { state, invalid };
}

// One report per distinct set of invalid variables per server instance, so anonymous traffic
// under one bad configuration logs once, not once a request. A valid configuration resets it.
// Holds variable names only — no request and no identity.
export function createConfigLatch() {
  let last = "";
  return (invalid: readonly string[]): boolean => {
    const key = invalid.join(",");
    if (key === last) return false;
    last = key;
    return key !== "";
  };
}
