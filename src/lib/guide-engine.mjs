// Motor único de VARINO Guide.
//
// Vive aquí, y no dentro del plugin del servidor, por un motivo concreto:
// la web publicada es estática y no tiene API. Si la lógica viviera solo en
// el servidor, el visitante real vería un asistente que no entiende nada.
// El mismo código corre en el navegador y en el servidor local; el modelo
// de lenguaje solo aporta redacción, nunca los datos ni la recomendación.

import { calculateEstimate, recommendHardware } from "./quote-engine.mjs";

export const TEXT_FIELDS = ["business", "sector", "problem", "process", "tools", "volume", "channels", "approvals", "goal"];

// Cada pregunta declara el campo que rellena. Así la respuesta del visitante
// aterriza en el campo correcto sin adivinar por expresiones regulares.
export const DISCOVERY_QUESTIONS = [
  { field: "business", question: "¿A qué se dedica tu empresa?" },
  { field: "problem", question: "¿Qué tarea, problema o cuello de botella quieres mejorar primero?" },
  { field: "process", question: "¿Cómo realizáis ahora ese proceso, desde que empieza hasta que termina?" },
  { field: "tools", question: "¿Qué herramientas o programas intervienen actualmente?" },
  { field: "channels", question: "¿Por qué canales entra la información o la solicitud?" },
  { field: "volume", question: "¿Qué volumen aproximado gestionáis al día o al mes?" },
  { field: "approvals", question: "¿Qué decisiones deben seguir necesitando aprobación humana?" },
  { field: "goal", question: "¿Qué resultado medible te indicaría que el sistema funciona?" },
];

const CLOSING_QUESTION = "¿Quieres que preparemos una propuesta revisada con este alcance?";

const GREETING = /^(hola|holaa+|buenas|buenos días|buenas tardes|buenas noches|hey|qué tal|que tal|saludos)[\s!.¡]*$/i;

const FIELD_HINTS = {
  process: /ahora|actualmente|primero|después|luego|paso|manual/i,
  tools: /n8n|make|zapier|crm|erp|excel|sheets|hubspot|salesforce|notion|odoo|correo|software|programa|agenda/i,
  volume: /\d|diari|seman|mensual|al día|al mes|pocos|muchos/i,
  channels: /web|formulario|whatsapp|correo|email|e-mail|teléfono|telefono|llamada|redes|instagram|chat|presencial/i,
  approvals: /aprob|autoriza|supervis|valida|revis|dirección|gerencia|nadie/i,
  goal: /reduc|aument|ahorr|mejorar|objetivo|hora|tiempo|por ciento|%|menos|más/i,
};

const SENSITIVE = /salud|clínic|clinic|médic|medic|paciente|dental|psicolog|abogad|jurídic|financ|contab|nómina|nomina|dni|historial|confidencial|sensible|expedient/i;
const GROWTH = /venta|lead|comercial|cliente potencial|captación|captacion|marketing|reserva|presupuesto|cotiza|oportunidad|seguimiento/i;
const KNOWLEDGE = /document|conocimiento|manual|expedient|contrato|informe|archivo|buscador|consulta interna/i;

const clampText = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const clampNumber = (value, min, max, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
};

export function normalizeProfile(candidate = {}) {
  const source = candidate || {};
  return {
    business: clampText(source.business, 160),
    sector: clampText(source.sector, 120),
    problem: clampText(source.problem, 300),
    process: clampText(source.process, 500),
    tools: clampText(source.tools, 250),
    volume: clampText(source.volume, 160),
    channels: clampText(source.channels, 200),
    approvals: clampText(source.approvals, 250),
    goal: clampText(source.goal, 250),
    integrations: clampNumber(source.integrations, 1, 12, 1),
    workflows: clampNumber(source.workflows, 1, 20, 1),
    users: clampNumber(source.users, 1, 250, 1),
    complexity: ["simple", "standard", "advanced"].includes(source.complexity) ? source.complexity : "standard",
    sensitivity: ["low", "medium", "high"].includes(source.sensitivity) ? source.sensitivity : "medium",
    customUi: Boolean(source.customUi),
    dataMigration: Boolean(source.dataMigration),
    localAi: source.localAi !== false,
  };
}

