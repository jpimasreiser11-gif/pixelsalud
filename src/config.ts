import { launchReady } from "./lib/launch-config.mjs";

// Fuente única de verdad para marca, oferta y canales de contacto.
// Los campos vacíos son deliberados: no se publican identidades o canales inventados.
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Backend de operaciones (n8n local). Mantener desconectado hasta comprobar que
// el túnel llega a n8n y no a otro servicio local: no enviar datos de visitantes
// a un destino sin verificar. La guía estática sigue disponible mientras tanto.
export const BACKEND = {
  enabled: false,
  url: "",
  origin: "https://varinoai.me",
} as const;

export const BACKEND_CHAT = (BACKEND.enabled && BACKEND.url) ? `${BACKEND.url}/webhook/chat` : "";
export const BACKEND_LEAD = (BACKEND.enabled && BACKEND.url) ? `${BACKEND.url}/webhook/lead` : "";
// Analítica propia sin cookies (pageviews anónimos → n8n). Si no hay URL, no se envía nada.
export const BACKEND_EVENT = (BACKEND.enabled && BACKEND.url) ? `${BACKEND.url}/webhook/event` : "";

// Enlaces de pago (Stripe Payment Links / Checkout). Vacío = el botón se muestra como
// "Solicitar alta" y lleva al formulario. Rellenar cuando existan en Stripe.
export const STRIPE_LINKS = {
  care: "",
  managed: "",
  optimize: "",
  privateOps: "",
} as const;

export const SITE = {
  name: "VARINO",
  brandDisplay: "VARINO",
  brandSuffix: "",
  launchReady,
  domainVerified: true,
  trademarkReviewed: false,
  url: "https://varinoai.me",
  tagline: "Inteligencia, puesta a trabajar.",
  commercialMessage: "Del proceso al progreso.",
  outcomePromise: "Menos fricción. Más capacidad.",
  description:
    "Sistemas de automatización e inteligencia artificial para empresas, diseñados con alcance claro, privacidad y control humano.",
  email: "varinoagency@gmail.com",
  whatsapp: "34623204319",
  calendly: "",
  // No incluir datos personales identificativos en el repositorio público
  // durante el prelanzamiento. Completar solo tras aprobación expresa y revisión.
  legalOwner: "",
  legalNif: "",
  legalAddress: "",
} as const;

