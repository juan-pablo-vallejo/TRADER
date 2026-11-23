// D'Sierra Painting's homepage, as content: its words and its pictures in one file, so
// the page's code never changes when they do. Nothing here is invented. The facts, the
// number and the address to write to are D'Sierra's own, sent on 2026-11-22 (docs/TASKS.md,
// the owner's gate 6), in a paragraph the page now says in parts: a headline, a line under
// it, four facts, a list of services. The Spanish is a translation of theirs, adding and
// dropping nothing. The town is the one their capability statement prints, and their street
// address is not published; the area they serve is the owner's word of 2026-11-22. A part
// left null or empty draws nothing.
//
// The repository is public: a photo goes in `assets/pics/` only with D'Sierra's OK. These
// are from their own Facebook page and Instagram (@dsierrapainting), on their word that
// the photos may come from there, chosen with the owner on 2026-11-22: each as the site
// served it, 2048 px at most, and stripped of every piece of metadata. None shows a face,
// a plate or a street. A photo of work under way may show the crew, never a face (the
// owner's word of 2026-11-22). A pair is one job, before and finished.
import type { StaticImageData } from "next/image";

import apartmentInterior from "../../../../../assets/pics/apartment-interior.jpg";
import bridgeRailing from "../../../../../assets/pics/bridge-railing.jpg";
import ceilingFinished from "../../../../../assets/pics/ceiling-finished.jpg";
import classroom from "../../../../../assets/pics/classroom.jpg";
import colonialFinished from "../../../../../assets/pics/colonial-finished.jpg";
import colonialPeeling from "../../../../../assets/pics/colonial-peeling.jpg";
import commercialExterior from "../../../../../assets/pics/commercial-exterior.jpg";
import diningRoomFinished from "../../../../../assets/pics/dining-room-finished.jpg";
import diningRoomFireplace from "../../../../../assets/pics/dining-room-fireplace.jpg";
import diningRoomYellow from "../../../../../assets/pics/dining-room-yellow.jpg";
import homeExterior from "../../../../../assets/pics/home-exterior.jpg";
import newportHarborHouse from "../../../../../assets/pics/newport-harbor-house.jpg";
import officeOpenPlan from "../../../../../assets/pics/office-open-plan.jpg";
import officeRingLight from "../../../../../assets/pics/office-ring-light.jpg";
import redTrimHouse from "../../../../../assets/pics/red-trim-house.jpg";
import shoppingCenter from "../../../../../assets/pics/shopping-center.jpg";
import sprayingCeiling from "../../../../../assets/pics/spraying-ceiling.jpg";
import warehouseInterior from "../../../../../assets/pics/warehouse-interior.jpg";
import type { Language } from "../i18n/language";

// The same thing said in each language.
export type Words = Record<Language, string>;
// A photo of their own work, with what it shows.
export type Photo = { image: StaticImageData; alt: Words };
// One job twice: as they found it or mid-work, and finished. `job` names it under the two.
export type Pair = { job: Words; before: Photo; after: Photo };
// One of the four things a customer checks first: the large line, and the small one under it.
export type Fact = { figure: Words; label: Words };

export type HomeContent = {
  name: string;
  // As a contract names them.
  legalName: string;
  headline: Words;
  // What they do, in a sentence.
  summary: Words;
  // Where they are, as they print it themselves, and the area they serve.
  place: Words | null;
  // As a customer should dial and write them.
  phone: string | null;
  email: string | null;
  // What an estimate costs, said above Call and Email.
  estimates: Words;
  facts: Fact[];
  // The kinds of work, and the kinds of project they do it for.
  services: Words[];
  projects: Words[];
  // The photo the page opens on.
  hero: Photo;
  pairs: Pair[];
  gallery: Photo[];
  // Their own pages elsewhere: plain links, and nothing of those sites loads here.
  social: { name: string; href: string }[];
};

const both = (words: string): Words => ({ en: words, es: words });

// A painter at work, and the picture on the team's sign-in page ((auth)/sign-in-frame.tsx), where
// it stands by itself by the owner's word of 2026-11-23: that door is the team's. On the
// homepage, a customer's page, it is never shown without the finished ceiling beside it.
export const SIGN_IN_PHOTO: Photo = {
  image: sprayingCeiling,
  alt: {
    en: "A D'Sierra painter spraying a store's ceiling black from a lift",
    es: "Un pintor de D'Sierra pintando de negro el techo de una tienda desde una plataforma",
  },
};

