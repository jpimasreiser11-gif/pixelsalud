import type { CustomMissionInput, MissionResult, ServiceId } from "./types";

const ranges: Record<ServiceId, string> = {
  "automation-sprint": "750–1.500 €",
  "growth-system": "1.800–4.000 €",
  "private-ai": "3.500–12.000 €+",
};

export function evaluateCustomMission(input: CustomMissionInput): MissionResult {
  const service: ServiceId = input.sensitivity === "high" || input.friction === "knowledge"
    ? "private-ai"
    : input.friction === "sales-followup"
      ? "growth-system"
      : "automation-sprint";

  return {
    service,
    indicativeRange: ranges[service],
    rationale: service === "private-ai"
      ? "La sensibilidad o el uso de conocimiento requiere evaluar permisos, despliegue y fuentes antes de automatizar."
      : service === "growth-system"
        ? "El bloqueo está en la captura y continuidad comercial, con decisiones que deben seguir bajo control humano."
        : "El caso parece acotable a un proceso operativo con reglas, excepciones y recuperación definidas.",
    assumptions: [
      `Volumen declarado: ${input.volume}`,
      `Sensibilidad declarada: ${input.sensitivity}`,
      `Herramientas indicadas: ${input.tools || "pendientes de confirmar"}`,
    ],
    humanControls: ["Revisión del alcance", "Aprobación antes de acciones externas", "Recuperación manual documentada"],
    currentFlow: ["Entrada", "Trabajo manual", "Decisión dispersa", "Resultado"],
    proposedFlow: ["Entrada validada", "Preparación automática", "Revisión humana", "Resultado trazable"],
    bindingQuote: false,
  };
}
