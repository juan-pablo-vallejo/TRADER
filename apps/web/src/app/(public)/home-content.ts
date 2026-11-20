// D Sierra Painting's homepage, as content: its words and its pictures in one file, so
// the page's code never changes when they do. Nothing here is invented. Until D Sierra
// supplies them (docs/TASKS.md, the owner's gate 6: two sentences on what they do and
// where, in each language; the phone number and email their customers should use; three
// to six photos of their work that they own, and their OK to publish them), every part is
// empty, and a part with no content draws nothing: the page is their name, their logo and
// the two buttons.
//
// The repository is public: a photo goes in `assets/brand/` only with D Sierra's OK.
import type { StaticImageData } from "next/image";

import type { Language } from "../i18n/language";

export type HomeContent = {
  name: string;
  // What they do and where: a sentence or two, in each language. Null until supplied.
  about: Record<Language, string> | null;
  // As a customer should dial and write them. Null until supplied.
  phone: string | null;
  email: string | null;
  // Photos of their own work, each with what it shows, in each language.
  photos: { image: StaticImageData; alt: Record<Language, string> }[];
};

export const HOME: HomeContent = {
  name: "D Sierra Painting",
  about: null,
  phone: null,
  email: null,
  photos: [],
};
