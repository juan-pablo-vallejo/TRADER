// Hours as the office reads them: the server's integer hundredths, printed by digits. The
// figure is never rounded or divided as a float on the way to the screen.
import { describe, expect, it } from "vitest";

import {
  firstName,
  formatters,
  hours,
  looksLikeSignInPhone,
  signInPhone,
} from "../src/app/format";
import { en } from "../src/app/i18n/en";
import { es } from "../src/app/i18n/es";

describe("a sign-in number", () => {
  it("is shown as it is said, and anything else as it is", () => {
    expect(signInPhone("+14015550100")).toBe("(401) 555-0100");
    expect(signInPhone("+441632960100")).toBe("+441632960100");
    expect(signInPhone("401-555-0100")).toBe("401-555-0100");
  });

  it("is accepted as typed when it is ten digits, or eleven starting with 1", () => {
    for (const typed of [
      "4015550100",
      "(401) 555-0100",
      "401.555.0100",
      "1 401 555 0100",
      " +1 (401) 555-0100 ",
    ]) {
      expect(looksLikeSignInPhone(typed), typed).toBe(true);
    }
    for (const typed of [
      "555-0100",
      "(101) 555-0100",
      "2 401 555 0100",
      "+44 1632 960100",
      "+40 1234 5678",
      "401-555-01000",
      "",
    ]) {
      expect(looksLikeSignInPhone(typed), typed).toBe(false);
    }
  });
});

describe("a person's first name", () => {
  it("is the name's first word, and the whole name when it has one", () => {
    expect(firstName("Ana Ruiz")).toBe("Ana");
    expect(firstName("  María José  Pérez ")).toBe("María");
    expect(firstName("Cher")).toBe("Cher");
  });
});

describe("hours from hundredths", () => {
  it("prints two decimals by integer arithmetic", () => {
    expect([0, 5, 50, 100, 650, 7200, 123456].map(hours)).toEqual([
      "0.00",
      "0.05",
      "0.50",
      "1.00",
      "6.50",
      "72.00",
      "1234.56",
    ]);
  });

  it("keeps the sign of a figure below zero", () => {
    expect([-5, -850].map(hours)).toEqual(["-0.05", "-8.50"]);
  });
});

// Intl writes a no-break space before "PM" and inside "p. m."; compared as plain spaces.
const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, " ");

describe("a time of day and a day", () => {
  const english = formatters("en", en);
  const spanish = formatters("es", es);
  const at = new Date(Date.UTC(2026, 10, 16, 19, 30));

  it("reads a time of day on a 12-hour clock in both languages", () => {
    expect([
      plain(english.wall("14:30")),
      plain(english.wall("07:00")),
      plain(english.wall("00:15")),
    ]).toEqual(["2:30 PM", "7:00 AM", "12:15 AM"]);
    expect([plain(spanish.wall("14:30")), plain(spanish.wall("07:00"))]).toEqual([
      "2:30 p. m.",
      "7:00 a. m.",
    ]);
    expect(plain(english.span("07:00", "15:30"))).toBe("7:00 AM–3:30 PM");
    expect(plain(english.clock(at, "America/New_York"))).toBe("2:30 PM");
    expect(plain(spanish.clock(at, "America/New_York"))).toBe("2:30 p. m.");
  });

  it("reads a day by kind: worked, due, a column", () => {
    expect(english.weekDay("2026-11-16")).toBe("Mon, Nov 16");
    expect(english.day("2026-11-16")).toBe("Nov 16, 2026");
    expect(english.weekColumn("2026-11-16")).toBe("Mon 16");
  });
});

describe("a Spanish sentence that names a time", () => {
  it("takes one period after a. m. or p. m., and the article the hour asks for", () => {
    expect(es.todayScreen.late("Ana", "Obra", "7:00 a. m.")).toBe(
      "Ana va tarde a Obra, que empezó a las 7:00 a. m.",
    );
    expect(es.todayScreen.asOf("1:15 p. m.")).toBe("A la 1:15 p. m.");
    expect(es.todayScreen.asOf("2:30 p. m.")).toBe("A las 2:30 p. m.");
    expect(es.schedule.did.changed("Ana", "7:00 a. m.–4:15 p. m.")).toBe(
      "El turno de Ana cambió a 7:00 a. m.–4:15 p. m.",
    );
  });
});