export const SERVICES = [
  {
    id: "automation-sprint",
    numero: "01",
    name: "Automation Sprint",
    nombre: "Automation Sprint",
    subtitle: "Un proceso crítico, convertido en un sistema fiable.",
    subtitulo: "Un proceso crítico, convertido en un sistema fiable.",
    summary:
      "Mapeamos, construimos y probamos una automatización acotada, con observabilidad, recuperación y transferencia.",
    descripcion:
      "Mapeamos, construimos y probamos una automatización acotada, con observabilidad, recuperación y transferencia.",
    range: "950–1.900 € + IVA",
    precio: "950–1.900 € + IVA",
    scope:
      "1 proceso, 1 flujo de trabajo y 1 integración estándar. Flujos adicionales, sistemas legacy, migración de datos o IA local requieren una propuesta a medida.",
    outcome: "Un proceso crítico automatizado",
    resultado: "Un proceso crítico automatizado",
    deliverables: [
      "Mapa del proceso",
      "Flujo observable",
      "Recuperación manual",
      "Documentación y transferencia",
    ],
    entregables: [
      "Mapa del proceso",
      "Flujo observable",
      "Recuperación manual",
      "Documentación y transferencia",
    ],
    exclusions: ["Licencias de terceros", "Cambios fuera del proceso acordado"],
    examples: ["Clasificar solicitudes", "Preparar documentos", "Actualizar el CRM"],
    ejemplos: ["Clasificar solicitudes", "Preparar documentos", "Actualizar el CRM"],
    tag: "Operaciones",
  },
  {
    id: "growth-system",
    numero: "02",
    name: "Sistema de crecimiento",
    nombre: "Sistema de crecimiento",
    subtitle: "Captación, seguimiento y operaciones conectadas.",
    subtitulo: "Captación, seguimiento y operaciones conectadas.",
    summary:
      "Conectamos la entrada de oportunidades, su cualificación y el trabajo comercial manteniendo las decisiones en manos del equipo.",
    descripcion:
      "Conectamos la entrada de oportunidades, su cualificación y el trabajo comercial manteniendo las decisiones en manos del equipo.",
    range: "2.500–6.000 € + IVA",
    precio: "2.500–6.000 € + IVA",
    scope:
      "1 recorrido de captación y seguimiento, hasta 3 flujos conectados y 4 integraciones estándar. Los mensajes externos quedan sujetos a aprobación humana.",
    outcome: "Captación, seguimiento y operaciones conectadas",
    resultado: "Captación, seguimiento y operaciones conectadas",
    deliverables: [
      "Captura estructurada",
      "Reglas de cualificación",
      "Borradores sujetos a aprobación",
      "Panel de actividad",
    ],
    entregables: [
      "Captura estructurada",
      "Reglas de cualificación",
      "Borradores sujetos a aprobación",
      "Panel de actividad",
    ],
    exclusions: ["Compra de bases de datos", "Envío autónomo sin aprobación"],
    examples: ["Cualificar leads", "Preparar propuestas", "Priorizar seguimientos"],
    ejemplos: ["Cualificar leads", "Preparar propuestas", "Priorizar seguimientos"],
    tag: "Crecimiento",
  },
  {
    id: "private-ai",
    numero: "03",
    name: "IA privada",
    nombre: "IA privada",
    subtitle: "Conocimiento y modelos bajo control.",
    subtitulo: "Conocimiento y modelos bajo control.",
    summary:
      "Diseñamos asistentes, búsqueda documental y flujos locales o privados con permisos, evaluación y trazabilidad.",
    descripcion:
      "Diseñamos asistentes, búsqueda documental y flujos locales o privados con permisos, evaluación y trazabilidad.",
    range: "Desde 5.500 € + IVA",
    precio: "Desde 5.500 € + IVA",
    scope:
      "1 caso de uso y asistente, hasta 3 flujos y 3 integraciones; corpus, permisos y entorno se concretan en el diagnóstico. Hardware, licencias y operación del modelo se cotizan aparte.",
    outcome: "Conocimiento y modelos bajo control",
    resultado: "Conocimiento y modelos bajo control",
    deliverables: [
      "Arquitectura y análisis de datos",
      "Prototipo evaluable",
      "Controles de acceso",
      "Evaluación y documentación",
    ],
    entregables: [
      "Arquitectura y análisis de datos",
      "Prototipo evaluable",
      "Controles de acceso",
      "Evaluación y documentación",
    ],
    exclusions: ["Hardware", "Licencias y consumo no incluidos expresamente"],
    examples: ["Asistente interno", "Buscador documental", "Copiloto privado"],
    ejemplos: ["Asistente interno", "Buscador documental", "Copiloto privado"],
    tag: "IA privada",
  },
] as const;

// Alias temporal para las páginas del prototipo. Se elimina al migrar todas las vistas.
export const SERVICIOS = SERVICES;

// Capacidades técnicas transversales ("Qué montamos"). Son reales y verificables:
// se corresponden con lo que ya se construye en los demos y servicios del sitio.
export const CAPACIDADES = [
  {
    id: "integraciones",
    titulo: "Integraciones",
    desc: "Conectamos las herramientas que ya usas (correo, hojas, CRM, WhatsApp, ERP) para que la información fluya sin copiar a mano.",
    ejemplo: "Pedidos por email → tabla central → tu ERP.",
  },
  {
    id: "agentes-ia",
    titulo: "Agentes y flujos con IA",
    desc: "Asistentes y automatizaciones con IA evaluados, con permisos y aprobación humana en cada paso sensible.",
    ejemplo: "Clasificar solicitudes, redactar borradores, responder dudas frecuentes.",
  },
  {
    id: "migracion",
    titulo: "Migración desde Zapier o Make",
    desc: "Comparamos coste total, mantenimiento y requisitos antes de proponer una migración. Si n8n no compensa para tu caso, recomendamos mantener la herramienta actual.",
    ejemplo: "Evaluación con volumen, integraciones, operación y costes externos acordados.",
  },
  {
    id: "privado",
    titulo: "IA y n8n privados",
    desc: "Diseñamos n8n y modelos locales o privados según el nivel de control requerido. Documentamos qué datos procesa cada componente, los proveedores externos y las responsabilidades operativas.",
    ejemplo: "Arquitectura con flujos de datos, permisos, copias y proveedores identificados.",
  },
  {
    id: "mantenimiento",
    titulo: "Monitorización y mantenimiento",
    desc: "Vigilamos que los flujos sigan funcionando y los mejoramos, con planes opcionales de soporte y ajustes.",
    ejemplo: "Avisos de error, incidencias y mejoras mensuales.",
  },
  {
    id: "documentacion",
    titulo: "Documentación y formación",
    desc: "Entregamos flujos comprensibles y transferibles: manual, recuperación manual y formación a tu equipo.",
    ejemplo: "Que cualquiera del equipo sepa qué hace cada flujo.",
  },
] as const;

