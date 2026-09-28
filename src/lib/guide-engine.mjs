// Motor único de VARINO Guide.
//
// Vive aquí, y no dentro del plugin del servidor, por un motivo concreto:
// la web publicada es estática y no tiene API. Si la lógica viviera solo en
// el servidor, el visitante real vería un asistente que no entiende nada.
// El mismo código corre en el navegador y en el servidor local; el modelo
// de lenguaje solo aporta redacción, nunca los datos ni la recomendación.

import { calculateEstimate, recommendHardware } from "./quote-engine.mjs";

// El chat de demostración nunca necesita datos de contacto o credenciales.
// Se bloquean antes de añadir el mensaje al historial o enviarlo al modelo.
const PRIVATE_DATA_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(?<!\d)(?:\+?34[ .-]?)?[6789]\d{2}(?:(?:[ .-]?\d{3}[ .-]?\d{3})|(?:[ .-]?\d{2}){3})(?!\d)/,
  /\b\d{8}[A-HJ-NP-TV-Z]\b/i,
  /\b[XYZ]\d{7}[A-HJ-NP-TV-Z]\b/i,
  /\bES\d{22}\b/i,
  /\b(?:api[_ -]?key|password|contrase(?:ñ|n)a|token)\s*[:=]|\bbearer\s+[A-Z0-9._~-]{12,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk-[A-Z0-9_-]{16,}|gh[pousr]_[A-Z0-9]{20,}|xox[baprs]-[A-Z0-9-]{10,})/i,
];

export function containsPrivateData(value) {
  const text = String(value || "");
  return PRIVATE_DATA_PATTERNS.some((pattern) => pattern.test(text));
}

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

// Extracción auxiliar de hechos literales. Solo rellena campos vacíos con
// vocabulario conocido; no interpreta la respuesta del modelo ni convierte
// cualquier mención de una herramienta/canal en un hecho.
const TOOL_MENTIONS = [
  [/\bgoogle\s+sheets\b/i, "Google Sheets"],
  [/\bhojas? de c[áa]lculo\b/i, "hoja de cálculo"],
  [/\bexcel\b/i, "Excel"],
  [/\bgmail\b/i, "Gmail"],
  [/\boutlook\b/i, "Outlook"],
  [/\bn8n\b/i, "n8n"],
  [/\bzapier\b/i, "Zapier"],
  [/\bmake(?:\.com)?\b/i, "Make"],
  [/\bhubspot\b/i, "HubSpot"],
  [/\bsalesforce\b/i, "Salesforce"],
  [/\bpipedrive\b/i, "Pipedrive"],
  [/\bodoo\b/i, "Odoo"],
  [/\bsage\b/i, "Sage"],
  [/\bnotion\b/i, "Notion"],
  [/\bairtable\b/i, "Airtable"],
  [/\btrello\b/i, "Trello"],
  [/\basana\b/i, "Asana"],
  [/\b(?:un\s+)?CRM\b/i, "CRM"],
  [/\b(?:un\s+)?ERP\b/i, "ERP"],
];

const INBOUND_CONTEXT = /recib|recepci[oó]n|entrada|entran?|llegan?|llega|canal(?:es)?|bandeja|formulario de entrada/i;

function explicitToolMentions(answer) {
  return TOOL_MENTIONS.filter(([pattern]) => pattern.test(answer)).map(([, name]) => name);
}

function explicitChannels(answer) {
  if (!INBOUND_CONTEXT.test(answer)) return [];
  const channels = [];
  if (/gmail|outlook|e-?mail|correo/i.test(answer)) channels.push("correo electrónico");
  if (/whatsapp/i.test(answer)) channels.push("WhatsApp");
  if (/formulario|sitio web|página web|web/i.test(answer)) channels.push("web/formulario");
  if (/tel[eé]fono|llamada/i.test(answer)) channels.push("teléfono");
  if (/instagram|facebook|linkedin|redes sociales/i.test(answer)) channels.push("redes sociales");
  if (/chat/i.test(answer)) channels.push("chat");
  return [...new Set(channels)];
}

function explicitVolume(answer) {
  const match = answer.match(/\b(?:(?:unos?|unas?|aproximadamente|aprox\.?|alrededor de|cerca de)\s*)?\d[\d.,]*\s*(?:correos?|emails?|e-mails?|solicitudes?|mensajes?|leads?|reservas?|citas?|facturas?|casos?|pedidos?)?\s*(?:al\s+d[ií]a|por\s+d[ií]a|diari[oa]s?|a\s+la\s+semana|por\s+semana|semanal(?:es)?|al\s+mes|por\s+mes|mensuales?)\b/i);
  return match ? clampText(match[0], 160) : "";
}

