// Me (src/me.ts): the contact phone, fetched again on focus and on return to the app until
// the server has answered once; and the three pairs, each with one side selected.
import { describe, expect, it } from "vitest";

import { contactLoader, mePairs, type ContactLoad } from "../src/me";

describe("the contact phone", () => {
  it("is fetched again when Me comes back into focus, after a first try with no signal", async () => {
    let calls = 0;
    const seen: ContactLoad[] = [];
    const load = contactLoader(
      async () => {
        calls += 1;
        if (calls === 1) throw new Error("no signal");
        return { name: "Luis Herrera", phone: "4015550177" };
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
      contact: { name: "Luis Herrera", phone: "4015550177" },
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
        return { name: "Ana", phone: null };
      },
      () => undefined,
    );
    await Promise.all([load(), load()]);
    expect(calls).toBe(1);
  });
});

describe("the three pairs", () => {
  const selected = (pair: readonly { value: string; selected: boolean }[] | null) =>
    pair?.filter((side) => side.selected).map((side) => side.value);

  it("carry a selected state on the side chosen, and on that side alone", () => {
    const pairs = mePairs({ language: "es", reminders: "on", key: "off" });
    expect(selected(pairs.language)).toEqual(["es"]);
    expect(selected(pairs.reminders)).toEqual(["on"]);
    expect(selected(pairs.key)).toEqual(["off"]);
    expect(pairs.language.map((side) => side.value)).toEqual(["en", "es"]);
  });

  it("read reminders never chosen as off, and leave out a key no phone can hold", () => {
    const pairs = mePairs({ language: "en", reminders: null, key: "absent" });
    expect(selected(pairs.reminders)).toEqual(["off"]);
    expect(pairs.key).toBeNull();
  });
});