// El modelo puede devolver campos vacíos, inventados o "no". Lo ya confirmado
// por el visitante manda siempre.
export function mergeProfile(previous = {}, candidate = {}) {
  const known = normalizeProfile(previous || {});
  const proposed = normalizeProfile(candidate || {});
  const merged = { ...known };
  for (const field of TEXT_FIELDS) {
    if (known[field]) continue;
    const value = proposed[field];
    if (value && !/^(no|n\/a|na|ninguno|desconocido|unknown|null)$/i.test(value)) merged[field] = value;
  }
  for (const field of ["integrations", "workflows", "users"]) {
    if (!previous?.[field] && candidate?.[field]) merged[field] = proposed[field];
  }
  if (!previous?.complexity && candidate?.complexity) merged.complexity = proposed.complexity;
  if (!previous?.sensitivity && candidate?.sensitivity) merged.sensitivity = proposed.sensitivity;
  merged.customUi = Boolean(previous?.customUi) || proposed.customUi;
  merged.dataMigration = Boolean(previous?.dataMigration) || proposed.dataMigration;
  return merged;
}

export const isGreeting = (text) => GREETING.test(String(text ?? "").trim());

const lastOf = (messages, role) => [...(messages || [])].reverse().find((message) => message?.role === role)?.content || "";

// El modelo pequeño, si se le deja, rellena de una vez los nueve campos a
// partir de una sola frase: inventa volúmenes, herramientas y objetivos que el
// visitante nunca dijo. Cuando hay una pregunta en curso, la respuesta literal
// del visitante manda y el modelo no aporta datos; solo en un mensaje libre
// inicial se acepta que identifique negocio y problema.
const FREEFORM_MODEL_FIELDS = ["business", "problem"];

export function scopeModelProfile(modelProfile, askedField) {
  if (!modelProfile || askedField) return null;
  const scoped = {};
  for (const field of FREEFORM_MODEL_FIELDS) {
    if (modelProfile[field]) scoped[field] = modelProfile[field];
  }
  return scoped;
}

// El sector se deduce con una tabla propia. El modelo pequeño inventa
// etiquetas inexistentes ("Dentología") que luego se muestran al visitante.
const SECTORS = [
  [/dental|dentist|odontol/i, "clínicas dentales"],
  [/clínic|clinic|médic|medic|paciente|fisioterap|podolog|salud/i, "salud"],
  [/psicolog|terapia|terapeut/i, "psicología y terapia"],
  [/abogad|jurídic|juridic|legal|notar|procurad/i, "servicios jurídicos"],
  [/asesor|contab|fiscal|gestoría|gestoria|nómina|nomina/i, "asesoría y contabilidad"],
  [/inmobiliar|piso|alquiler|vivienda/i, "inmobiliaria"],
  [/taller|mecánic|mecanic|automoción|automocion|vehícul|vehicul/i, "automoción"],
  [/restaurant|bar\b|cafeter|hosteler|catering|cocina/i, "hostelería"],
  [/hotel|apartament|turism|reserva de habitac/i, "turismo y alojamiento"],
  [/tienda|comercio|ecommerce|e-commerce|shopify|venta online/i, "comercio y ecommerce"],
  [/formación|formacion|academia|escuela|curso|colegio|universidad/i, "formación"],
  [/construc|reforma|fontaner|electricist|climatiz|obra/i, "construcción y reformas"],
  [/logístic|logistic|transport|reparto|almacén|almacen/i, "logística"],
  [/inmobili|seguro|correduría|correduria/i, "seguros"],
  [/peluquer|estétic|estetic|belleza|spa\b/i, "estética y belleza"],
  [/veterinar|mascota/i, "veterinaria"],
  [/software|informátic|informatic|desarrollo|agencia|marketing|diseño|diseno/i, "servicios profesionales"],
  [/industri|fábrica|fabrica|fabricación|fabricacion|taller de producción/i, "industria"],
];

export function deriveSector(profile) {
  if (profile.sector) return profile.sector;
  const text = `${profile.business} ${profile.problem} ${profile.process}`;
  return SECTORS.find(([pattern]) => pattern.test(text))?.[1] || "";
}

