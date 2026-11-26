// Me (src/me.ts): the contact phone, fetched again on focus and on return to the app until
// the server has answered once; and the three pairs, each with one side selected.
import { describe, expect, it } from "vitest";

import { shownSignInPhone } from "@trader/api/contract";

import { contactLoader, mePairs, signInRows, type ContactLoad } from "../src/me";

const LUIS = {
  name: "Luis Herrera",
  phone: "4015550177",
  role: "worker" as const,
  email: "luis.herrera@demo.invalid",
  signInPhone: null,
};

describe("the contact phone", () => {
  it("is fetched again when Me comes back into focus, after a first try with no signal", async () => {
    let calls = 0;
    const seen: ContactLoad[] = [];
    const load = contactLoader(
      async () => {
        calls += 1;
        if (calls === 1) throw new Error("no signal");
        return LUIS;
      },
      (state) => seen.push(state),
    );
    // Opened with no signal: said as not loaded, with why.
    await load();
    expect(seen.at(-1)).toEqual({ phase: "failed" });
    // Focus again, or back to the app: fetched again, and loaded.
    await load();
    expect(seen.at(-1)).toEqual({
      phase: "loaded",
      contact: LUIS,
    });
    // Once loaded, a later focus leaves what the person may be typing alone.
    await load();
    expect(calls).toBe(2);
  });

  it("asks once at a time", async () => {
    let calls = 0;
    const load = contactLoader(
      async () => {
        calls += 1;
        return { ...LUIS, name: "Ana", phone: null };
      },
      () => undefined,
    );
    await Promise.all([load(), load()]);
    expect(calls).toBe(1);
  });
});

describe("Me's pairs", () => {
  const selected = (pair: readonly { value: string; selected: boolean }[] | null) =>
    pair?.filter((side) => side.selected).map((side) => side.value);

  it("carry a selected state on the side chosen, and on that side alone", () => {
    const pairs = mePairs({ language: "es", key: "off" });
    expect(selected(pairs.language)).toEqual(["es"]);
    expect(selected(pairs.key)).toEqual(["off"]);
    expect(pairs.language.map((side) => side.value)).toEqual(["en", "es"]);
  });

  it("leave out a key no phone can hold", () => {
    const pairs = mePairs({ language: "en", key: "absent" });
    expect(pairs.key).toBeNull();
  });
});

describe("the sign-in addresses on Me", () => {
  it("shows each address the office gave, never editable, with who changes it", () => {
    expect(signInRows({ ...LUIS, signInPhone: "+14015550177" })).toEqual([
      { kind: "phone", value: shownSignInPhone("+14015550177"), changedBy: "office" },
      { kind: "email", value: "luis.herrera@demo.invalid", changedBy: "office" },
    ]);
    // Invited by number alone: the number only.
    expect(signInRows({ ...LUIS, email: null, signInPhone: "+14015550177" })).toEqual([
      { kind: "phone", value: "(401) 555-0177", changedBy: "office" },
    ]);
    // An admin's own addresses are changed by TRADER's support, not the office.
    expect(signInRows({ ...LUIS, role: "admin" })).toEqual([
      { kind: "email", value: "luis.herrera@demo.invalid", changedBy: "support" },
    ]);
  });
});
