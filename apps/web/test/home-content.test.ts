// D'Sierra's homepage as content ((public)/home-content.ts): whole in both languages, every
// photo described, every job shown before and finished, and the gallery ending on a full
// row at each width. What the page makes of it is looked at on staging.
import { describe, expect, it } from "vitest";

import { HOME, type Photo, type Words } from "../src/app/(public)/home-content";

// Said the same in both languages on purpose: a number, and two certifications' initials.
const SAME = new Set(["250+", "MBE + DBE"]);

const said: [string, Words][] = [
  ["headline", HOME.headline],
  ["summary", HOME.summary],
  ["estimates", HOME.estimates],
  ...(HOME.place === null ? [] : ([["place", HOME.place]] as [string, Words][])),
  ...HOME.facts.flatMap(
    (fact, i) =>
      [
        [`facts.${i}.figure`, fact.figure],
        [`facts.${i}.label`, fact.label],
      ] as [string, Words][],
  ),
  ...HOME.services.map((words, i) => [`services.${i}`, words] as [string, Words]),
  ...HOME.projects.map((words, i) => [`projects.${i}`, words] as [string, Words]),
  ...HOME.pairs.map((pair, i) => [`pairs.${i}.job`, pair.job] as [string, Words]),
];

const photos: [string, Photo][] = [
  ["hero", HOME.hero],
  ...HOME.pairs.flatMap(
    (pair, i) =>
      [
        [`pairs.${i}.before`, pair.before],
        [`pairs.${i}.after`, pair.after],
      ] as [string, Photo][],
  ),
  ...HOME.gallery.map((photo, i) => [`gallery.${i}`, photo] as [string, Photo]),
];

describe("the homepage's content", () => {
  it("says everything in both languages, and translates what is not a number or a name", () => {
    for (const [where, words] of [
      ...said,
      ...photos.map(([name, photo]) => [`${name}.alt`, photo.alt] as [string, Words]),
    ]) {
      expect([where, words.en.trim() !== "", words.es.trim() !== ""]).toEqual([
        where,
        true,
        true,
      ]);
      expect([where, words.en === words.es]).toEqual([where, SAME.has(words.en)]);
    }
  });

  it("keeps the four facts D'Sierra gave, and their town", () => {
    const facts = HOME.facts.map((fact) => `${fact.figure.en} ${fact.label.en}`);
    expect(facts).toEqual([
      "Since 2017 In business",
      "250+ Projects completed",
      "MBE + DBE Certified",
      "Licensed and insured",
    ]);
    expect(HOME.estimates.en).toBe("Free estimates");
    expect(HOME.place?.en).toContain("Central Falls, RI");
    expect(HOME.phone?.replace(/\D/g, "")).toHaveLength(10);
    expect(HOME.email).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]+$/);
  });

  it("has a file behind every photo", () => {
    for (const [where, photo] of photos) {
      expect([where, Boolean(photo.image)]).toEqual([where, true]);
    }
  });

  it("shows each job twice, before and finished, and never the same photo for both", () => {
    expect(HOME.pairs.length).toBeGreaterThan(0);
    for (const pair of HOME.pairs) {
      expect([pair.job.en, pair.before.image !== pair.after.image]).toEqual([
        pair.job.en,
        true,
      ]);
    }
  });

  it("fills every row of the gallery at two, three and four columns, with no photo twice", () => {
    expect(HOME.gallery.length % 12).toBe(0);
    expect(new Set(HOME.gallery.map((photo) => photo.image)).size).toBe(
      HOME.gallery.length,
    );
    // A job's before or finished photo is in its pair, not in the gallery as well.
    const paired = new Set(
      HOME.pairs.flatMap((pair) => [pair.before.image, pair.after.image]),
    );
    for (const photo of HOME.gallery) {
      expect([photo.alt.en, paired.has(photo.image)]).toEqual([photo.alt.en, false]);
    }
  });

  it("links to D'Sierra's own pages, over https, and to no other site", () => {
    for (const site of HOME.social) {
      const url = new URL(site.href);
      expect(url.protocol).toBe("https:");
      expect(["www.facebook.com", "www.instagram.com"]).toContain(url.host);
    }
  });
});
