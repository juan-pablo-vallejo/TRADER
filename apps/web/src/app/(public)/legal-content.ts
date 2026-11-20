// The privacy policy and the terms, as content: the words in English and Spanish, in one
// file, so the pages' code never changes when the words do.
//
// A DRAFT until the owner approves it (docs/TASKS.md, item 21, the owner's gate 7). While
// `APPROVED` is false both pages say so at the top. Three things are the owner's to
// supply and are not invented here: who operates TRADER (the legal name), how to reach
// them about privacy, and any clause a lawyer wants (liability, governing law). A part
// left null draws a line saying it is still to come, on the draft only.
//
// The policy says what the product does and no more. Each sentence below is held to the
// code: a location stamp at each clock tap unless switched off (apps/mobile/src/location.ts,
// packages/api/src/sync/scope.ts), error reports to Sentry (apps/web/src/server/reporter.ts
// and, for the phone, docs/TASKS.md item 12), sign-in by Clerk, invoice email by Resend,
// reminders that never leave the phone (apps/mobile/src/reminders.tsx), no analytics.
import type { Language } from "../i18n/language";

export const APPROVED = false;
// The day the words below last changed.
export const LAST_CHANGED = "2026-11-20";

// The legal name of whoever operates TRADER, and where a person writes about privacy.
export const OPERATOR: string | null = null;
export const PRIVACY_CONTACT: string | null = null;

export type Section = { heading: string; paragraphs: string[] };
export type Document = { title: string; intro: string; sections: Section[] };