const TOOL_PATTERNS = [/n8n/, /make\b|zapier/, /crm|hubspot|salesforce|pipedrive/, /erp|odoo|sage|a3/, /excel|hoja de c[áa]lculo|sheets/, /notion|airtable|trello|asana/, /agenda|calendar/, /factur|contab/, /web|wordpress|shopify/];
const CHANNEL_PATTERNS = [/whatsapp/, /correo|email|e-mail|gmail|outlook/, /tel[eé]fono|llamada/, /formulario|web/, /instagram|facebook|redes|linkedin/, /presencial|mostrador|recepci[óo]n/, /chat/];
const CUSTOM_UI = /panel|interfaz|dashboard|cuadro de mando|portal|app propia/i;
const DATA_MIGRATION = /migrar|migraci[óo]n|hist[óo]rico|traspasar datos|importar datos|a[ñn]os de datos/i;

// Las cifras que mueven el presupuesto se deducen de las palabras del propio
// visitante, nunca del modelo: un número inventado cambia el precio.
export function deriveScope(profile) {
  const toolText = `${profile.tools} ${profile.process}`.toLowerCase();
  const channelText = `${profile.channels} ${profile.process}`.toLowerCase();
  // El volumen entra en allText porque ahí es donde el visitante dice cuántas
  // personas son: sin él, un equipo de 4 se presupuestaba como 1 usuario.
  const allText = `${profile.business} ${profile.problem} ${profile.process} ${profile.tools} ${profile.channels} ${profile.volume} ${profile.approvals} ${profile.goal}`.toLowerCase();

  const tools = TOOL_PATTERNS.filter((pattern) => pattern.test(toolText)).length;
  const channels = CHANNEL_PATTERNS.filter((pattern) => pattern.test(channelText)).length;
  const integrations = Math.max(1, Math.min(12, tools + channels));
  // Una aprobación humana es un control, no un flujo: sumarla inflaba el
  // alcance y el precio de procesos sencillos.
  const workflows = Math.max(1, Math.min(20, channels));

  const people = allText.match(/(\d{1,3})\s*(personas?|empleados?|usuarios?|trabajador\w*|profesionales?|recepcionistas?|comerciales?|t[ée]cnicos?)/);
  const users = people ? clampNumber(people[1], 1, 250, 1) : 1;

  // La sensibilidad ya se cobra como horas de riesgo en el presupuesto; hacer
  // que además subiera la complejidad era cobrar dos veces lo mismo.
  const complexity = integrations >= 5 ? "advanced" : integrations <= 1 ? "simple" : "standard";

  return {
    integrations,
    workflows,
    users,
    complexity,
    customUi: CUSTOM_UI.test(allText),
    dataMigration: DATA_MIGRATION.test(allText),
  };
}

// Qué campo pedía la última pregunta. Primero por coincidencia exacta con
// nuestras propias preguntas; después por pistas, para preguntas del modelo.
export function fieldFromQuestion(assistantText) {
  const text = String(assistantText ?? "").toLowerCase();
  if (!text) return "";
  const exact = DISCOVERY_QUESTIONS.find(({ question }) => text.includes(question.toLowerCase().replace(/^¿/, "").slice(0, 26)));
  if (exact) return exact.field;
  if (/a qué se dedica|tipo de negocio|tu empresa|tu negocio|sector/.test(text)) return "business";
  if (/problema|mejorar primero|cuello de botella|tarea.*repetitiv/.test(text)) return "problem";
  if (/cómo.*proceso|cómo lo hac|paso a paso|desde que empieza/.test(text)) return "process";
  if (/herramienta|programa|software|integraci/.test(text)) return "tools";
  if (/canal|por dónde|cómo llega/.test(text)) return "channels";
  if (/volumen|cuánt/.test(text)) return "volume";
  if (/aprob|autoriza|decisión human/.test(text)) return "approvals";
  if (/resultado medible|objetivo|cómo medir|éxito/.test(text)) return "goal";
  return "";
}

// Registra la última respuesta del visitante. Devuelve el campo rellenado
// para que la respuesta visible pueda reconocer exactamente ese dato.
//
// La pregunta manda sobre dónde aterriza la respuesta, y el texto que se guarda
// es el del visitante, no la versión reescrita por el modelo: antes se aplicaba
// primero lo que extraía el modelo y, cuando adelantaba un campo, cada
// respuesta caía en el siguiente hueco y el perfil quedaba desplazado.
export function applyLastAnswer(profile, messages = []) {
  const answer = clampText(lastOf(messages, "user"), 500);
  const asked = fieldFromQuestion(lastOf(messages, "assistant"));
  let filledField = "";
  if (answer) {
    if (asked) {
      profile[asked] = answer;
      filledField = asked;
    } else {
      // Mensaje libre: sin pregunta previa se deduce por pistas y, si no hay
      // ninguna, ocupa el primer hueco pendiente.
      for (const [field, hint] of Object.entries(FIELD_HINTS)) {
        if (!profile[field] && hint.test(answer)) {
          profile[field] = answer;
          filledField = filledField || field;
        }
      }
      if (!filledField) {
        const pending = DISCOVERY_QUESTIONS.find(({ field }) => !profile[field]);
        if (pending) {
          profile[pending.field] = answer;
          filledField = pending.field;
        }
      }
    }
  }
  if (SENSITIVE.test(`${profile.sector} ${profile.business} ${profile.problem} ${answer}`)) profile.sensitivity = "high";
  return { profile, filledField };
}

