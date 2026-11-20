// The privacy policy and the terms as content: both languages say the same things in the
// same order, nothing is blank, and the page says it is a draft until it is approved.
import { describe, expect, it } from "vitest";

import {
  APPROVED,
  LAST_CHANGED,
  PRIVACY,
  TERMS,
} from "../src/app/(public)/legal-content";

describe("the privacy policy and the terms", () => {
  for (const [name, document] of [
    ["privacy", PRIVACY],
    ["terms", TERMS],
  ] as const) {
    it(`${name}: Spanish has every section and paragraph English has`, () => {
      expect(document.es.sections.length).toBe(document.en.sections.length);
      document.en.sections.forEach((section, index) => {
        expect(document.es.sections[index]!.paragraphs.length).toBe(
          section.paragraphs.length,
        );
      });
    });

    it(`${name}: nothing is blank, and nothing is left in English`, () => {
      for (const language of ["en", "es"] as const) {
        const doc = document[language];
        for (const text of [
          doc.title,
          doc.intro,
          ...doc.sections.flatMap((s) => [s.heading, ...s.paragraphs]),
        ]) {
          expect(text.trim().length).toBeGreaterThan(0);
        }
      }
      const said = (doc: (typeof document)["en"]) => [
        doc.title,
        doc.intro,
        ...doc.sections.flatMap((s) => [s.heading, ...s.paragraphs]),
      ];
      said(document.en).forEach((text, index) => {
        expect(said(document.es)[index]).not.toBe(text);
      });
    });
  }

  it("names every service that handles a record, in both languages", () => {
    for (const language of ["en", "es"] as const) {
      const text = PRIVACY[language].sections.flatMap((s) => s.paragraphs).join(" ");
      for (const service of ["Clerk", "Vercel", "Neon", "Resend", "Sentry"]) {
        expect([language, service, text.includes(service)]).toEqual([
          language,
          service,
          true,
        ]);
      }
    }
  });

  it("is a draft until the owner approves it, and dated", () => {
    // Flipped by the owner's approval, with the operator's name and a contact supplied.
    expect(APPROVED).toBe(false);
    expect(LAST_CHANGED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