export const PRIVACY: Record<Language, Document> = {
  en: {
    title: "Privacy policy",
    intro:
      "TRADER is a work tool: a painting contractor's crew sees its week and clocks in and out on a phone, and the contractor's office schedules the crew, reads the hours and invoices its customers. This page says what TRADER records about you, why, and who else handles it. It records nothing else.",
    sections: [
      {
        heading: "Whose records these are",
        paragraphs: [
          "Your company, the contractor that invited you, decides who is in TRADER and what is recorded for its business. The records are your company's. TRADER's operator keeps them on your company's behalf and does not use them for anything else.",
          "Nobody in one company can see anything of another company.",
        ],
      },
      {
        heading: "What is recorded",
        paragraphs: [
          "About you, from your office: your name, the mobile number you sign in with, an email if the office gave one, and whether you are a worker or an admin. You can add a contact phone yourself.",
          "Your schedule: the shifts the office plans for you.",
          "Your hours: each time you clock in, clock out, switch jobsite, start a break or end one, the app records that it happened, on which jobsite, the time on your phone and the time the office's system received it, and whether the phone had a connection. These entries are never edited or deleted. If one is wrong, the office adds a correcting entry beside it, and both stay.",
          "For the office's own work: its customers' names and contact details, its jobsites and their addresses, its invoices and the payments it notes on them.",
        ],
      },
      {
        heading: "Location",
        paragraphs: [
          "At the moment you tap to clock in, clock out, switch jobsite, or start or end a break, the app records where the phone is: one position, with how accurate it is. That is the only time. The app reads a location only while it is open on your screen, never in the background, and it does not follow you between taps.",
          "The position is kept with the entry so the office can tell whether a tap was at the jobsite. The office sees a mark on an entry that had no location or was away from the jobsite; it is not shown a map of where you were.",
          "Your office can switch location off for the whole company or for you alone, and the app then neither asks for a location nor records one. You can also refuse the phone's location permission: the clock still works, and your entries are marked as having no location.",
          "An admin can also set a jobsite's location from where their own phone is. That position is saved as the jobsite's place, not as a record about the admin.",
        ],
      },
      {
        heading: "Reminders",
        paragraphs: [
          "If you turn reminders on, your phone reminds you when a shift starts and when it ends. The phone sets these for itself from your schedule. They are not sent from a server and never leave the phone.",
        ],
      },
      {
        heading: "Who else handles it",
        paragraphs: [
          "TRADER runs on services from other companies, each doing one job and receiving only what that job needs:",
          "Clerk signs you in: it receives your mobile number or email and sends the code you type.",
          "Vercel runs the office's website and the system the app talks to, and Neon holds the database where the records are kept.",
          "Resend delivers an invoice by email when the office sends one: it receives the customer's email address and the invoice.",
          "Sentry receives error reports when something in the office or the app fails, so it can be fixed. A report describes the failure and the version of the software. It is built to carry no name, phone number, location or entry.",
          "The app itself reaches your phone through Apple's or Google's store, under their own terms.",
        ],
      },
      {
        heading: "What TRADER does not do",
        paragraphs: [
          "No advertising. No analytics or tracking of how you use the app. Nothing is sold or shared for marketing. TRADER takes no payments and holds no card or bank details: a payment on an invoice is a note the office writes.",
        ],
      },
      {
        heading: "How long it is kept, and your choices",
        paragraphs: [
          "Records are kept for as long as your company uses TRADER, because hours and invoices are business records your company must be able to show. When someone leaves, the office deactivates them: they can no longer sign in, and the hours already recorded stay.",
          "To see what is recorded about you, to have a mistake corrected, or to ask for something to be removed, ask your office first: the records are theirs to change. You can also write to the operator at the address below.",
        ],
      },
    ],
  },
  es: {
    title: "Política de privacidad",
    intro:
      "TRADER es una herramienta de trabajo: la cuadrilla de un contratista de pintura ve su semana y marca entrada y salida en un teléfono, y la oficina del contratista organiza a la cuadrilla, lee las horas y factura a sus clientes. Esta página dice qué anota TRADER sobre ti, para qué, y quién más lo maneja. No anota nada más.",
    sections: [
      {
        heading: "De quién son estos registros",
        paragraphs: [
          "Tu empresa, el contratista que te invitó, decide quién está en TRADER y qué se anota para su negocio. Los registros son de tu empresa. Quien opera TRADER los guarda por cuenta de tu empresa y no los usa para nada más.",
          "Nadie de una empresa puede ver nada de otra empresa.",
        ],
      },
      {
        heading: "Qué se anota",
        paragraphs: [
          "Sobre ti, de parte de tu oficina: tu nombre, el número de celular con el que inicias sesión, un correo si la oficina dio uno, y si eres trabajador o administrador. Tú puedes agregar un teléfono de contacto.",
          "Tu horario: los turnos que la oficina planea para ti.",
          "Tus horas: cada vez que marcas entrada, marcas salida, cambias de obra, empiezas un descanso o lo terminas, la aplicación anota que pasó, en qué obra, la hora de tu teléfono y la hora en que el sistema de la oficina lo recibió, y si el teléfono tenía conexión. Estos registros nunca se editan ni se borran. Si uno está mal, la oficina agrega al lado un registro que lo corrige, y los dos se conservan.",
          "Para el trabajo de la oficina: los nombres y datos de contacto de sus clientes, sus obras y sus direcciones, sus facturas y los pagos que anota en ellas.",
        ],
      },
      {
        heading: "Ubicación",
        paragraphs: [
          "En el momento en que tocas para marcar entrada, marcar salida, cambiar de obra, o empezar o terminar un descanso, la aplicación anota dónde está el teléfono: una sola posición, con qué tan exacta es. Ese es el único momento. La aplicación lee la ubicación solo mientras está abierta en tu pantalla, nunca en segundo plano, y no te sigue entre un toque y otro.",
          "La posición se guarda con el registro para que la oficina sepa si marcaste en la obra. La oficina ve una señal en un registro que no tuvo ubicación o que fue lejos de la obra; no se le muestra un mapa de dónde estuviste.",
          "Tu oficina puede desactivar la ubicación para toda la empresa o solo para ti, y entonces la aplicación ni pide la ubicación ni la anota. También puedes negar el permiso de ubicación del teléfono: el reloj sigue funcionando, y tus registros quedan señalados como sin ubicación.",
          "Un administrador también puede fijar la ubicación de una obra desde donde está su propio teléfono. Esa posición se guarda como el lugar de la obra, no como un registro sobre el administrador.",
        ],
      },
      {
        heading: "Recordatorios",
        paragraphs: [
          "Si activas los recordatorios, tu teléfono te avisa cuando un turno empieza y cuando termina. El teléfono los programa por sí mismo a partir de tu horario. No se envían desde un servidor y nunca salen del teléfono.",
        ],
      },
      {
        heading: "Quién más lo maneja",
        paragraphs: [
          "TRADER funciona con servicios de otras empresas, cada una con una sola tarea y recibiendo solo lo que esa tarea necesita:",
          "Clerk te inicia la sesión: recibe tu número de celular o tu correo y envía el código que escribes.",
          "Vercel ejecuta el sitio de la oficina y el sistema con el que habla la aplicación, y Neon tiene la base de datos donde se guardan los registros.",
          "Resend entrega una factura por correo cuando la oficina la envía: recibe el correo del cliente y la factura.",
          "Sentry recibe informes de error cuando algo falla en la oficina o en la aplicación, para poder arreglarlo. Un informe describe la falla y la versión del programa. Está hecho para no llevar ningún nombre, número de teléfono, ubicación ni registro.",
          "La aplicación llega a tu teléfono por la tienda de Apple o de Google, bajo sus propios términos.",
        ],
      },
      {
        heading: "Lo que TRADER no hace",
        paragraphs: [
          "Sin publicidad. Sin analítica ni seguimiento de cómo usas la aplicación. Nada se vende ni se comparte para mercadeo. TRADER no cobra pagos ni guarda datos de tarjetas o de bancos: un pago en una factura es una nota que escribe la oficina.",
        ],
      },
      {
        heading: "Cuánto tiempo se guarda, y tus opciones",
        paragraphs: [
          "Los registros se guardan mientras tu empresa use TRADER, porque las horas y las facturas son registros del negocio que tu empresa debe poder mostrar. Cuando alguien se va, la oficina lo desactiva: ya no puede iniciar sesión, y las horas ya registradas se conservan.",
          "Para ver qué hay anotado sobre ti, para que se corrija un error, o para pedir que se quite algo, pregunta primero en tu oficina: los registros son suyos y ellos los cambian. También puedes escribir a quien opera TRADER, a la dirección de abajo.",
        ],
      },
    ],
  },
};