export function nextUsefulQuestion(profile) {
  return DISCOVERY_QUESTIONS.find(({ field }) => !profile[field])?.question || CLOSING_QUESTION;
}

export function stageFor(profile) {
  if (!profile.business && !profile.problem) return "welcome";
  if (!profile.business || !profile.problem) return "discovery";
  if (!profile.process) return "process";
  if (!profile.tools || !profile.channels || !profile.volume) return "requirements";
  if (!profile.approvals || !profile.goal) return "architecture";
  return "estimate";
}

// Dos ejes distintos: qué hace el sistema (el servicio) y dónde se procesan
// los datos (una restricción de entrega). Confundirlos hacía que cualquier
// sector con datos sensibles acabara en "IA privada" aunque el problema fuera
// claramente comercial. La sensibilidad se resuelve con despliegue local, y
// eso ya lo cubre el perfil de hardware.
export function recommendService(profile) {
  const text = `${profile.problem} ${profile.goal} ${profile.process} ${profile.channels}`.toLowerCase();
  if (KNOWLEDGE.test(text)) return { name: "IA privada", slug: "ia-privada" };
  if (GROWTH.test(text)) return { name: "Sistema de crecimiento", slug: "sistema-crecimiento" };
  if (profile.sensitivity === "high") return { name: "IA privada", slug: "ia-privada" };
  return { name: "Automation Sprint", slug: "automation-sprint" };
}

// Recorta la pregunta que el modelo mete dentro de la respuesta: la pregunta
// la decide el motor, no el modelo, para no preguntar dos cosas a la vez.
export function cleanReply(value) {
  let reply = clampText(value, 900);
  const questionStart = reply.indexOf("¿");
  if (questionStart >= 0) reply = reply.slice(0, questionStart).trim();
  return reply;
}

const RATIONALE = {
  "ia-privada": "La opción más coherente es IA privada: centralizar la entrada, aislar los datos sensibles y dejar trazabilidad para revisión humana.",
  "sistema-crecimiento": "La opción más coherente es un Sistema de crecimiento: conectar la entrada, priorizar cada caso y preparar el seguimiento para que una persona lo apruebe.",
  "automation-sprint": "La opción más coherente es un Automation Sprint: convertir este proceso en un flujo observable, con excepciones y recuperación documentadas.",
};

const ACKNOWLEDGEMENT = {
  business: (value) => `Anotado el contexto: ${value}.`,
  sector: (value) => `Anotado el sector: ${value}.`,
  problem: (value) => `Entiendo el punto de fricción: ${value}.`,
  process: (value) => `Ya tengo el proceso actual: ${value}.`,
  tools: (value) => `Tendré en cuenta las herramientas actuales: ${value}.`,
  volume: (value) => `Tomo como referencia este volumen: ${value}.`,
  channels: (value) => `La entrada quedaría conectada desde ${value}.`,
  approvals: (value) => `Mantendremos bajo aprobación humana: ${value}.`,
  goal: (value) => `Usaremos como criterio de éxito: ${value}.`,
};

// Una respuesta del modelo sirve si aporta algo. Si es genérica, se descarta:
// más vale una frase concreta escrita por el motor que un halago vacío.
function isWeak(reply, service) {
  if (reply.length < 72) return true;
  if (/^(gracias|entiendo|perfecto|claro|genial|estupendo)\b/i.test(reply)) return true;
  if (/varino (puede|podría|te puede|os puede)/i.test(reply)) return true;
  if (/lo incorporo|tomo nota|buena pregunta/i.test(reply)) return true;
  // El modelo pequeño a veces recomienda un servicio distinto al calculado.
  const others = ["Automation Sprint", "Sistema de crecimiento", "IA privada"].filter((name) => name !== service.name);
  return others.some((name) => new RegExp(name, "i").test(reply));
}

