import type { AttestationLevel } from "./db/schema";

/**
 * Which checks to attempt, and what level the outcome earns — LOGIC.md
 * `ATTEST-2`/`ATTEST-3`.
 *
 * Pure, so the level matrix is testable without a device. That matters because
 * every wrong answer here is wrong in a way that shows up on a payroll record
 * months later: over-claiming invents evidence that was never collected, and
 * under-claiming makes an honest crew look like they are skipping the prompt.
 */

/** What the device can actually do, as reported by the OS. */
export type Capability = {
  /** Biometric sensor present. */
  hasHardware: boolean;
  /** A face or finger is enrolled on this device. */
  isEnrolled: boolean;
  /** A passcode, PIN or pattern is set — the OS fallback ATTEST-3 calls `device_credential`. */
  hasDeviceCredential: boolean;
};

export type AttestSteps = {
  /** Prompt for biometrics with the OS fallback **disabled**. */
  biometric: boolean;
  /** Prompt again allowing the device credential. */
  deviceCredential: boolean;
};

export function planSteps(cap: Capability): AttestSteps {
  return {
    biometric: cap.hasHardware && cap.isEnrolled,
    deviceCredential: cap.hasDeviceCredential,
  };
}

/**
 * The level earned by what actually happened.
 *
 * **`biometric` is only claimed when the first step succeeded with the OS
 * fallback disabled**, which is the one case where the platform guarantees a
 * face or finger was used. The second step permits the OS to accept a biometric
 * retry as well as a passcode, so its success cannot distinguish them — and it
 * therefore records the *weaker* of the two. Under-claiming leaves an honest
 * event looking slightly less well-attested than it was; over-claiming would put
 * evidence on a payroll record that nobody ever produced. Only one of those is
 * recoverable.
 *
 * ATTEST-11 stages this deliberately: a signed challenge in Phase 3 replaces the
 * inference with proof.
 */
export function resolveLevel(outcome: {
  biometricOk: boolean;
  deviceCredentialOk: boolean;
}): AttestationLevel {
  if (outcome.biometricOk) return "biometric";
  if (outcome.deviceCredentialOk) return "device_credential";
  return "none";
}

/**
 * ATTEST-1's scope: which actions carry an attestation prompt.
 *
 * Every labor event does, because all of them become payroll. Material logging
 * is deliberately excluded — high-frequency, low-consequence, and gating it would
 * train the crew to resent the prompt — but materials are Phase 2 and there is
 * nothing to exclude yet. Stated as a function rather than assumed, so the
 * exclusion has somewhere to live when it arrives.
 */
export function requiresAttestation(type: string): boolean {
  return ["started", "paused", "resumed", "ended", "voided"].includes(type);
}