export const TERMS: Record<Language, Document> = {
  en: {
    title: "Terms of use",
    intro:
      "These are the terms for using TRADER, the app and the office website. They are short on purpose. Using TRADER means you accept them.",
    sections: [
      {
        heading: "Who may use it",
        paragraphs: [
          "TRADER is for a contractor's office and crew. You use it because your company invited you, with the mobile number or email it gave. Sign in only as yourself, and do not let someone else clock in or out for you.",
        ],
      },
      {
        heading: "What it is for",
        paragraphs: [
          "The crew sees its schedule and records its hours. The office plans shifts, reads and corrects hours, and writes and sends invoices. Use it for that work and nothing else.",
        ],
      },
      {
        heading: "Hours are a record, not a paycheck",
        paragraphs: [
          "TRADER records when you clocked in and out and adds up the time. It does not run payroll, calculate pay or pay anyone. What you are owed is between you and your company. If your hours look wrong, tell your office: they can add a correcting entry, and the original stays on record.",
        ],
      },
      {
        heading: "Invoices and payments",
        paragraphs: [
          "An invoice in TRADER is written by the company that issues it, and that company is responsible for what it says. TRADER takes no payments and moves no money: a payment shown on an invoice is a note the office wrote.",
        ],
      },
      {
        heading: "The records belong to the company",
        paragraphs: [
          "Everything a company and its crew enter belongs to that company. The privacy policy says what is recorded and who handles it.",
        ],
      },
      {
        heading: "When things go wrong",
        paragraphs: [
          "The app keeps working without a signal and sends your entries when it has one. Even so, a phone can be lost, a battery can die, and the service can be unavailable for a time. If something you recorded does not appear, tell your office, who can add the hours.",
        ],
      },
      {
        heading: "Changes",
        paragraphs: [
          "If these terms change, the date at the top of this page changes with them.",
        ],
      },
    ],
  },
  es: {
    title: "Términos de uso",
    intro:
      "Estos son los términos para usar TRADER, la aplicación y el sitio de la oficina. Son cortos a propósito. Usar TRADER significa que los aceptas.",
    sections: [
      {
        heading: "Quién puede usarlo",
        paragraphs: [
          "TRADER es para la oficina y la cuadrilla de un contratista. Lo usas porque tu empresa te invitó, con el número de celular o el correo que ella dio. Inicia sesión solo como tú, y no dejes que otra persona marque entrada o salida por ti.",
        ],
      },
      {
        heading: "Para qué es",
        paragraphs: [
          "La cuadrilla ve su horario y registra sus horas. La oficina planea turnos, lee y corrige horas, y escribe y envía facturas. Úsalo para ese trabajo y para nada más.",
        ],
      },
      {
        heading: "Las horas son un registro, no un pago",
        paragraphs: [
          "TRADER anota cuándo marcaste entrada y salida y suma el tiempo. No hace nómina, no calcula sueldos ni le paga a nadie. Lo que se te debe es entre tú y tu empresa. Si tus horas se ven mal, avisa en tu oficina: pueden agregar un registro que las corrija, y el original se conserva.",
        ],
      },
      {
        heading: "Facturas y pagos",
        paragraphs: [
          "Una factura en TRADER la escribe la empresa que la emite, y esa empresa responde por lo que dice. TRADER no cobra pagos ni mueve dinero: un pago que aparece en una factura es una nota que escribió la oficina.",
        ],
      },
      {
        heading: "Los registros son de la empresa",
        paragraphs: [
          "Todo lo que una empresa y su cuadrilla anotan es de esa empresa. La política de privacidad dice qué se anota y quién lo maneja.",
        ],
      },
      {
        heading: "Cuando algo falla",
        paragraphs: [
          "La aplicación sigue funcionando sin señal y envía tus registros cuando la tiene. Aun así, un teléfono se puede perder, una batería se puede acabar, y el servicio puede no estar disponible por un rato. Si algo que registraste no aparece, avisa en tu oficina, que puede agregar las horas.",
        ],
      },
      {
        heading: "Cambios",
        paragraphs: [
          "Si estos términos cambian, la fecha al principio de esta página cambia con ellos.",
        ],
      },
    ],
  },
};