function explicitGoal(answer) {
  const patterns = [
    /\bque\s+no\s+se\s+pierdan?\s+(?:ning[uú]n\w*|nada|ninguno|ninguna)[^.!?;]*/i,
    /\b(?:quiero|queremos|necesito|necesitamos|el objetivo es|la meta es|buscamos)\s+(?:que\s+)?(?:reducir|disminuir|aumentar|incrementar|ahorrar|eliminar|evitar|mejorar|responder|contestar|clasificar)\b[^.!?;]*/i,
    /\b(?:para no perder|evitar perder)\s+(?:ning[uú]n\w*|nada|ninguno|ninguna)[^.!?;]*/i,
  ];
  for (const pattern of patterns) {
    const match = answer.match(pattern);
    if (match) return clampText(match[0], 250);
  }
  return "";
}

function explicitApproval(answer) {
  const sentences = answer.split(/(?<=[.!?;])\s+/);
  return clampText(sentences.find((sentence) =>
    /\b(?:aprobaci[oó]n|aprob(?:ar|aci[oó]n)|autoriza(?:ci[oó]n|r)|revisi[oó]n humana|supervisi[oó]n humana)\b/i.test(sentence)
    || /\b(?:solo|[uú]nicamente)\b[^.!?;]*(?:nunca|no debe|no puede|no enviar|no env[ií]e)\b/i.test(sentence),
  ) || "", 250);
}

function explicitProcess(answer) {
  const sentence = answer.split(/(?<=[.!?;])\s+/).find((part) =>
    /\b(?:entra|entran|llega|llegan|recibimos|reciben)\b[^.!?;]*\b(?:registramos|registran|anotamos|apuntamos|copiamos|guardamos)\b[^.!?;]*\b(?:respondemos|responden|revisamos|revisan|enviamos|env[ií]an)\b/i.test(part),
  );
  return clampText(sentence || "", 500);
}

function mergeExplicitMentions(existing, mentions, { spreadsheetSpecificity = false } = {}) {
  const values = String(existing || "").split(/\s*[,;]\s*/).map((value) => value.trim()).filter(Boolean);
  for (const mention of mentions) {
    if (values.some((value) => explicitToolMentions(value).includes(mention) || value.toLowerCase() === mention.toLowerCase())) continue;
    if (spreadsheetSpecificity && mention === "Google Sheets") {
      const genericIndex = values.findIndex((value) => /^hojas? de c[áa]lculo$/i.test(value));
      if (genericIndex >= 0) values.splice(genericIndex, 1);
    }
    if (spreadsheetSpecificity && mention === "hoja de cálculo" && values.some((value) => explicitToolMentions(value).includes("Google Sheets"))) continue;
    values.push(mention);
  }
  return values.join(", ");
}

function addExplicitFacts(profile, answer) {
  profile.tools = mergeExplicitMentions(profile.tools, explicitToolMentions(answer), { spreadsheetSpecificity: true });
  profile.channels = mergeExplicitMentions(profile.channels, explicitChannels(answer));
  if (!profile.volume) profile.volume = explicitVolume(answer);
  if (!profile.approvals) profile.approvals = explicitApproval(answer);
  if (!profile.goal) profile.goal = explicitGoal(answer);
  if (!profile.process) profile.process = explicitProcess(answer);
}

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

export const isGreeting = (text) => GREETING.test(String(text ?? "").trim());

const lastOf = (messages, role) => [...(messages || [])].reverse().find((message) => message?.role === role)?.content || "";

// No se aceptan campos estructurados del modelo: puede rellenar datos que el
// visitante no ha dicho. El motor deriva el perfil solo del texto del visitante.

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

