import type { Catalog } from "./catalog";

export const es: Catalog = {
  appName: "TRADER",
  loading: "Cargando…",
  retry: "Intentar de nuevo",
  signIn: {
    title: "Iniciar sesión",
    email: "Correo electrónico",
    phone: "Tu número de celular",
    sendCode: "Envíame un código",
    codeSent: "Te enviamos un código por mensaje de texto.",
    code: "Código",
    changeNumber: "Usar otro número",
    badPhone: "Escribe tu número de celular de diez dígitos.",
    badCode: "Ese código no funcionó. Revísalo o pide uno nuevo.",
    submit: "Iniciar sesión",
    failed: "No funcionó. Revisa tu conexión e inténtalo de nuevo.",
    notOnRoster: "Nadie en una plantilla inicia sesión con eso. Pregunta en la oficina.",
    demo: "Tengo un código de demostración",
    demoHelp:
      "Solo para la empresa de demostración. No se envía ningún mensaje de texto.",
    demoCode: "Código de demostración",
    demoSubmit: "Entrar a la demostración",
    badDemo: "Ese número y ese código no son de una cuenta de demostración.",
    back: "Atrás",
    unavailable: "El inicio de sesión todavía no es parte de esta versión.",
    developmentOnly: "Inicio de sesión de desarrollo. No está en una versión publicada.",
  },
  tabs: { today: "Hoy", week: "Semana", settings: "Yo" },
  today: {
    title: "Hoy",
    jobs: "Tus obras",
    noJobs: "Todavía no hay ninguna obra abierta. Llama a la oficina.",
    firstLoad:
      "Este teléfono todavía no ha cargado tus obras. Conéctate e inténtalo de nuevo.",
    off: "No has marcado entrada.",
    working: (job, since) => `Trabajando en ${job} desde las ${since}.`,
    paused: (job) => `En descanso en ${job}.`,
    clockIn: "Marcar entrada",
    clockInAt: (job) => `Marcar entrada en ${job}`,
    clockOut: "Marcar salida",
    pause: "Empezar descanso",
    resume: "Terminar descanso",
    switchTo: (job) => `Cambiar a ${job}`,
    hoursToday: (hours) => `${hours} trabajadas hoy`,
    shiftNow: (job, start, end) => `Tu turno: ${job}, ${start}–${end}.`,
    shiftLater: (job, start) =>
      `Tu próximo turno es en ${job} a las ${start}. Puedes marcar entrada 15 minutos antes.`,
    noMoreShifts: "No tienes más turnos hoy.",
    noShift: "No tienes turno hoy. Llama a la oficina.",
    attention: "Requiere atención",
    shiftHours: (start, end) => `De ${start} a ${end}`,
    onTheClock: "Trabajando",
    onBreak: "En descanso",
    since: (time) => `Desde las ${time}`,
    switchJob: "Cambiar de obra",
    switchTitle: "¿A qué obra cambias?",
    clockOutTitle: "¿Marcar salida?",
    clockOutBody: (hours, job) => `${hours} trabajadas en ${job}.`,
    keepWorking: "Seguir trabajando",
    earlier: (job, day) => `Sigues con la entrada marcada en ${job} desde el ${day}.`,
    clockOutNow: "Marcar salida ahora",
    callOffice: "Llamar a la oficina",
    captured: "Guardado",
    job: {
      address: "Dirección",
      noAddress: "La oficina no ha puesto una dirección.",
      openMaps: "Abrir en mapas",
      notes: "Notas de la oficina",
      noNotes: "No hay notas para esta obra.",
      close: "Cerrar",
    },
  },
  entry: {
    types: {
      started: "Entrada",
      paused: "Inicio de descanso",
      resumed: "Fin de descanso",
      ended: "Salida",
    },
    unsent: "Guardado en este teléfono. Se enviará cuando haya conexión.",
    refused: "El sistema de la oficina no aceptó este registro.",
    refusals: {
      not_scheduled:
        "No tenías turno en esa obra a esa hora. Llama a la oficina para que agregue tus horas.",
      time_in_future:
        "El reloj de este teléfono estaba adelantado. Pon la hora en automático y pide a la oficina que agregue tus horas.",
      session_already_open:
        "Ya habías marcado entrada. Pide a la oficina que revise tus horas.",
      no_open_session:
        "No habías marcado entrada. Pide a la oficina que revise tus horas.",
      not_permitted:
        "Esa obra está cerrada. Llama a la oficina para que agregue tus horas.",
      other: (code) => `Pide a la oficina que agregue tus horas. Diles: ${code}.`,
    },
  },
  sync: {
    upToDate: "Todo está enviado.",
    unsent: (count) =>
      count === 1 ? "1 registro sin enviar." : `${count} registros sin enviar.`,
    offline: "Sin conexión. Tus registros están guardados en este teléfono.",
    working: "Enviando…",
    paused:
      "El sistema de la oficina pausó el envío. Tus registros están guardados en este teléfono.",
    readOnly:
      "El envío está en pausa por ahora. Tus registros están guardados en este teléfono.",
    updateRequired:
      "Actualiza la aplicación para enviar tus registros. Están guardados en este teléfono.",
    signInAgain:
      "Inicia sesión de nuevo para enviar tus registros. Están guardados en este teléfono.",
    wrongClock:
      "El reloj de este teléfono parece estar mal. Pon la hora en automático en los ajustes del teléfono.",
    now: "Enviar ahora",
    chip: {
      sent: "Enviado",
      saved: "Guardado en el teléfono",
      sending: "Enviando",
      attention: "Requiere atención",
    },
    waitingTitle: "Tus registros",
    nothingWaiting: "No hay nada pendiente en este teléfono.",
    close: "Cerrar",
  },
  week: {
    title: "Semana",
    updated: (age) => `Actualizado ${age}.`,
    never: "Todavía no se ha cargado en este teléfono.",
    stale: "Puede estar desactualizado. Conéctate para revisarlo.",
    refresh: "Revisar ahora",
    empty: "No tienes turnos en las próximas dos semanas.",
    today: "Hoy",
    hours: "Tus horas",
    noHours: "No hay horas en las últimas dos semanas.",
    open: "Trabajando",
    unscheduled: "Fuera de tu horario. La oficina puede revisarlo.",
    dayTotal: (hours) => `${hours} en total`,
    flags: {
      offline: "Guardado sin conexión.",
      corrected: "La oficina lo editó.",
      user_timed: "La hora se puso a mano.",
      location: "Sin ubicación, o lejos de la obra.",
      clock_skewed: "El reloj de este teléfono parecía estar mal.",
    },
  },
  age: {
    justNow: "ahora mismo",
    minutes: (n) => (n === 1 ? "hace 1 minuto" : `hace ${n} minutos`),
    hours: (n) => (n === 1 ? "hace 1 hora" : `hace ${n} horas`),
    days: (n) => (n === 1 ? "hace 1 día" : `hace ${n} días`),
  },
  settings: {
    title: "Yo",
    language: "Idioma",
    english: "English",
    spanish: "Español",
    signOut: "Cerrar sesión",
    unsentKept: (count) =>
      count === 1
        ? "1 registro no se ha enviado. Se queda en este teléfono y se envía cuando inicies sesión de nuevo."
        : `${count} registros no se han enviado. Se quedan en este teléfono y se envían cuando inicies sesión de nuevo.`,
    name: "Tu nombre",
    phone: "Teléfono de contacto",
    phoneHelp:
      "Donde la oficina puede llamarte. No es el número con el que inicias sesión.",
    save: "Guardar",
    saved: "Guardado.",
    saveFailed: "No se guardó. Revisa tu conexión e inténtalo de nuevo.",
    build: (build) => `Versión ${build}`,
  },
};
