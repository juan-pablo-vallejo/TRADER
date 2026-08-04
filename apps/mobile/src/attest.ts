import * as LocalAuthentication from "expo-local-authentication";

import { planSteps, resolveLevel, type Capability } from "./attest-logic";
import type { AttestationLevel } from "./db/schema";

/**
 * The OS-mediated biometric check — LOGIC.md `ATTEST-2`.
 *
 * **The biometric template never leaves the device and TRADER never receives
 * it.** This records only that the OS reported success; nothing about the face
 * or finger is read, stored or transmitted. That is what keeps the feature clear
 * of Illinois BIPA and its equivalents, and it is a property of using the
 * platform API rather than a promise made in a privacy policy.
 */

/** What the prompt says. Named per ATTEST-7's principle: say what is being approved. */
const PROMPT = {
  started: "Confirm clock in",
  paused: "Confirm break",
  resumed: "Confirm back to work",
  ended: "Confirm clock out",
  voided: "Confirm voiding this session",
} as const satisfies Record<string, string>;

export type AttestableAction = keyof typeof PROMPT;

async function readCapability(): Promise<Capability> {
  const [hasHardware, isEnrolled, level] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.getEnrolledLevelAsync(),
  ]);
  return {
    hasHardware,
    isEnrolled,
    // SECRET is a passcode/PIN/pattern; the biometric levels imply one exists.
    hasDeviceCredential: level !== LocalAuthentication.SecurityLevel.NONE,
  };
}

/**
 * Runs the check and returns the level achieved.
 *
 * **Never throws and never blocks the caller from writing the event**
 * (`ATTEST-4`). A device with no sensor, no enrolment, no passcode, or a worker
 * who cancels, all resolve to `none` — recorded honestly rather than retried or
 * treated as a failure. A worker who cannot clock in cannot be paid, and that is
 * the worse outcome by a wide margin.
 */
export async function attest(action: AttestableAction): Promise<AttestationLevel> {
  try {
    const steps = planSteps(await readCapability());
    let biometricOk = false;
    let deviceCredentialOk = false;

    if (steps.biometric) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: PROMPT[action],
        // Disabled so a success here is unambiguously a face or finger — see
        // `resolveLevel` for why that distinction is worth an extra prompt.
        disableDeviceFallback: true,
        cancelLabel: "Skip",
      });
      biometricOk = result.success;
    }

    // Only fall through when biometrics did not succeed. A worker who passed Face
    // ID is never asked for a passcode as well.
    if (!biometricOk && steps.deviceCredential) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: PROMPT[action],
        disableDeviceFallback: false,
      });
      deviceCredentialOk = result.success;
    }

    return resolveLevel({ biometricOk, deviceCredentialOk });
  } catch {
    // ATTEST-4 again: an unavailable or misbehaving platform API records `none`
    // and lets the labor event through. Nothing here is worth losing a day over.
    return "none";
  }
}
