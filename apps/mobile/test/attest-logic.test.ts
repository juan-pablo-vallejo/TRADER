import { describe, expect, it } from "vitest";

import { planSteps, requiresAttestation, resolveLevel } from "../src/attest-logic";

describe("planSteps — what the device can be asked for", () => {
  it("asks for biometrics only when hardware exists and something is enrolled", () => {
    expect(
      planSteps({ hasHardware: true, isEnrolled: true, hasDeviceCredential: true }),
    ).toMatchObject({ biometric: true });
    // A sensor with nothing enrolled is a sensor that cannot answer.
    expect(
      planSteps({ hasHardware: true, isEnrolled: false, hasDeviceCredential: true }),
    ).toMatchObject({ biometric: false });
    expect(
      planSteps({ hasHardware: false, isEnrolled: true, hasDeviceCredential: true }),
    ).toMatchObject({ biometric: false });
  });

  it("offers the credential step whenever a passcode exists", () => {
    expect(
      planSteps({ hasHardware: false, isEnrolled: false, hasDeviceCredential: true })
        .deviceCredential,
    ).toBe(true);
  });

  /**
   * ATTEST-4's hardest case: a device with no sensor and no passcode. Nothing can
   * be asked, and the event must still be written — so both steps are skipped and
   * the level is `none`.
   */
  it("asks for nothing on a device with no sensor and no passcode", () => {
    const steps = planSteps({
      hasHardware: false,
      isEnrolled: false,
      hasDeviceCredential: false,
    });
    expect(steps).toEqual({ biometric: false, deviceCredential: false });
    expect(resolveLevel({ biometricOk: false, deviceCredentialOk: false })).toBe("none");
  });
});

describe("resolveLevel — ATTEST-3, never over-claim", () => {
  it("claims biometric only when the biometric-only step succeeded", () => {
    expect(resolveLevel({ biometricOk: true, deviceCredentialOk: false })).toBe(
      "biometric",
    );
  });

  /**
   * The second prompt lets the OS accept a biometric retry as well as a passcode,
   * so its success cannot distinguish them. Recording the weaker of the two means
   * an honest event occasionally looks less well-attested than it was — which is
   * recoverable. The opposite, putting evidence on a payroll record that nobody
   * produced, is not.
   */
  it("records the weaker level when the fallback step is what succeeded", () => {
    expect(resolveLevel({ biometricOk: false, deviceCredentialOk: true })).toBe(
      "device_credential",
    );
  });

  it("never claims biometric on the strength of the fallback alone", () => {
    // Both true should not arise — the fallback is skipped after a biometric pass
    // — but if it ever does, the stronger claim is the one actually proven.
    expect(resolveLevel({ biometricOk: true, deviceCredentialOk: true })).toBe(
      "biometric",
    );
  });

  it("is `none` when nothing succeeded, including a worker who cancelled", () => {
    expect(resolveLevel({ biometricOk: false, deviceCredentialOk: false })).toBe("none");
  });
});

describe("requiresAttestation — ATTEST-1 scope", () => {
  it("covers every labor event, because all of them become payroll", () => {
    for (const t of ["started", "paused", "resumed", "ended", "voided"]) {
      expect(requiresAttestation(t), t).toBe(true);
    }
  });

  it("excludes anything that is not a labor event", () => {
    // Materials arrive in Phase 2 and are deliberately out of scope: high
    // frequency, low consequence, and gating them would train the crew to
    // resent the prompt.
    expect(requiresAttestation("material_logged")).toBe(false);
  });
});