export const MAINTENANCE_PLANS = [
  {
    id: "care",
    name: "Care",
    monthly: "149 €/mes + IVA",
    horas: 1,
    sla: "48 h laborables",
    setup: "190 €",
    ideal: "Proyectos sencillos",
    destacado: false,
    includes: [
      "Monitorización básica y avisos",
      "1 hora de ajustes al mes",
      "Informe mensual de actividad",
      "Actualizaciones con pruebas en staging",
    ],
  },
  {
    id: "managed",
    name: "Managed",
    monthly: "349 €/mes + IVA",
    horas: 3,
    sla: "24 h laborables",
    setup: "0 €",
    ideal: "La mayoría de proyectos",
    destacado: true,
    includes: [
      "Todo lo de Care",
      "3 horas de ajustes al mes",
      "Gestión de incidencias y errores",
      "Copia de seguridad verificada",
      "Alta técnica sin coste",
    ],
  },
  {
    id: "optimize",
    name: "Optimize",
    monthly: "690 €/mes + IVA",
    horas: 8,
    sla: "8 h laborables",
    setup: "0 €",
    ideal: "Sistemas que facturan cada mes",
    destacado: false,
    includes: [
      "Todo lo de Managed",
      "8 horas al mes con mejoras incluidas",
      "Revisión de métricas y oportunidades",
      "Prioridad de atención",
    ],
  },
  {
    id: "private-ai-ops",
    name: "Private AI Ops",
    monthly: "Desde 1.190 €/mes + IVA",
    horas: 12,
    sla: "8 h laborables",
    setup: "0 €",
    ideal: "Datos sensibles o IA en local",
    destacado: false,
    includes: [
      "Operación del modelo y capacidad",
      "Evaluación y control de calidad",
      "Seguridad, permisos y trazabilidad",
      "12 horas al mes",
      "Informe técnico mensual",
    ],
  },
] as const;

// Reglas comerciales de las mensualidades (explícitas para que no haya sorpresas).
export const PLAN_RULES = {
  permanencia: "Modalidad mensual sin permanencia. El −15 % requiere un compromiso de 12 meses, documentado en la propuesta.",
  anual: "Prepago anual: 10 cuotas por adelantado (equivale a 2 meses gratis); no acumulable al descuento por compromiso.",
  horasExtra: "Horas extra: 85 €/hora + IVA; bono de 10 horas con −10 %.",
  setup: "Alta técnica: 190 € + IVA en Care; sin coste en Managed, Optimize y Private AI Ops.",
  iva: "Los precios publicados son importes sin IVA; el IVA aplicable y el total se desglosan antes de aceptar.",
  sla: "Atención de 9:00 a 18:00 (Europe/Madrid), en días laborables.",
  slaDefinition:
    "Los tiempos publicados son objetivos de primera respuesta —confirmar la recepción y comunicar el siguiente paso— dentro del horario de atención. No son plazos de resolución ni atención 24/7; el SLA vinculante y sus exclusiones se concretan en la propuesta aceptada.",
} as const;

// Compatibilidad temporal con la página de precios actual.
export const PLANES_PRECIOS = [
  {
    id: SERVICES[0].id,
    nombre: SERVICES[0].name,
    precio: SERVICES[0].range,
    periodo: "por proyecto",
    destacado: false,
    descripcion: SERVICES[0].summary,
    ahorroEstimado: SERVICES[0].outcome,
    caracteristicas: SERVICES[0].deliverables,
  },
  {
    id: SERVICES[1].id,
    nombre: SERVICES[1].name,
    precio: SERVICES[1].range,
    periodo: "por proyecto",
    destacado: true,
    descripcion: SERVICES[1].summary,
    ahorroEstimado: SERVICES[1].outcome,
    caracteristicas: SERVICES[1].deliverables,
  },
  {
    id: SERVICES[2].id,
    nombre: SERVICES[2].name,
    precio: SERVICES[2].range,
    periodo: "por proyecto",
    destacado: false,
    descripcion: SERVICES[2].summary,
    ahorroEstimado: SERVICES[2].outcome,
    caracteristicas: SERVICES[2].deliverables,
  },
] as const;

export const VERTICALES = [
  { nombre: "Servicios profesionales", ejemplos: "asesorías, consultoras, agencias" },
  { nombre: "Comercio", ejemplos: "ecommerce, retail, distribución" },
  { nombre: "Operaciones", ejemplos: "logística, administración, soporte" },
  { nombre: "Equipos de conocimiento", ejemplos: "documentación, formación, compliance" },
] as const;

export const hasContactChannel = Boolean(SITE.email || SITE.whatsapp || SITE.calendly);

export const whatsappUrl = (msg: string): string =>
  SITE.whatsapp
    ? `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(msg)}`
    : "";
