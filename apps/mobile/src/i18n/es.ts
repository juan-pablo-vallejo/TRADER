import type { Catalog } from "./catalog";

export const es: Catalog = {
  appName: "TRADER",
  loading: "Cargando…",
  retry: "Intentar de nuevo",
  signIn: {
    title: "Iniciar sesión",
    email: "Correo electrónico",
    submit: "Iniciar sesión",
    failed: "No funcionó. Revisa tu conexión e inténtalo de nuevo.",
    notOnRoster: "Nadie en una nómina tiene esa dirección. Pregunta en la oficina.",
    unavailable: "El inicio de sesión aún no es parte de esta versión.",
    developmentOnly: "Inicio de sesión de desarrollo. No está en una versión publicada.",
  },
  tabs: { today: "Hoy", settings: "Ajustes" },
  today: {
    title: "Hoy",
    jobs: "Tus obras",
    noJobs: "Todavía no tienes ninguna obra. Pregunta en la oficina.",
    loadFailed: "Esto no cargó. No se cambió nada.",
  },
  settings: {
    title: "Ajustes",
    signedInAs: (name) => `Sesión iniciada como ${name}`,
    language: "Idioma",
    english: "English",
    spanish: "Español",
    signOut: "Cerrar sesión",
  },
};
