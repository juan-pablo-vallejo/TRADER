// D'Sierra Painting's homepage, as content: its words and its pictures in one file, so
// the page's code never changes when they do. Nothing here is invented. The words, the
// number and the address to write to are D'Sierra's own, sent on 2026-11-22 (docs/TASKS.md,
// the owner's gate 6); the Spanish paragraph is a translation of theirs, adding and
// dropping nothing. The place is the one their own capability statement prints: their
// street address is not published. A part left null or empty draws nothing.
//
// The repository is public: a photo goes in `assets/pics/` only with D'Sierra's OK. These
// are from their own Instagram (@dsierrapainting), on their word that the photos may come
// from there, chosen with the owner on 2026-11-22: each resized, and stripped of every
// piece of metadata. None shows a face. A photo of work under way is never shown alone:
// it carries the same job finished, which the page reveals on a swipe. The two here are
// one ceiling, from their posts of 2019-10-25 and 2019-10-31.
import type { StaticImageData } from "next/image";

import apartmentInterior from "../../../../../assets/pics/apartment-interior.jpg";
import ceilingFinished from "../../../../../assets/pics/ceiling-finished.jpg";
import homeExterior from "../../../../../assets/pics/home-exterior.jpg";
import newportHarborHouse from "../../../../../assets/pics/newport-harbor-house.jpg";
import schoolHallway from "../../../../../assets/pics/school-hallway.jpg";
import shoppingCenter from "../../../../../assets/pics/shopping-center.jpg";
import sprayingCeiling from "../../../../../assets/pics/spraying-ceiling.jpg";
import type { Language } from "../i18n/language";

export type HomeContent = {
  name: string;
  // What they do: a few sentences, in each language. Null draws nothing.
  about: Record<Language, string> | null;
  // Where they are, as they print it themselves: a town, never a street address.
  where: string | null;
  // As a customer should dial and write them.
  phone: string | null;
  email: string | null;
  // Photos of their own work, each with what it shows, in each language. `finished` is
  // the same job done, for a photo taken while the work was under way.
  photos: (Photo & { finished?: Photo })[];
};
export type Photo = { image: StaticImageData; alt: Record<Language, string> };

export const HOME: HomeContent = {
  name: "D'Sierra Painting",
  about: {
    en: "Since 2017, D'Sierra Painting LLC has specialized in residential, commercial and multi-unit projects. Our work includes interior and exterior painting, detailed surface preparation, drywall repairs, and protective coatings with an emphasis on reliable service and quality results. We have successfully completed over two hundred and fifty projects. We're MBE and DBE certified, fully licensed and insured, and offer free estimates.",
    es: "Desde 2017, D'Sierra Painting LLC se especializa en proyectos residenciales, comerciales y de múltiples unidades. Nuestro trabajo incluye pintura interior y exterior, preparación detallada de superficies, reparación de drywall y recubrimientos protectores, con énfasis en un servicio confiable y resultados de calidad. Hemos completado con éxito más de doscientos cincuenta proyectos. Contamos con certificación MBE y DBE, licencia y seguro completos, y ofrecemos estimados gratis.",
  },
  where: "Central Falls, RI",
  phone: "(401) 286-9997",
  email: "dsierrapainting@gmail.com",
  photos: [
    {
      image: newportHarborHouse,
      alt: {
        en: "A historic house in Newport, painted navy with white trim",
        es: "Una casa histórica en Newport, pintada de azul marino con molduras blancas",
      },
    },
    {
      image: homeExterior,
      alt: {
        en: "A two-story home with a freshly painted exterior and a white porch",
        es: "Una casa de dos pisos con el exterior recién pintado y un porche blanco",
      },
    },
    {
      image: schoolHallway,
      alt: {
        en: "A school hallway with repainted walls and blue lockers",
        es: "El pasillo de una escuela con paredes repintadas y casilleros azules",
      },
    },
    {
      image: apartmentInterior,
      alt: {
        en: "A new apartment painted white, with a kitchen island",
        es: "Un apartamento nuevo pintado de blanco, con isla de cocina",
      },
    },
    {
      image: shoppingCenter,
      alt: {
        en: "The outside of a shopping center, painted white with dark trim",
        es: "El exterior de un centro comercial, pintado de blanco con detalles oscuros",
      },
    },
    {
      image: sprayingCeiling,
      alt: {
        en: "A D'Sierra painter spraying a store's ceiling black from a lift",
        es: "Un pintor de D'Sierra pintando de negro el techo de una tienda desde una plataforma",
      },
      finished: {
        image: ceilingFinished,
        alt: {
          en: "The same ceiling finished: black beams over white walls",
          es: "El mismo techo terminado: vigas negras sobre paredes blancas",
        },
      },
    },
  ],
};