function initialFreeformFacts(profile, answer) {
  const identity = answer.match(/\b(?:soy|somos|tengo|tenemos|dirijo|gestiono|llevo|trabajo en|estoy montando|montamos|me dedico a|nos dedicamos a)\s+(?:(?:una|un|el|la|mi|nuestro|nuestra)\s+)?([^,;.!?]+?)(?=\s+(?:y|pero|donde|en la que|en el que|porque|ya que)\b|[.;!?]|$)/i);
  const business = clampText(identity?.[1]?.replace(/^(?:una|un|el|la|mi|nuestro|nuestra)\s+/i, ""), 160);
  const sector = deriveSector({ business: answer, problem: "", process: "" });
  const problemMatch = answer.match(/\b(?:perdemos|pierdo|tardamos|se nos va|se me va|nos cuesta|me cuesta|no (?:conseguimos|podemos|llegamos|contestamos|respondemos)|queremos mejorar|quiero mejorar|necesitamos mejorar|necesito mejorar|queremos automatizar|quiero automatizar|necesitamos automatizar|necesito automatizar|me gustaría automatizar|nos gustaría automatizar|tenemos (?:un )?problema(?:s)?|hay un problema|problema con)\b[^.!?;]*/i);

  if (!profile.business) {
    if (business) profile.business = business;
    else if (sector && problemMatch) profile.business = sector;
    else if (!problemMatch) profile.business = clampText(answer, 160);
  }
  if (!profile.sector && sector) profile.sector = sector;
  if (!profile.problem && problemMatch) profile.problem = clampText(problemMatch[0], 300);

  return problemMatch ? "problem" : profile.business ? "business" : "";
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
  const userAnswers = messages.filter((message) => message?.role === "user");
  const firstSubstantiveAnswer = userAnswers.slice(0, -1).every((message) => isGreeting(message?.content));
  let filledField = "";
  if (answer) {
    if (asked) {
      profile[asked] = answer;
      filledField = asked;
    } else if (firstSubstantiveAnswer && !isGreeting(answer)) {
      // En el primer mensaje sustantivo, incluso si antes hubo solo un saludo,
      // interpreta negocio/sector y problema sin atribuir detalles no dichos.
      // No conviertas palabras como “teléfono” o “tiempo” en canal/objetivo:
      // el usuario puede estar describiendo el problema, no respondiendo esos
      // campos, y preguntar luego el sector repetiría algo ya explicado.
      filledField = initialFreeformFacts(profile, answer);
    } else {
      // Mensaje libre: asigna la respuesta completa a un único campo principal
      // y extrae aparte solo los demás hechos explícitos y reconocibles.
      for (const [field, hint] of Object.entries(FIELD_HINTS)) {
        if (!profile[field] && hint.test(answer)) {
          profile[field] = answer;
          filledField = field;
          break;
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
    addExplicitFacts(profile, answer);
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
  process: () => "Ya tengo el proceso actual.",
  tools: (value) => `Tendré en cuenta las herramientas actuales: ${value}.`,
  volume: (value) => `Tomo como referencia este volumen: ${value}.`,
  channels: (value) => `La entrada quedaría conectada desde ${value}.`,
  approvals: (value) => `Mantendremos bajo aprobación humana: ${value}.`,
  goal: (value) => `Usaremos como criterio de éxito: ${value}.`,
};

function clipAtWord(value, max) {
  const text = clampText(value, max + 1);
  if (text.length <= max) return text;
  const prefix = text.slice(0, max - 1);
  const boundary = prefix.lastIndexOf(" ");
  return `${prefix.slice(0, boundary > max * 0.6 ? boundary : max - 1).trimEnd()}…`;
}

function processRecap(profile) {
  const recapValue = (value, max) => clipAtWord(value, max).replace(/[.!?;,\s]+$/, "");
  const facts = [
    profile.tools && `herramientas: ${recapValue(profile.tools, 55)}`,
    profile.channels && `entrada: ${recapValue(profile.channels, 35)}`,
    profile.volume && `volumen: ${recapValue(profile.volume, 30)}`,
    profile.approvals && `control humano: ${recapValue(profile.approvals, 65)}`,
    profile.goal && `objetivo: ${recapValue(profile.goal, 45)}`,
  ].filter(Boolean);
  return facts.length ? `El mapa ya incluye ${facts.join("; ")}.` : "";
}

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
  const recap = filledField === "process" ? processRecap(profile) : "";
  return `${acknowledgement} ${recap} ${RATIONALE[service.slug]}`.replace(/\s+/g, " ").trim();
}

export function hardwareFor(profile, documentCount = 0) {
  // El nivel se deduce del caso, no se fija a mano: un piloto de una persona
  // no necesita el mismo equipo que diez usuarios con datos sensibles, y
  // prometer 64 GB a todo el mundo infla el presupuesto sin motivo.
  const heavy = (profile.sensitivity === "high" && profile.users > 5) || profile.users > 10 || profile.complexity === "advanced";
  const modelSize = heavy ? "xlarge" : profile.users > 3 || profile.sensitivity === "high" ? "medium" : "small";
  return recommendHardware({
    ...profile,
    modelSize,
    concurrency: Math.max(1, Math.min(8, Math.ceil(profile.users / 5))),
    documentCount,
  });
}

export function welcomeCopy(messages, profile = {}) {
  const greeting = isGreeting(lastOf(messages, "user"));
  const hasContext = Boolean(profile.business || profile.problem);
  return greeting
    ? {
        reply: hasContext
          ? "¡Hola! Sigo aquí y conservo el contexto que ya compartiste."
          : "¡Hola! Claro, estoy aquí.",
        nextQuestion: "",
      }
    : {
        reply: "Anotado. Lo incorporo al diagnóstico antes de proponer una arquitectura.",
        nextQuestion: DISCOVERY_QUESTIONS[0].question,
      };
}

// Punto de entrada único. El perfil y el presupuesto salen de respuestas del
// visitante y reglas verificables; el modelo solo puede redactar la respuesta.
export function advise({ messages = [], profile: previousProfile = {}, modelReply = "", documentCount = 0 } = {}) {
  const known = normalizeProfile(previousProfile);
  const greetingOnly = isGreeting(lastOf(messages, "user"));

  if (greetingOnly) {
    const copy = welcomeCopy(messages, known);
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

  // El modelo nunca escribe campos del perfil: solo la respuesta literal del
  // visitante y el motor determinista pueden cambiar alcance o presupuesto.
  const { profile, filledField } = applyLastAnswer(known, messages);
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
    estimate: quoteReady ? calculateEstimate({ ...profile, service: service.slug }) : null,
    hardware: quoteReady && profile.localAi ? hardwareFor(profile, documentCount) : null,
    service,
    filledField,
  };
}
