// The office's Spanish catalog, held to the English one's keys by the compiler. The
// trade's words are the phone's (apps/mobile/src/i18n/es.ts): a shift is a "turno", a
// job an "obra", a clock-in "entrada", a break "descanso", People "Personal".
// What a customer receives (the invoice, its PDF, its email) is not here: it is English.
import { MAX_JOBSITE_RADIUS_M } from "@trader/api/contract";

import type { Catalog } from "./en";

// "a la 1:15", "a las 2:30": the article follows the hour. And a sentence that ends with a time
// whose "a. m." or "p. m." already ends in a period takes no second one.
const las = (time: string) => (/^1:/.test(time) ? "la" : "las");
const end = (text: string) => (text.endsWith(".") ? text : `${text}.`);

export const es: Catalog = {
  devSignIn: "Inicio de sesión de desarrollo",
  devSignInBadEmail: "Escribe un correo electrónico.",
  email: "Correo electrónico",
  signIn: "Iniciar sesión",
  signOut: "Cerrar sesión",
  teamSignIn: "Acceso del equipo",
  getApp: "Obtener la aplicación",
  whatsAppChat: "Escríbenos por WhatsApp",
  emailUs: (address) => `Escribir a ${address}`,
  photos: "Nuestro trabajo",
  swipeFinished: "Desliza para verlo terminado",
  home: {
    contact: "Contacto",
    emailShort: "Correo",
    beforeAfter: "Antes y después",
    before: "Antes",
    after: "Después",
    whatWeDo: "Lo que hacemos",
    services: "Servicios",
    projects: "Proyectos",
    team: "Para el equipo",
    elsewhere: "Más de nuestro trabajo",
    viewPhoto: (what) => `Ver más grande: ${what}`,
    viewer: "Fotos de nuestro trabajo",
    previous: "Foto anterior",
    next: "Foto siguiente",
    photoOf: (n, total) => `${n} de ${total}`,
  },
  get: {
    title: "Obtén la aplicación TRADER",
    explain:
      "La aplicación a la que te invitó la oficina: tu semana, y marcar entrada y salida.",
    iphone: "Obtenerla para iPhone",
    android: "Obtenerla para Android",
    askOffice: "El enlace todavía no está aquí. Pídeselo a la oficina.",
    androidNote:
      "En Android la oficina primero tiene que agregar tu cuenta de Google a la lista de pruebas. Si la página dice que la aplicación no está disponible, pídeles que te agreguen.",
    thenSignIn:
      "Después abre la aplicación e inicia sesión con el número de celular o el correo electrónico con el que la oficina te invitó.",
    home: "Volver a la página principal",
  },
  account: "Tu cuenta",
  command: {
    title: "Buscar o hacer",
    open: "Buscar",
    placeholder: "Una persona, una obra, un cliente, una factura, o qué hacer",
    results: "Lo que se encontró",
    hint: "Arriba y abajo para elegir, Enter para ir, Esc para cerrar.",
    none: "Nada con ese nombre.",
    inactive: "Desactivada",
    kinds: {
      action: "Hacer",
      person: "Persona",
      job: "Obra",
      customer: "Cliente",
      invoice: "Factura",
    },
    actions: {
      shift: "Turno nuevo",
      invoice: "Factura nueva",
      invite: "Invitar a una persona",
      export: "Exportar horas",
    },
  },
  keys: {
    title: "Teclado",
    open: "Atajos de teclado",
    explain:
      "En cualquier tabla y en el horario. Una tecla no hace nada mientras escribes en un campo. Todo esto también se puede hacer con el puntero o con Tab.",
    space: "Espacio",
    does: {
      next: "Fila siguiente. Con el foco en una tabla, J y K recorren sus filas.",
      previous: "Fila anterior.",
      along:
        "A lo largo de la fila: la siguiente celda de la semana en Horas y en el horario.",
      open: "Abrir el panel o la página de la fila.",
      close: "Cerrar el panel. El foco vuelve a donde estaba.",
      tab: "El siguiente control, como en todas partes.",
      help: "Esta lista.",
    },
  },
  jobsTabs: "Obras y clientes",
  loadingRows: "Cargando",
  language: "Idioma",
  languages: { en: "English", es: "Español" },

  navigation: "Oficina",
  menu: "Menú",
  skipToContent: "Saltar al contenido",
  nav: {
    today: "Hoy",
    people: "Personal",
    customers: "Clientes",
    jobs: "Obras",
    schedule: "Horario",
    hours: "Horas",
    invoices: "Facturas",
  },
  hoursTitle: "Horas",
  people: "Personal",
  customers: "Clientes",
  jobs: "Obras",
  schedule: {
    title: "Horario semanal",
    explain:
      "Solo los turnos planeados. Las horas trabajadas y sus correcciones están en Horas.",
    previousWeek: "Semana anterior",
    nextWeek: "Semana siguiente",
    previous: "Anterior",
    next: "Siguiente",
    thisWeek: "Esta semana",
    weekOf: (from, to) => `${from} – ${to}`,
    view: "Vista",
    byPerson: "Por persona",
    byJobsite: "Por obra",
    person: "Persona",
    jobsite: "Obra",
    everyone: "Todo el personal",
    showPerson: "Mostrar",
    day: "Día",
    addShift: "Agregar turno",
    addShiftFor: (name, day) => `Agregar un turno para ${name} el ${day}`,
    copyLastWeek: "Copiar la semana pasada",
    noShifts: "No hay turnos esta semana.",
    people: (n) => (n === 1 ? "1 persona" : `${n} personas`),
    locked: "Empezado",
    lockedExplain:
      "Alguien marcó entrada en este turno, así que su obra, su día y su inicio quedan fijos. Puede terminar antes, y la persona puede pasar a otra obra.",
    addToday: "Agregar",
    personWeek: (name) => `La semana de ${name}`,
    personWeekEmpty: "Todavía no hay turnos esta semana.",
    endEarly: "Terminar antes",
    endEarlyAt: "Hora en que termina",
    endEarlyEffect: (name, jobsite, was, at) =>
      `El turno de ${name} en ${jobsite} terminará a ${las(at)} ${at} y no a ${las(was)} ${was}. Las horas registradas no cambian: marca salida en su propio teléfono.`,
    endedEarly: "El turno ahora termina antes.",
    notEarlier: "Elige una hora anterior al final que el turno tiene ahora.",
    notAfterStart: "Elige una hora posterior al inicio del turno.",
    move: "Mover a otra obra",
    moveTo: "Mover a",
    moveNow: (time) => `Se mueve a ${las(time)} ${time}, la hora de ahora.`,
    moveEffect: (name, from, to, at, end) =>
      `Desde ${las(at)} ${at}, ${name} tiene turno en ${to} hasta ${las(end)} ${end}, y el turno en ${from} termina a ${las(at)} ${at}. Cambia de obra en su propio teléfono.`,
    moved: "Listo, movido. Cambia de obra en su propio teléfono.",
    moveNotNow: "Mover es para un turno que está en curso hoy.",
    sameJob: "Ya está en esa obra.",
    correctInLabor: "Corregir en Horas",
    shiftOf: (name) => `Turno — ${name}`,
    openShift: (name, jobsite, hours, day) => `${name}, ${jobsite}, ${hours}, ${day}`,
    days: "Días",
    start: "Empieza",
    end: "Termina",
    save: "Guardar turno",
    add: "Agregar turno",
    addShifts: (n) => (n === 1 ? "Agregar 1 turno" : `Agregar ${n} turnos`),
    remove: "Quitar turno",
    did: {
      moved: (name, day) => `El turno de ${name} se movió al ${day}.`,
      changed: (name, hours) => end(`El turno de ${name} cambió a ${hours}`),
      removed: (name, day) => `Se quitó el turno de ${name} del ${day}.`,
    },
    undo: "Deshacer",
    undoneChange: "Deshecho: el turno quedó como estaba.",
    notDone: (why) => `No se cambió nada y la semana quedó como estaba. ${why}`,
    notUndone: (why) => `No se pudo deshacer. ${why}`,
    added: (n) => (n === 1 ? "1 turno agregado." : `${n} turnos agregados.`),
    alreadyThere: (n) => (n === 1 ? " 1 ya estaba." : ` ${n} ya estaban.`),
    notAdded: (day, why) => `${day}: no se agregó. ${why}`,
    pickDay: "Elige al menos un día.",
    endAfterStart: "El final debe ser después del inicio.",
    overlap: (other, hours) => end(`Se cruza con ${other} durante ${hours}`),
    thisShift: "Este turno",
    cannotSave: "Esto no se puede guardar:",
    overlapRefused:
      "Una persona está en una sola obra a la vez. Cambia las horas o el día.",
    overlapsHeading: "Cruces",
    issue: {
      duplicate: "Ese turno ya existe.",
      overlap: (a, b, hours) => end(`${a} y ${b} se cruzan durante ${hours}`),
      changed: "El horario cambió mientras tanto. Cierra esto e inténtalo de nuevo.",
    },
    refused: {
      started: (shift) =>
        `Alguien ya marcó entrada en ${shift}, y esto cambiaría lo que lo permitió.`,
      locked:
        "Alguien marcó entrada en este turno, así que no puede cambiar. Corrige sus horas en Horas.",
      stale: "Este turno cambió mientras tanto. Cierra esto e inténtalo de nuevo.",
      userInactive: "Esa persona está desactivada.",
      jobArchived: "Esa obra está archivada.",
    },
    copyTitle: "Copiar la semana pasada",
    copyExplain: (from, to) =>
      `Copia los turnos de la semana del ${from} a la semana del ${to}.`,
    copyCreate: (n) => (n === 1 ? "Crear 1 turno" : `Crear ${n} turnos`),
    copyNothing: "No hay nada que crear.",
    copyLeftOut: (n) => (n === 1 ? "1 turno queda fuera" : `${n} turnos quedan fuera`),
    copyWillCreate: (n) => (n === 1 ? "Se creará 1 turno" : `Se crearán ${n} turnos`),
    copyDone: (n) => (n === 1 ? "Se creó 1 turno." : `Se crearon ${n} turnos.`),
    copyStale:
      "El horario cambió desde que se mostró esto. Esta es la copia como quedaría ahora.",
    copyFailed: "No se creó nada. Puedes intentar la misma copia de nuevo.",
    undoCopy: (n) =>
      n === 1 ? "Deshacer la copia de 1 turno" : `Deshacer la copia de ${n} turnos`,
    undoEffect: (n) =>
      `${n === 1 ? "El turno" : `Los ${n} turnos`} que creó esta copia se ${n === 1 ? "quitará" : "quitarán"}, aunque ${n === 1 ? "haya cambiado" : "hayan cambiado"} después.`,
    undoLocked: (n) =>
      `Una copia de ${n === 1 ? "1 turno" : `${n} turnos`} no se puede deshacer: alguien marcó entrada en uno de ellos.`,
    undone: (n) => (n === 1 ? "Se quitó 1 turno." : `Se quitaron ${n} turnos.`),
    leftOut: {
      user_inactive: "persona desactivada",
      job_archived: "obra archivada",
      duplicate: "ya estaba",
      overlap: "se cruzaría",
      started: "alguien ya marcó entrada ese día",
    },
  },
  crewStatus: {
    working: "Trabajando",
    break: "En descanso",
    late: "Tarde",
    expected: "Por llegar",
    done: "Terminó",
  },
  todayScreen: {
    title: "Hoy",
    attention: "Requiere atención",
    attentionClear: "Nada requiere atención.",
    stillOpen: (name, job, day) => `${name} sigue trabajando en ${job} desde el ${day}.`,
    correct: "Corregir",
    correctOf: (name) => `Corregir en Horas el tiempo de ${name}`,
    late: (name, job, start) =>
      end(`${name} va tarde a ${job}, que empezó a ${las(start)} ${start}`),
    whatsApp: "WhatsApp",
    whatsAppOf: (name) => `Escribir a ${name} por WhatsApp`,
    noNumber: "Sin número",
    more: (n) => (n === 1 ? "Y 1 más" : `Y ${n} más`),
    onTheClock: "Trabajando ahora",
    nobodyWorking: "Nadie está trabajando.",
    at: (job, since) => `${job}, desde ${las(since)} ${since}`,
    onBreakAt: (job, since) => `En descanso. ${job}, desde ${las(since)} ${since}`,
    expected: "Por llegar",
    expectedAt: (job, start) => `${job}, desde ${las(start)} ${start}`,
    done: "Terminaron por hoy",
    worked: (hours) => `${hours} trabajadas`,
    money: "Dinero",
    owed: (amount) => `${amount} por cobrar`,
    owedInvoices: (n) => (n === 1 ? "en 1 factura" : `en ${n} facturas`),
    nothingOwed: "No se debe nada.",
    overdue: (amount) => `${amount} vencido`,
    drafts: (n) =>
      n === 0
        ? "No hay borradores pendientes."
        : n === 1
          ? "1 borrador pendiente de emitir"
          : `${n} borradores pendientes de emitir`,
    notInvoiced: (n) =>
      n === 0
        ? "Todas las obras terminadas tienen factura."
        : n === 1
          ? "1 obra terminada no tiene factura"
          : `${n} obras terminadas no tienen factura`,
    toInvoices: "Facturas",
    toJobs: "Obras",
    asOf: (time) => `A ${las(time)} ${time}`,
  },
  legal: {
    privacy: "Política de privacidad",
    terms: "Términos de uso",
    lastChanged: (day) => `Último cambio: ${day}`,
    draft:
      "Borrador. Este texto todavía no está aprobado y puede cambiar antes de que TRADER se publique.",
    operator: "Quién opera TRADER",
    operatorToCome:
      "Falta agregar a este borrador el nombre legal de quien opera TRADER.",
    contactToCome:
      "Falta agregar a este borrador una dirección para preguntas sobre privacidad.",
  },
  settings: {
    title: "Ajustes",
    company: "Empresa",
    companyExplain: "Estos datos se imprimen en todas las facturas.",
    companyName: "Nombre de la empresa",
    companyEmail: "Correo electrónico",
    howToPay: "Cómo pagar",
    howToPayHint:
      "Unas pocas líneas, impresas tal como las escribas bajo “How to pay” en todas las facturas.",
    terms: "Plazo de pago, en días",
    termsHint:
      "Días desde que se emite una factura hasta que vence. 0 es pago al recibirla.",
    badTerms: "Escribe un número entero de días, de 0 a 365.",
    badPhone: "Escribe un número que WhatsApp pueda abrir, con su código de país.",
    timezone: "Zona horaria",
    timezoneHint:
      "Se muestra, no se cambia aquí: las horas ya registradas se ponen en sus días según ella.",
    saveCompany: "Guardar empresa",
    clock: "Reloj de horas",
    on: "Activado",
    off: "Desactivado",
    enforcement: "Exigir el horario",
    enforcementIs: {
      on: "Activado: una persona marca entrada solo en un turno suyo, desde 15 minutos antes de que empiece.",
      off: "Desactivado: una persona marca entrada en cualquier obra abierta, a cualquier hora.",
    },
    enforcementTurnOn: "Exigir el horario",
    enforcementTurnOff: "Dejar de exigir el horario",
    enforcementEffect: {
      on: "Desde la próxima vez que cada teléfono sincronice, una persona podrá marcar entrada solo en un turno suyo. Quien no tenga turno hoy no podrá marcar entrada hasta que la oficina le agregue uno.",
      off: "Desde la próxima vez que cada teléfono sincronice, cualquiera podrá marcar entrada en cualquier obra abierta a cualquier hora, con turno o sin él.",
    },
    stamps: "Ubicación al marcar",
    stampsIs: {
      on: "Activado: cada vez que alguien marca se anota dónde está el teléfono, y marcar lejos de la obra deja un aviso.",
      off: "Desactivado: al marcar no se anota ninguna ubicación, y no queda ningún aviso por ella.",
    },
    stampsTurnOn: "Activar la ubicación al marcar",
    stampsTurnOff: "Desactivar la ubicación al marcar",
    stampsEffect: {
      on: "Desde la próxima vez que cada teléfono sincronice, pedirá la ubicación del teléfono y la anotará cada vez que alguien marque. Quienes tengan Desactivado en su propia fila siguen sin ella.",
      off: "Desde la próxima vez que cada teléfono sincronice, al marcar no se anotará ninguna ubicación. Quienes tengan Activado en su propia fila la siguen teniendo.",
    },
    me: "Yo",
  },
  invoices: {
    nav: "Facturas",
    title: "Facturas",
    explain:
      "Un borrador es tuyo para cambiarlo. Al emitirlo recibe el siguiente número y queda fijo; después lo único que se puede hacer es anularlo.",
    newDraft: "Nueva factura",
    job: "Obra",
    currency: "Moneda",
    start: "Empezar borrador",
    none: "Todavía no hay facturas.",
    number: "Número",
    customer: "Cliente",
    total: "Total",
    states: { draft: "Borrador", issued: "Emitida", void: "Anulada" },
    status: {
      draft: "Borrador",
      issued: "Emitida",
      partly_paid: "Pagada en parte",
      paid: "Pagada",
      overdue: "Vencida",
      void: "Anulada",
    },
    statusHeader: "Estado",
    issuedOn: "Emitida",
    due: "Vence",
    dueOn: (day) => `Vence el ${day}`,
    balance: "Saldo",
    presets: {
      all: "Todas",
      drafts: "Borradores",
      outstanding: "Por cobrar",
      overdue: "Vencidas",
      paid: "Pagadas",
    },
    noneHere: "No hay facturas que mostrar.",
    truncated: (shown: number) =>
      `Se muestran las ${shown} más recientes. Las anteriores están en la página de cada obra.`,
    figures: {
      outstanding: (amount) => `${amount} por cobrar`,
      overdue: (amount) => `${amount} vencido`,
      paidThisMonth: (amount) => `${amount} cobrado este mes`,
      nothing: "Nada por cobrar, nada vencido, nada cobrado este mes.",
    },
    dueDate: "Fecha de vencimiento (opcional)",
    dueDateHint:
      "Si la dejas vacía, al emitir se fija según el plazo de pago de la empresa.",
    draftOf: (job) => `Borrador — ${job}`,
    invoiceNo: (n) => `Factura ${n}`,
    back: "Todas las facturas",
    gone: "No hay ninguna factura en esta dirección.",
    issuedBy: (who, when) => `Emitida por ${who}, ${when}`,
    voidedBy: (who, when) => `Anulada por ${who}, ${when}`,
    lines: "Líneas",
    description: "Descripción",
    quantity: "Cantidad",
    unit: "Unidad",
    price: "Precio por unidad",
    amount: "Importe",
    addLine: "Agregar una línea",
    removeLine: (n) => `Quitar la línea ${n}`,
    lineOf: (n, label) => `Línea ${n}: ${label}`,
    noLines: "Todavía no hay líneas. Agrega una, o copia las horas de un día de abajo.",
    tax: "Impuesto",
    subtotal: "Subtotal",
    save: "Guardar borrador",
    saved: "Borrador guardado.",
    unsaved: "Guarda el borrador antes de emitirlo.",
    noLinesToIssue: "Este borrador no se puede emitir hasta que tenga una línea.",
    badLine: (n) =>
      `La línea ${n} necesita una descripción, una cantidad mayor que cero y un precio.`,
    badTax: "Escribe el impuesto como un importe, o 0.",
    tooLarge: "Un importe de esta factura es demasiado grande para guardarlo.",
    draw: "Las horas de esta obra",
    drawExplain:
      "Las horas registradas en esta obra, por día. Copiar un día agrega una línea con esas horas como cantidad. El precio lo escribes tú.",
    hoursOf: (quantity) => `${quantity} h`,
    add: "Copiar horas",
    addOf: (label) => `Copiar ${label} a una línea nueva`,
    nothingToDraw: "Esta obra todavía no tiene horas.",
    issue: "Emitir factura",
    issueEffect: (total) =>
      `Esta factura por ${total} recibe el siguiente número y ya no se podrá cambiar. Sus líneas y su impuesto quedan fijos como están guardados ahora.`,
    issued: (n) => `Emitida como factura ${n}.`,
    noSeries:
      "Esta empresa todavía no tiene una serie de números de factura. Se crea cuando se da de alta la empresa.",
    removeDraft: "Borrar borrador",
    removeEffect:
      "Este borrador y sus líneas se borrarán. No tiene número, así que no se pierde ninguno.",
    removed: "Borrador borrado.",
    voidIt: "Anular factura",
    pdf: "Descargar PDF",
    sendHeading: "Enviar por correo al cliente",
    sendExplain:
      "Envía esta factura como PDF. Cada envío queda anotado aquí, haya salido o no.",
    sendTo: "Enviar a",
    send: "Enviar factura",
    sendSent: "Enviada.",
    sendFailed: "No se pudo completar. Puedes enviarla de nuevo.",
    noSends: "Todavía no se ha enviado.",
    sentTo: (to, by, at) => `Enviada a ${to} por ${by}, ${at}`,
    failedTo: (to, by, at) => `No se envió a ${to} (lo intentó ${by}, ${at})`,
    sendFailures: {
      mail_not_configured:
        "El correo todavía no está configurado para esta oficina. No se envió nada.",
      recipient_not_allowed:
        "Este sistema no puede enviar a esa dirección. No se envió nada.",
      provider_refused:
        "El servicio de correo rechazó el mensaje. Revisa la dirección y envíala de nuevo.",
      provider_unreachable:
        "No se pudo llegar al servicio de correo. Envíala de nuevo en un momento.",
    },
    pdfSaved: (filename) => `Se guardó ${filename}.`,
    voidEffect: (n) =>
      `La factura ${n} quedará anulada. Conserva su número y sus líneas, y no se puede emitir de nuevo.`,
    voided: "Factura anulada.",
    unknownOutcome:
      "No pudimos saber si eso se hizo. La factura se volvió a leer: revísala; intentarlo de nuevo es seguro.",
    reversed: "Pago revertido.",
    notReversed: {
      void: "Esta factura está anulada, así que sus pagos quedan como están.",
      already_reversed: "Ese pago ya está revertido.",
      is_reversal: "Una reversión no se puede revertir.",
      id_conflict: "No se pudo completar. Inténtalo de nuevo.",
    },
    isIssued: "Esta factura está emitida y ya no se puede cambiar.",
    owed: "Por cobrar",
    paid: "Pagado",
    paidInFull: "Pagada por completo",
    payments: "Pagos",
    noPayments: "Todavía no hay ningún pago anotado.",
    paymentLine: (amount, day, method) => `${amount} · ${day} · ${method}`,
    recordedBy: (who) => `Anotado por ${who}`,
    reversedMark: "Revertido",
    reversalMark: "Reversión",
    methods: {
      check: "Cheque",
      cash: "Efectivo",
      card: "Tarjeta",
      bank_transfer: "Transferencia bancaria",
      other: "Otro",
    },
    recordPayment: "Anotar un pago",
    recordExplain:
      "Una nota del dinero que pagó el cliente. TRADER no cobra ni mueve dinero.",
    paymentAmount: "Importe",
    paymentDay: "Pagado el",
    paymentMethod: "Forma de pago",
    paymentNote: "Nota (opcional)",
    record: "Anotar pago",
    recorded: "Pago anotado.",
    badAmount: "Escribe el importe pagado, mayor que cero.",
    overpaid: (owed) => `Eso es más que los ${owed} que quedan por cobrar.`,
    reverse: "Revertir",
    reverseOf: (amount) => `Revertir el pago de ${amount}`,
    reverseEffect: (amount) =>
      `El pago de ${amount} quedará marcado como revertido y dejará de contar. Las dos anotaciones se quedan en la factura.`,
    hasPayments:
      "Todavía hay un pago en pie en esta factura. Reviértelo antes de anularla.",
  },

  loading: "Cargando…",
  signInToContinue: "Inicia sesión para continuar.",
  signInNotAdded: "Ninguna empresa ha agregado este acceso. Pregunta en la oficina.",
  signInNotSetUp: "El inicio de sesión no está configurado en este servidor.",
  signInForm: {
    google: "Continuar con Google",
    or: "o",
    googleRefused:
      "Ninguna empresa ha agregado esa cuenta de Google. Pregunta en la oficina.",
    signingIn: "Iniciando tu sesión…",
    notLoaded:
      "No se pudo cargar el inicio de sesión. Revisa tu conexión y vuelve a cargar esta página.",
    backToSignIn: "Volver a iniciar sesión",
    usePasskey: "Usar una llave de acceso",
    passkeyFailed: "Esa llave de acceso no funcionó. Inicia sesión con un código.",
    helper: "Escribe tu número de celular o tu correo. Te enviaremos un código.",
    address: "Número de celular o correo",
    send: "Envíame un código",
    sending: "Enviando…",
    badAddress: "Escribe un número de celular de diez dígitos o un correo.",
    codeTitle: "Escribe el código",
    codeTexted: (number) => `Lo enviamos por mensaje de texto al ${number}.`,
    codeEmailed: (address) => `Lo enviamos por correo a ${address}.`,
    code: "Código",
    checking: "Revisando…",
    resend: "Enviar otro código",
    resendIn: (seconds) => `Enviar otro código en ${seconds} s`,
    change: "Usar otro número o correo",
    codeWrong: "Ese código no funcionó. Revísalo o pide uno nuevo.",
    codeExpired: "Ese código venció. Pide uno nuevo.",
    tooMany: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
    locked:
      "Este acceso está bloqueado por ahora. Inténtalo más tarde o pregunta en la oficina.",
    failed: "No se pudo completar. Revisa tu conexión e inténtalo de nuevo.",
    unfinished: "El inicio de sesión no pudo terminar aquí. Pregunta en la oficina.",
    trouble: "¿Problemas para iniciar sesión?",
    troubleNoCode:
      "¿No llegó el código? Espera 30 segundos y pide otro. También puedes usar tu correo si la oficina lo tiene.",
    troubleNewDevice:
      "¿Teléfono nuevo, llave de acceso perdida o Face ID no funciona? Inicia sesión con un código. Después actívalo de nuevo.",
    troubleNeverInvited:
      "¿Nunca te invitaron? Solo la oficina puede agregarte. Pregúntales.",
  },
  notPermitted: "No tienes permiso.",
  requestFailed: "No se pudo completar. No se guardó nada. Inténtalo de nuevo.",
  fieldRefusal: {
    missing: "Completa este campo.",
    email: "Escribe un correo electrónico.",
    other: "Este campo no acepta ese valor.",
  },
  loadFailed: "Esta página no cargó.",
  refreshFailed: (time: string) =>
    `No se pudo actualizar: esto es lo último leído (${time}).`,
  loadFailedHelp: "No se cambió nada. Revisa la conexión e inténtalo de nuevo.",
  tryAgain: "Intentar de nuevo",
  pageError: "Algo salió mal en esta página.",
  pageErrorHelp: "El paso que falló no guardó nada. Inténtalo de nuevo para seguir.",
  reload: "Recargar",
  fallback: {
    notFoundCode: "Error 404",
    notFoundTitle: "No encontramos esa página",
    notFoundBody:
      "Puede que la dirección esté mal escrita o que la página se haya movido. No se cambió nada.",
    errorCode: "Algo salió mal",
    goToToday: "Ir a Hoy",
    goHome: "Ir a la página de inicio",
    goBack: "Volver",
    tryAgain: "Intentar de nuevo",
    reference: "Referencia",
  },
  cancel: "Cancelar",

  details: "Datos",

  emptyPeople: "Todavía no se ha invitado a nadie.",
  addPerson: "Invitar a una persona",
  invite: "Invitar",
  name: "Nombre",
  role: "Rol",
  status: "Estado",
  edit: "Editar",
  unsavedInPanel:
    "Lo que cambiaste aquí no está guardado. Guárdalo, o pulsa Escape otra vez para descartarlo.",
  close: "Cerrar",
  emailTaken: "Otra persona ya tiene ese correo.",
  phoneTaken: "Otra persona ya tiene ese número de celular.",
  companyClosed: "Esta empresa de demostración no puede invitar a nadie.",
  mobileNumber: "Número de celular",
  signInAddress: "Acceso",
  addressNeeded: "Escribe un número de celular o un correo.",
  mobileNumberInvalid: "Escribe un número de diez dígitos de Estados Unidos o Canadá.",
  inviteAddressHint:
    "Da un número de celular, un correo, o ambos. Inician sesión con un código enviado al que escriban.",
  deactivate: "Desactivar",
  reactivate: "Reactivar",
  lastAdmin: "Es el último administrador. Primero haz administrador a alguien más.",
  deactivatePersonEffect: (name) =>
    `${name} no podrá iniciar sesión ni enviar horas desde su teléfono. Las horas que la oficina ya tiene se conservan.`,
  unchanged: "Sin cambios.",
  active: "Activa",
  invitationStatus: {
    not_sent: "Sin enviar",
    sent: "Enviada · sin verificar",
    verified: "Verificada",
  },
  deactivated: "Desactivada",
  roles: { admin: "Administrador", worker: "Trabajador" },
  passkeys: {
    title: "Llaves de acceso",
    explain:
      "Una llave de acceso te inicia la sesión en la oficina con el bloqueo de este dispositivo, sin código. Tu cara o tu huella nunca sale del dispositivo.",
    offer:
      "Inicia sesión más rápido la próxima vez: agrega una llave de acceso, y el bloqueo de este dispositivo te inicia la sesión sin código.",
    add: "Agregar una llave de acceso",
    notNow: "Ahora no",
    added: "Llave de acceso agregada. La próxima vez, elige Usar una llave de acceso.",
    removed: "Llave de acceso quitada.",
    none: "Todavía no hay llaves de acceso.",
    unnamed: "Llave de acceso",
    addedOn: (day) => `Agregada el ${day}`,
    lastUsed: (day) => `usada por última vez el ${day}`,
    neverUsed: "nunca usada",
    remove: "Quitar",
    removeEffect: (name) =>
      `${name} ya no te iniciará la sesión. Puedes seguir iniciando sesión con un código, y agregar otra llave de acceso.`,
    signInAgain: "Iniciar sesión de nuevo",
    failures: {
      sign_in_again:
        "Primero inicia sesión de nuevo: una llave de acceso se puede agregar o quitar dentro de los diez minutos después de iniciar sesión.",
      cancelled: "No se cambió nada.",
      exists: "Este dispositivo ya tiene una llave de acceso tuya.",
      unsupported: "Este navegador no puede usar llaves de acceso.",
      failed: "No se pudo completar. Inténtalo de nuevo.",
    },
  },
  personPanel: {
    open: (name) => `Abrir a ${name}`,
    makeAdmin: "Hacer administrador",
    makeAdminEffect: (name) =>
      `${name} verá y podrá cambiar todo en esta oficina: las horas de todos, el horario, las facturas y esta lista.`,
    makeWorker: "Hacer trabajador",
    makeWorkerEffect: (name) =>
      `${name} ya no abrirá esta oficina: solo su propia semana, sus horas y Yo.`,
    ownRole: "Tu propio rol lo cambia otro administrador.",
    location: "Ubicación al marcar",
    locationExplain:
      "Si al marcar se anota dónde está el teléfono. Como la empresa sigue el ajuste de todos.",
    locationAs: { company: "Como la empresa", on: "Activado", off: "Desactivado" },
    saveLocation: "Guardar ubicación",
    numbers: "Números",
    signInNumber: (number) => `Acceso: ${number}`,
    contactNumber: (number) => `Contacto: ${number}`,
    noNumber: "No hay ningún número anotado.",
    theirWeek: "Su semana en Horas",
    invitation: "Invitación",
    invitationExplain:
      "Todavía no ha iniciado sesión. Mándale dónde obtener la aplicación. El mensaje ya está escrito, en inglés y en español: envíalo por mensaje de texto desde tu propio teléfono, o deja que TRADER lo mande por correo.",
    invitedOn: (day) => `Invitación del ${day}`,
    sendByWhatsApp: "Enviar por WhatsApp",
    sentIt: "Ya lo envié",
    sendByEmail: "Enviar por correo",
    emailGoesTo: (email) => `Por correo, TRADER manda el mismo mensaje a ${email}.`,
    emailed: (email) => `Enviada a ${email}.`,
    byWhatsApp: (by, at) => `Por WhatsApp de ${by}, ${at}`,
    copiedBy: (by, at) => `Copiado por ${by}, ${at}, aún sin enviar`,
    openedBy: (by, at) => `Abierto en WhatsApp por ${by}, ${at}, aún sin enviar`,
    byEmail: (by, at) => `Por correo, enviada por ${by}, ${at}`,
    emailNotSent: (by, at) => `El correo no salió (lo intentó ${by}, ${at})`,
    refused: {
      id_conflict: "No se pudo completar. Inténtalo de nuevo.",
      deactivated: "Esta persona está desactivada. No se envió nada.",
      signed_in: "Ya inició sesión. No se envió nada.",
      no_email: "No tiene correo anotado.",
      no_number: "No tiene número de acceso anotado.",
      no_link:
        "Este servidor no tiene una dirección propia a la cual enlazar. No se envió nada.",
      too_many: "Ya es suficiente correo por un día. Envíala de nuevo mañana.",
      company_closed: "Esta empresa de demostración no puede invitar a nadie.",
    },
    copyInvitation: "Copiar el mensaje",
    copied:
      "Copiado. Pégalo en un mensaje de WhatsApp para esa persona y luego pulsa Ya lo envié.",
    opened: "Cuando haya salido en WhatsApp, pulsa Ya lo envié.",
    addresses: "Direcciones de acceso",
    addressesExplain:
      "Lo que escribe para iniciar sesión. Deja una vacía para quitarla: una de las dos siempre se queda.",
    adminAddresses:
      "Las direcciones de acceso de un administrador no se cambian aquí. Pide ayuda al soporte de TRADER: support@jpteq.app",
    signInNumberField: "Número de acceso",
    changeEmail: "Cambiar el correo",
    changeNumber: "Cambiar el número de acceso",
    changeEffect: (name, address) =>
      `Quien tenga ${address} podrá iniciar sesión como ${name}. La sesión de ${name} se cierra en todas partes y vuelve a iniciarla con esa dirección.`,
    removeEffect: (name, address) =>
      `${name} ya no iniciará sesión con ${address}, y su sesión se cierra en todas partes.`,
    addressChanged:
      "Cambiado. Su sesión se cerró, y de ahora en adelante inicia sesión con esa dirección.",
    addressMatched: "Su acceso ya coincide con esto.",
    emailInvalid: "Escribe un correo, o déjalo vacío para quitarlo.",
    addressRefused: {
      admin:
        "Las direcciones de acceso de un administrador no se cambian aquí. Pide ayuda al soporte de TRADER: support@jpteq.app",
      deactivated: "Esta persona está desactivada. No se cambió nada.",
      last_address: "Necesita una dirección para iniciar sesión. Dale primero la otra.",
      email_taken: "Otra persona ya tiene ese correo.",
      phone_taken: "Otra persona ya tiene ese número de celular.",
      address_held: "Esa dirección no se puede usar. No se cambió nada.",
      no_login:
        "Esta persona aún no tiene un acceso que cambiar. Se podrá cambiar cuando haya iniciado sesión.",
      company_closed:
        "Esta empresa de demostración no puede cambiar la dirección de nadie.",
    },
    addressWas: {
      email: {
        given: (to, by, at) => `Correo ${to} dado por ${by}, ${at}`,
        changed: (from, to, by, at) =>
          `Correo cambiado de ${from} a ${to} por ${by}, ${at}`,
        removed: (from, by, at) => `Correo ${from} quitado por ${by}, ${at}`,
      },
      sign_in_phone: {
        given: (to, by, at) => `Número de acceso ${to} dado por ${by}, ${at}`,
        changed: (from, to, by, at) =>
          `Número de acceso cambiado de ${from} a ${to} por ${by}, ${at}`,
        removed: (from, by, at) => `Número de acceso ${from} quitado por ${by}, ${at}`,
      },
    },
    invitedNote: (name) =>
      `${name} ya tiene invitación. Ahora dile dónde obtener la aplicación.`,
  },
  onlyPerson: (name) => `Solo ${name}.`,
  showEveryone: "Mostrar a todos",

  emptyCustomers: "Todavía no hay clientes.",
  addCustomer: "Agregar cliente",
  customerAdded: (name: string) => `Se agregó ${name}.`,
  address: "Dirección",
  phone: "Teléfono",
  companyPhoneHelp:
    "El equipo escribe a la oficina por WhatsApp a este número. Incluye el código de país; un número sin él se lee como de Estados Unidos.",
  notes: "Notas",
  jobsUnarchived: (n) =>
    `${n === 1 ? "1 obra de este cliente no está archivada" : `${n} obras de este cliente no están archivadas`}. ${n === 1 ? "Archívala" : "Archívalas"} primero.`,
  deactivateCustomerEffect:
    "No se podrá agregar ninguna obra nueva para este cliente. Sus obras anteriores se conservan.",

  remove: "Quitar",

  jobForm: {
    open: (name) => `Abrir ${name}`,
    editShort: "Editar",
    added: (name) => `Se agregó ${name}.`,
    newCustomer: "+ Un cliente nuevo",
    newCustomerName: "Nombre del cliente nuevo",
    hoursWeek: "Horas esta semana",
    hoursToDate: "Horas hasta hoy",
    notes: "Notas para el equipo",
    notesHint: "El equipo las ve en su teléfono, en la tarjeta de la obra.",
    location: "Ubicación (opcional)",
    locationHint:
      "Pega las coordenadas de un mapa, como 41.8240, -71.4128, o una dirección de mapas que las muestre.",
    locationFromCrew:
      "Un administrador también puede fijarla desde la pestaña Equipo del teléfono, estando en la obra.",
    locationProblem: {
      empty: "Pega las coordenadas, o deja la ubicación vacía.",
      short_link:
        "Un enlace corto de mapas esconde las coordenadas. Ábrelo, mantén presionado el lugar en el mapa y copia los dos números que muestra.",
      unreadable:
        "Eso no es un par de coordenadas ni una dirección de mapas que las muestre. Se ve así: 41.8240, -71.4128.",
      out_of_range: "Esos números no son un lugar: revisa las coordenadas.",
    },
    badRadius: `Escribe el radio en metros enteros, de 1 a ${MAX_JOBSITE_RADIUS_M}.`,
  },
  jobPage: {
    back: "Todas las obras",
    gone: "No hay ninguna obra en esta dirección.",
    steps: "Cómo va esta obra",
    step: {
      scheduled: "Con turnos",
      hoursRecorded: "Con horas registradas",
      invoiced: "Facturada",
      paid: "Pagada",
    },
    notYet: (step) => `Todavía no: ${step}`,
    schedule: "Poner turnos",
    createInvoice: "Crear factura",
    openDraft: "Abrir su borrador",
    noHoursClosed:
      "No se registraron horas en esta obra, así que no hay nada que facturar.",
    waitingForHours:
      "Las horas aparecen aquí cuando el equipo marca entrada en esta obra.",
    waitingForPayment: "Un pago se anota en la factura misma.",
    people: "Personas",
    hoursLine: (week, toDate) => `${week} h esta semana, ${toDate} h hasta hoy.`,
    onItNow: "Aquí ahora",
    scheduledThisWeek: "Con turno esta semana",
    noPeople: "Nadie tiene turno en esta obra esta semana, y nadie tiene horas en ella.",
    noInvoices: "Todavía no hay facturas de esta obra.",
    location: "Ubicación",
    locationIs: (pair, radius) => `${pair}, a menos de ${radius} m`,
    none: "Ninguna",
    edit: "Editar los datos",
    openJob: (name) => `${name}: cómo va la obra`,
  },
  emptyJobs: "No hay obras que mostrar.",
  addJob: "Agregar obra",
  job: "Obra",
  customer: "Cliente",
  chooseCustomer: "Elige un cliente",
  radiusM: "Radio (m)",
  show: "Mostrar",
  allJobs: "Todas",
  jobStatus: { open: "Abierta", complete: "Terminada", archived: "Archivada" },
  saveDetails: "Guardar datos",
  setStatus: "Cambiar estado",
  archiveJobEffect:
    "La obra sale de la lista de obras de los teléfonos y nadie puede tener turno en ella. Sus horas y facturas se conservan.",
  customerInactive: "Ese cliente está desactivado.",
  customerInactiveOnStatus:
    "Este cliente está desactivado. Reactívalo, o pasa primero la obra a otro cliente.",
  hasInvoices: "Esta obra tiene facturas; su cliente ya no puede cambiar.",
  archivedNote:
    "Las obras archivadas salen de la lista de los teléfonos en la siguiente sincronización; quien siga trabajando allí todavía puede marcar salida.",
  person: "Persona",
  chooseJob: "Elige una obra",
  planFrom: "Desde",
  planThrough: "Hasta",
  date: "Fecha",

  hoursRange: "Elige hasta 31 días, el primero no después del último.",
  emptyHours: "No hay horas registradas para esta persona en estos días.",
  hoursOpenSince: (day) =>
    `Sigue trabajando desde el ${day}. No puede marcar entrada de nuevo hasta que ese tiempo se termine o se corrija.`,
  sessionCounts: {
    eligible: "Cuenta",
    voided: "Anulada",
  },
  flags: "Avisos",
  entryTypes: {
    started: "Entrada",
    paused: "Inicio de descanso",
    resumed: "Fin de descanso",
    ended: "Salida",
    voided: "Anulación",
  },
  dayOf: (name, day) => `${name}, ${day}`,
  entryWas: (time) => `Antes: ${time}`,
  entryBy: (name) => `Lo anotó ${name}`,
  entryReceived: (when) => `recibido el ${when}`,
  noLocation: "Sin ubicación",
  offSite: "Fuera de la obra",
  previewWorked: (worked) => `Estas horas dan ${worked} trabajadas.`,
  previewOpen: (worked) =>
    `Estas horas dan ${worked} trabajadas hasta ahora, sin salida.`,
  previewNone: "Escribe todas las horas, en orden, para ver cuánto dan.",
  entryVoids: "Anula este tiempo",
  reasonTags: {
    offline: "sin conexión",
    corrected: "corregido",
    user_timed: "hora puesta a mano",
    location: "ubicación",
    clock_skewed: "reloj erróneo",
    unscheduled: "fuera del horario",
  },
  reconExplain:
    "Las horas de cada persona por día y obra, en los días que elijas. Todos los registros cuentan; un aviso dice por qué quizá quieras revisarlo. El tiempo de un día en una obra se suma primero y después se redondea a la centésima de hora.",
  workDatesIn: (zone) => `Fechas de trabajo en ${zone}.`,
  noHoursYet: "Todavía no ha terminado ninguna hora en estos días.",
  reconTotal: (hours) => `${hours} h en estos días`,
  hoursValue: (hours) => `${hours} h`,
  emptyReconciliation: "No hay horas registradas en estos días.",

  correct: "Corregir",
  correctionOf: (job, started) => `Corregir ${job}, ${started}`,
  correctionExplain:
    "Cambia una hora o la obra, o agrega un registro que falta. Cada cambio es un registro nuevo y cuenta de inmediato.",
  correctionTimes: "Horas",
  correctionAdded: "Registros por agregar",
  addEntry: "Agregar un registro",
  addedEntryType: (n) => `Registro ${n}`,
  addedEntryTime: (n) => `Hora del registro ${n}`,
  saveCorrection: "Guardar corrección",
  correctionSaved: "Guardado.",
  correctionBadTime:
    "Escribe una fecha y una hora. Una hora que los relojes se saltaron ese día no se puede usar.",
  correctionTooMany: "Máximo 20 cambios a la vez. Guarda algunos y después haz el resto.",
  correctionUnsent:
    "No se pudo completar. Inténtalo de nuevo: se envía la misma corrección, así que no puede quedar anotada dos veces.",
  correctionChanged:
    "Estos registros cambiaron desde que se mostraron. Ya se actualizaron: revísalos y corrige de nuevo.",
  voidSession: "Anular este tiempo",
  voidSessionEffect:
    "Este tiempo dejará de contar. Si sigue abierto, primero se marca la salida. Sus registros se conservan.",
  addMissingHours: "Agregar horas que faltan",
  missingHoursExplain:
    "Horas que nadie registró: una entrada y, cuando se sabe, la salida. Cuentan de inmediato, con el aviso de hora puesta a mano.",
  missingClockIn: "Entrada",
  missingClockOut: "Salida (opcional)",
  addHours: "Agregar horas",
  jobOptionArchived: (name) => `${name} · archivada`,
  correctionRejected: {
    no_open_session:
      "No estaba trabajando a esa hora para uno de estos registros. Revisa las horas.",
    session_already_open:
      "Ya estaba trabajando a esa hora. Termina o corrige primero ese tiempo.",
    not_paused: "Un fin de descanso necesita antes un inicio de descanso.",
    already_paused: "Ya está en descanso a esa hora.",
    target_missing:
      "Estos registros cambiaron desde que se mostraron. Muéstralos de nuevo y después corrige.",
    target_is_correction:
      "Estos registros cambiaron desde que se mostraron. Muéstralos de nuevo y después corrige.",
    correction_of_void: "Una anulación no se puede corregir.",
    correction_type_mismatch:
      "Estos registros cambiaron desde que se mostraron. Muéstralos de nuevo y después corrige.",
    correction_job_mismatch: "Solo una entrada puede pasar a otra obra.",
    void_target_not_started:
      "Estos registros cambiaron desde que se mostraron. Muéstralos de nuevo y después corrige.",
    already_voided: "Este tiempo ya está anulado.",
    breaks_following_event:
      "Esa hora dejaría un registro fuera de orden con los que siguen. Cámbialos en la misma corrección.",
    correction_superseded:
      "Estos registros cambiaron desde que se mostraron. Muéstralos de nuevo y después corrige.",
    correction_moves_session:
      "Esa hora pasaría un registro a otro tramo de trabajo. Déjalo entre su propia entrada y su salida.",
    job_id_mismatch:
      "Un registro agregado debe ser de la misma obra que el resto de ese tiempo.",
    id_conflict: "No se pudo completar. No se guardó nada. Guarda de nuevo.",
    time_in_future: "Una de estas horas todavía no ha pasado.",
    correction_stale:
      "Estos registros cambiaron desde que se mostraron. Ya se actualizaron: revísalos y corrige de nuevo.",
    void_leaves_session_open:
      "Este tiempo sigue abierto; anularlo solo dejaría a la persona trabajando. Actualiza y vuelve a anularlo.",
  },

  week: {
    thisWeek: "Esta semana",
    lastWeek: "La semana pasada",
    dates: "Fechas",
    flaggedOnly: "Solo con avisos",
    show: "Mostrar estas fechas",
    caption: (range) => `Horas por persona y día, ${range}`,
    listCaption: (range) => `Horas por persona, fecha y obra, ${range}`,
    total: "Suma",
    allPeople: "Todos",
    openDay: (name, day) => `${name}, ${day}: abrir los registros`,
    openHeading: "Siguen trabajando",
    openSince: (name, job, day) => `${name} en ${job}, desde el ${day}`,
    openExplain:
      "Todavía no hay salida, así que este tiempo no está en ninguna cifra de abajo.",
    stillOpenBadge: "trabajando",
    emptyFlagged: "No hay avisos en estos días.",
    export: "Exportar para nómina",
    exportTitle: "Exportar horas para nómina",
    exportTotal: (hours) => `${hours} h en total`,
    exportFlagged: (n) =>
      n === 0
        ? "No hay registros con avisos."
        : n === 1
          ? "1 registro con aviso que quizá quieras revisar antes."
          : `${n} registros con avisos que quizá quieras revisar antes.`,
    exportOpen: (n) =>
      n === 0
        ? "Nadie sigue trabajando."
        : n === 1
          ? "1 persona sigue trabajando. Ese tiempo no está en el archivo."
          : `${n} personas siguen trabajando. Ese tiempo no está en el archivo.`,
    exportHolds:
      "Una fila por persona, día y obra, con los avisos de cada fila. Solo horas: sin tarifas y sin pagos. Nada queda fijo: las mismas fechas más adelante dan las horas como estén entonces.",
    download: "Descargar CSV",
    downloaded: (filename) => `Se guardó ${filename}.`,
  },

  hours: "Horas",
  timesIn: (zone) => `Horas en ${zone}.`,
  worked: "Trabajado",
  breaks: "Descansos",
  stillOpen: "Sigue trabajando",
  timeCorrected: "Corregido",
  duration: (h, m) => `${h} h ${String(m).padStart(2, "0")} min`,

  contactPhone: "Teléfono de contacto",
  managedBySignIn: "La oficina lo cambia.",
  adminAddressesCaption: "Pide al soporte de TRADER que lo cambie: support@jpteq.app",
  signInNumber: "Número de acceso",
  signInNumberCaption:
    "Tu código para iniciar sesión se envía aquí. La oficina lo cambia.",
  save: "Guardar",
  saved: "Guardado.",
};