export const HOME: HomeContent = {
  name: "D'Sierra Painting",
  legalName: "D'Sierra Painting LLC",
  headline: {
    en: "Residential, commercial and multi-unit painting",
    es: "Pintura residencial, comercial y de múltiples unidades",
  },
  summary: {
    en: "Interior and exterior painting, detailed surface preparation, drywall repairs and protective coatings.",
    es: "Pintura interior y exterior, preparación detallada de superficies, reparación de drywall y recubrimientos protectores.",
  },
  place: {
    en: "Central Falls, RI. Serving Rhode Island and upper New England.",
    es: "Central Falls, RI. Atendemos Rhode Island y el norte de Nueva Inglaterra.",
  },
  phone: "(401) 286-9997",
  email: "dsierrapainting@gmail.com",
  estimates: { en: "Free estimates", es: "Estimados gratis" },
  facts: [
    {
      figure: { en: "Since 2017", es: "Desde 2017" },
      label: { en: "In business", es: "En el negocio" },
    },
    {
      figure: both("250+"),
      label: { en: "Projects completed", es: "Proyectos completados" },
    },
    {
      figure: both("MBE + DBE"),
      label: { en: "Certified", es: "Certificados" },
    },
    {
      figure: { en: "Licensed", es: "Con licencia" },
      label: { en: "and insured", es: "y seguro" },
    },
  ],
  services: [
    { en: "Interior painting", es: "Pintura interior" },
    { en: "Exterior painting", es: "Pintura exterior" },
    { en: "Surface preparation", es: "Preparación de superficies" },
    { en: "Drywall repairs", es: "Reparación de drywall" },
    { en: "Protective coatings", es: "Recubrimientos protectores" },
  ],
  projects: [
    { en: "Residential", es: "Residencial" },
    { en: "Commercial", es: "Comercial" },
    { en: "Multi-unit", es: "Múltiples unidades" },
  ],
  hero: {
    image: colonialFinished,
    alt: {
      en: "A colonial house repainted white, with dark trim and a stone terrace",
      es: "Una casa colonial repintada de blanco, con molduras oscuras y una terraza de piedra",
    },
  },
  pairs: [
    {
      job: {
        en: "A colonial house, scraped and repainted",
        es: "Una casa colonial, raspada y repintada",
      },
      before: {
        image: colonialPeeling,
        alt: {
          en: "The house before: paint peeling from the clapboard, and a painter on a ladder preparing it",
          es: "La casa antes: pintura descascarada en las tablas, y un pintor en una escalera preparándola",
        },
      },
      after: {
        image: colonialFinished,
        alt: {
          en: "The same house finished: white clapboard and dark trim",
          es: "La misma casa terminada: tablas blancas y molduras oscuras",
        },
      },
    },
    {
      job: {
        en: "A dining room, from yellow to gray",
        es: "Un comedor, de amarillo a gris",
      },
      before: {
        image: diningRoomYellow,
        alt: {
          en: "The room before: yellow walls, with drop cloths down and the work starting",
          es: "El cuarto antes: paredes amarillas, con lonas en el piso y el trabajo comenzando",
        },
      },
      after: {
        image: diningRoomFinished,
        alt: {
          en: "The same room finished: gray walls, white trim and a white mantel",
          es: "El mismo cuarto terminado: paredes grises, molduras blancas y una repisa blanca",
        },
      },
    },
    {
      job: {
        en: "A store's ceiling, sprayed black",
        es: "El techo de una tienda, pintado de negro",
      },
      before: SIGN_IN_PHOTO,
      after: {
        image: ceilingFinished,
        alt: {
          en: "The same ceiling finished: black beams over white walls",
          es: "El mismo techo terminado: vigas negras sobre paredes blancas",
        },
      },
    },
  ],
  // Twelve: two, three and four columns all end on a full row.
  gallery: [
    {
      image: newportHarborHouse,
      alt: {
        en: "A historic house in Newport, painted navy with white trim",
        es: "Una casa histórica en Newport, pintada de azul marino con molduras blancas",
      },
    },
    {
      image: diningRoomFireplace,
      alt: {
        en: "A dining room painted gray, with a white mantel and white trim",
        es: "Un comedor pintado de gris, con una repisa blanca y molduras blancas",
      },
    },
    {
      image: officeOpenPlan,
      alt: {
        en: "An open office with brick walls, exposed beams and white partitions",
        es: "Una oficina abierta con paredes de ladrillo, vigas a la vista y divisiones blancas",
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
      image: classroom,
      alt: {
        en: "A classroom with a freshly painted orange wall",
        es: "Un salón de clases con una pared recién pintada de naranja",
      },
    },
    {
      image: redTrimHouse,
      alt: {
        en: "A three-story house with tan siding and dark red trim, a ladder against its side",
        es: "Una casa de tres pisos con revestimiento color arena y molduras rojo oscuro, con una escalera a un lado",
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
      image: officeRingLight,
      alt: {
        en: "Office desks under a ring light, with white walls and an open ceiling",
        es: "Escritorios de oficina bajo una lámpara circular, con paredes blancas y el techo a la vista",
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
      image: warehouseInterior,
      alt: {
        en: "A warehouse interior: white walls and roof trusses over a dark gray band",
        es: "El interior de una bodega: paredes y armaduras blancas sobre una franja gris oscuro",
      },
    },
    {
      image: commercialExterior,
      alt: {
        en: "A commercial building with dark gray block walls",
        es: "Un edificio comercial con paredes de bloque gris oscuro",
      },
    },
    {
      image: bridgeRailing,
      alt: {
        en: "A bridge's black steel railing, along a city sidewalk",
        es: "La baranda de acero negra de un puente, junto a una acera",
      },
    },
  ],
  social: [
    { name: "Facebook", href: "https://www.facebook.com/profile.php?id=100063510039251" },
    { name: "Instagram", href: "https://www.instagram.com/dsierrapainting/" },
  ],
};
