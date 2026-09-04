// Fuente única de verdad para marca, oferta y canales de contacto.
// Los campos vacíos son deliberados: no se publican identidades o canales inventados.
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export const SITE = {
  name: "VARINO",
  brandDisplay: "VARINO",
  brandSuffix: "",
  launchReady: false,
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
  legalOwner: "Joan Pimas Reiser",
  legalNif: "20569591Q",
  legalAddress: "Passeig de la Rectoria Vella, 08460 Barcelona, España",
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
    range: "950–1.500 €",
    precio: "950–1.500 €",
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
    range: "2.500–4.500 €",
    precio: "2.500–4.500 €",
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
    range: "4.500–12.000 €+",
    precio: "4.500–12.000 €+",
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

export const MAINTENANCE_PLANS = [
  {
    id: "care",
    name: "Care",
    monthly: "149 €/mes",
    includes: ["Supervisión básica", "Actualizaciones menores", "Informe mensual"],
  },
  {
    id: "managed",
    name: "Managed",
    monthly: "349 €/mes",
    includes: ["Monitorización", "Gestión de incidencias", "Ajustes mensuales"],
  },
  {
    id: "optimize",
    name: "Optimize",
    monthly: "690 €/mes",
    includes: ["Todo Managed", "Mejoras continuas", "Revisión de métricas"],
  },
  {
    id: "private-ai-ops",
    name: "Private AI Ops",
    monthly: "Desde 1.190 €/mes",
    includes: ["Operación del modelo", "Evaluación", "Seguridad y capacidad"],
  },
] as const;

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