export function consultativeReply({ profile, filledField, modelReply, service }) {
  const cleaned = cleanReply(modelReply);
  if (cleaned && !isWeak(cleaned, service)) return cleaned;
  const value = filledField ? clampText(profile[filledField], 180) : "";
  const acknowledgement = value && ACKNOWLEDGEMENT[filledField]
    ? ACKNOWLEDGEMENT[filledField](value)
    : "Anotado, lo incorporo al mapa del sistema.";
  if (!(profile.business && profile.problem && profile.process)) return acknowledgement;
  return `${acknowledgement} ${RATIONALE[service.slug]}`;
}

export function hardwareFor(profile, documentCount = 0) {
  // El nivel se deduce del caso, no se fija a mano: un piloto de una persona
  // no necesita el mismo equipo que diez usuarios con datos sensibles, y
  // prometer 64 GB a todo el mundo infla el presupuesto sin motivo.
  const heavy = (profile.sensitivity === "high" && profile.users > 5) || profile.users > 10 || profile.complexity === "advanced";
  const modelSize = heavy ? "large" : profile.users > 3 || profile.sensitivity === "high" ? "medium" : "small";
  return recommendHardware({
    ...profile,
    modelSize,
    concurrency: Math.max(1, Math.min(8, Math.ceil(profile.users / 5))),
    documentCount,
  });
}

export function welcomeCopy(messages) {
  const greeting = isGreeting(lastOf(messages, "user"));
  return greeting
    ? {
        reply: "Hola, soy VARINO Guide. Te haré unas preguntas cortas y, con tus respuestas, dibujaré el sistema y un rango de horas y precio.",
        nextQuestion: DISCOVERY_QUESTIONS[0].question,
      }
    : {
        reply: "Anotado. Lo incorporo al diagnóstico antes de proponer una arquitectura.",
        nextQuestion: DISCOVERY_QUESTIONS[0].question,
      };
}

// Punto de entrada único. `modelProfile` y `modelReply` son opcionales: sin
// modelo el resultado sigue siendo completo y verificable.
export function advise({ messages = [], profile: previousProfile = {}, modelProfile = null, modelReply = "", documentCount = 0 } = {}) {
  const known = normalizeProfile(previousProfile);
  const firstTurn = messages.filter((message) => message.role === "user").length <= 1;
  const greetingOnly = firstTurn && isGreeting(lastOf(messages, "user")) && !known.business && !known.problem;

  if (greetingOnly) {
    const copy = welcomeCopy(messages);
    return {
      reply: copy.reply,
      nextQuestion: copy.nextQuestion,
      stage: "welcome",
      profile: known,
      estimate: null,
      hardware: null,
      service: null,
      filledField: "",
    };
  }

  // Se acota lo que el modelo puede aportar antes de mezclarlo: solo el campo
  // que se preguntó. Después, el alcance numérico se deduce del texto real.
  const askedField = fieldFromQuestion(lastOf(messages, "assistant"));
  const merged = mergeProfile(known, scopeModelProfile(modelProfile, askedField));
  const { profile, filledField } = applyLastAnswer(merged, messages);
  profile.sector = deriveSector(profile);
  // El sector puede revelar sensibilidad que no estaba en la frase literal.
  if (SENSITIVE.test(profile.sector)) profile.sensitivity = "high";
  Object.assign(profile, deriveScope(profile));
  const service = recommendService(profile);
  // El modelo local solo forma parte de la solución cuando el servicio es IA
  // privada. Antes quedaba a true por defecto y la guía presupuestaba horas de
  // IA y hardware (32 GB de memoria) para un Automation Sprint de 1.000 €.
  profile.localAi = service.slug === "ia-privada";
  const stage = stageFor(profile);
  const quoteReady = Boolean(profile.problem && (profile.business || profile.sector) && profile.process);
  return {
    reply: consultativeReply({ profile, filledField, modelReply, service }),
    nextQuestion: nextUsefulQuestion(profile),
    stage,
    profile,
    estimate: quoteReady ? calculateEstimate(profile) : null,
    hardware: quoteReady && profile.localAi ? hardwareFor(profile, documentCount) : null,
    service,
    filledField,
  };
}
