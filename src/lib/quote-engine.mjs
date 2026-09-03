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
  const complexityFactor = { simple: 0.75, standard: 1, advanced: 1.45 }[input.complexity];
  const riskHours = { low: 2, medium: 7, high: 16 }[input.sensitivity];
  const lineItems = [
    { key: "diagnosis", label: "Diagnóstico CAIO y mapa", hours: 7 + input.workflows * 1.5 },
    { key: "architecture", label: "PRD y arquitectura", hours: 6 + input.integrations * 2.5 + riskHours },
    { key: "automation", label: "Construcción de flujos", hours: input.workflows * 7 * complexityFactor + input.integrations * 3 },
    { key: "ai", label: "IA local, prompts y evaluaciones", hours: input.localAi ? 18 + input.workflows * 2.5 + riskHours : 0 },
    { key: "interface", label: "Interfaz y panel", hours: input.customUi ? 18 * complexityFactor : 4 },
    { key: "migration", label: "Migración y preparación de datos", hours: input.dataMigration ? 12 + input.integrations * 2 : 0 },
    { key: "qa", label: "Pruebas, seguridad y recuperación", hours: 8 + input.workflows * 2.5 + input.integrations * 1.5 + riskHours },
    { key: "adoption", label: "Despliegue, formación y transferencia", hours: 7 + Math.min(input.users, 30) * 0.35 },
  ].filter((item) => item.hours > 0).map((item) => ({ ...item, hours: roundHours(item.hours) }));
  const deliveryHours = lineItems.reduce((total, item) => total + item.hours, 0);
  const coordinationHours = roundHours(deliveryHours * 0.12);
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
