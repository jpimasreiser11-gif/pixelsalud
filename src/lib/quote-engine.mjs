const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || min));
const roundHours = (value) => Math.ceil(value * 2) / 2;
const roundMoney = (value) => Math.ceil(value / 50) * 50;

export const QUOTE_POLICY = Object.freeze({
  currency: "EUR",
  vatIncluded: false,
  hourlyRate: 78,
  contingencyRate: 0.2,
  validityDays: 15,
});

export function calculateEstimate(raw = {}) {
  const input = {
    integrations: clamp(raw.integrations, 1, 12),
    workflows: clamp(raw.workflows, 1, 20),
    users: clamp(raw.users, 1, 250),
    complexity: ["simple", "standard", "advanced"].includes(raw.complexity) ? raw.complexity : "standard",
    sensitivity: ["low", "medium", "high"].includes(raw.sensitivity) ? raw.sensitivity : "medium",
    localAi: raw.localAi !== false,
    customUi: Boolean(raw.customUi),
    dataMigration: Boolean(raw.dataMigration),
  };
  // Calibrado contra los rangos comerciales publicados en config.ts y el plan
  // de negocio (ops/PLAN-0-A-10K.md): un sprint típico ronda los 1.200–1.900 €,
  // un sistema de crecimiento los 3.000–4.000 € y una IA privada queda dentro
  // de 4.500–12.000 €. Antes cada línea tenía mínimos que producían 5.000 €
  // para el caso más pequeño y 22.000 € para una clínica de tres personas: la
  // web decía una cosa y la guía presupuestaba otra delante del visitante.
  const complexityFactor = { simple: 0.8, standard: 1, advanced: 1.4 }[input.complexity];
  // Las horas de riesgo por datos sensibles se cobran una sola vez, en
  // pruebas y seguridad: antes se triplicaban repartidas por el proyecto.
  const riskHours = { low: 1, medium: 2, high: 8 }[input.sensitivity];
  const lineItems = [
    { key: "diagnosis", label: "Diagnóstico CAIO y mapa", hours: 1 + input.workflows * 0.5 },
    { key: "architecture", label: "PRD y arquitectura", hours: 1 + input.integrations },
    { key: "automation", label: "Construcción de flujos", hours: input.workflows * 3 * complexityFactor + input.integrations * 1.5 },
    { key: "ai", label: "IA local, prompts y evaluaciones", hours: input.localAi ? 5 + input.workflows * 1.5 : 0 },
    { key: "interface", label: "Interfaz y panel", hours: input.customUi ? 8 * complexityFactor : 0 },
    { key: "migration", label: "Migración y preparación de datos", hours: input.dataMigration ? 6 + input.integrations * 1.5 : 0 },
    { key: "qa", label: "Pruebas, seguridad y recuperación", hours: 1.5 + input.workflows * 1.25 + input.integrations * 0.75 + riskHours },
    { key: "adoption", label: "Despliegue, formación y transferencia", hours: 1 + Math.min(input.users, 20) * 0.15 },
  ].filter((item) => item.hours > 0).map((item) => ({ ...item, hours: roundHours(item.hours) }));
  const deliveryHours = lineItems.reduce((total, item) => total + item.hours, 0);
  const coordinationHours = roundHours(deliveryHours * 0.1);
  lineItems.push({ key: "coordination", label: "Dirección y control de alcance", hours: coordinationHours });
  const baseHours = roundHours(deliveryHours + coordinationHours);
  const contingencyHours = roundHours(baseHours * QUOTE_POLICY.contingencyRate);
  const quotedHours = baseHours + contingencyHours;
  const price = roundMoney(quotedHours * QUOTE_POLICY.hourlyRate);
  const range = { min: roundMoney(price * 0.9), max: roundMoney(price * 1.15) };
  const maintenanceHours = Math.max(4, Math.ceil((input.workflows * 1.25 + input.integrations + riskHours / 3) / 2) * 2);
  const maintenanceMonthly = roundMoney(maintenanceHours * QUOTE_POLICY.hourlyRate);
  return { input, lineItems, baseHours, contingencyHours, quotedHours, range, maintenanceHours, maintenanceMonthly, policy: QUOTE_POLICY };
}
// Perfiles de hardware para IA privada.
//
// Los modelos y sus pesos están verificados contra el registro público de
// Ollama (septiembre 2026). No se nombra "Qwen 27B": ese tamaño no existe en
// la familia Qwen 3 y prometerlo en un presupuesto es un error de cara al
// cliente. La memoria se calcula sobre el peso real del modelo dejando margen
// para contexto, sistema operativo y el resto del sistema.
export const MODEL_TIERS = Object.freeze({
  small: { model: "qwen3:4b", weightsGb: 2.6, memoryGb: 16, storageGb: 80, label: "Piloto local (Qwen3 4B)" },
  medium: { model: "qwen3:8b", weightsGb: 5.2, memoryGb: 24, storageGb: 120, label: "Equipo pequeño (Qwen3 8B)" },
  large: { model: "qwen3:14b", weightsGb: 9.3, memoryGb: 32, storageGb: 180, label: "Producción (Qwen3 14B)" },
  xlarge: { model: "qwen3:32b", weightsGb: 20.2, memoryGb: 64, storageGb: 300, label: "Alta exigencia (Qwen3 32B)" },
});

const TIER_ALIASES = { small: "small", "4b": "small", "8b": "medium", medium: "medium", "14b": "large", large: "large", "32b": "xlarge", xlarge: "xlarge" };

export function recommendHardware(raw = {}) {
  const users = clamp(raw.users, 1, 250);
  const concurrency = clamp(raw.concurrency, 1, 32);
  const documentCount = clamp(raw.documentCount, 0, 1000000);
  const sensitive = raw.sensitivity === "high";

  const requested = TIER_ALIASES[raw.modelSize] || "medium";
  // La concurrencia y el número de usuarios pueden exigir un nivel superior al
  // pedido: se sube, nunca se baja, para no quedarse corto en producción.
  const order = ["small", "medium", "large", "xlarge"];
  const byLoad = concurrency > 6 || users > 60 ? "xlarge" : concurrency > 2 || users > 15 ? "large" : requested;
  const tierKey = order[Math.max(order.indexOf(requested), order.indexOf(byLoad))];
  const tier = MODEL_TIERS[tierKey];

  // Cada petición concurrente añade contexto en memoria; se redondea al alza
  // y se contrasta con el mínimo del perfil.
  const concurrencyMemory = Math.ceil(tier.weightsGb + tier.weightsGb * 0.35 * concurrency + 8);
  const unifiedMemoryGb = Math.max(tier.memoryGb, concurrencyMemory);
  const freeStorageGb = tier.storageGb + Math.ceil(documentCount / 10000) * 20;

  return {
    profile: tier.label,
    model: tier.model,
    modelSize: tierKey,
    modelWeightsGb: tier.weightsGb,
    unifiedMemoryGb,
    freeStorageGb,
    backupStorageGb: Math.max(250, freeStorageGb * 2),
    concurrency,
    headroom: "30% de memoria y almacenamiento libres tras una prueba de carga",
    deployment: sensitive ? "Servidor dedicado o equipo local aislado" : "Equipo local dedicado o servidor privado",
    notes: [
      "n8n y base de datos separados del puesto de trabajo",
      "copia cifrada y restauración probada",
      `medir tokens por segundo y memoria con ${tier.model} antes de comprar hardware`,
    ],
  };
}
