import { createHash } from "node:crypto";

const catalog = {
  clinica: {
    id: "varino-demo-clinic-v1",
    codeSha256: "6639c8368160be66f9414acb93aa28f81e5271fad498aadab1a40851d5bfca9b",
    fields: ["requestId", "channel", "message"],
    labels: ["ID de prueba", "Canal ficticio", "Solicitud de ejemplo"],
    names: ["Solicitud sintética", "Validar y minimizar", "PARAR - revisión de recepción"],
    details: [
      "Parte de una solicitud general ficticia, sin nombres, teléfonos ni datos clínicos.",
      "Valida identificador, canal y mensaje; conserva los campos mínimos y asigna la categoría solicitud de cita. No consulta una IA.",
      "Marca la revisión obligatoria. Recepción debe confirmar o rechazar; este ejemplo no reserva una cita.",
    ],
  },
  crecimiento: {
    id: "varino-demo-leads-v1",
    codeSha256: "7385942ecdaf69efcdb2c3b7704a1bb3c3e6fb2ad3f3c547d88a663950a60192",
    fields: ["leadId", "need", "teamSize"],
    labels: ["ID de prueba", "Necesidad ficticia", "Tamaño de equipo del ejemplo"],
    names: ["Oportunidad sintética", "Validar y priorizar", "PARAR - revisión comercial"],
    details: [
      "Usa una necesidad y un tamaño de equipo ficticios, sin contacto de una persona real.",
      "Valida el formato y aplica reglas explícitas sobre la necesidad para proponer una prioridad. No puntúa personas ni consulta una IA.",
      "Deja pendiente la revisión comercial antes de contactar. El ejemplo no genera una propuesta ni envía correo.",
    ],
  },
  operaciones: {
    id: "varino-demo-operations-v1",
    codeSha256: "6ee14ebc4aa04abc3ccc63da982518cdf872783c4383f2c0adda7b3b81f3edbe",
    fields: ["caseId", "source", "subject"],
    labels: ["ID de prueba", "Origen ficticio", "Asunto de ejemplo"],
    names: ["Caso sintético", "Validar y enrutar", "PARAR - responsable del proceso"],
    details: [
      "Parte de un caso de pedido ficticio: no lee tu bandeja de correo ni conecta con una empresa.",
      "Valida identificador, origen y asunto. Una regla enruta pedidos, facturas o entregas a operaciones; otros asuntos van a revisión general.",
      "El responsable aprueba o devuelve el caso a la cola manual. Ningún sistema externo se modifica.",
    ],
  },
} as const;

export type PublicDemoKey = keyof typeof catalog;

/** Build-time metadata, not an interpreter for the Code nodes. */
export function describePublicDemo(workflow: any, key: PublicDemoKey) {
  const definition = catalog[key];
  const types = ["n8n-nodes-base.manualTrigger", "n8n-nodes-base.set", "n8n-nodes-base.code", "n8n-nodes-base.set"];
  if (!definition || workflow?.id !== definition.id || workflow.active !== false || workflow.credentials !== undefined || !Array.isArray(workflow.nodes) || workflow.nodes.length !== 4) {
    throw new Error(`Demo pública incompatible: ${key}`);
  }
  const names = ["Prueba manual", ...definition.names];
  const nodes = workflow.nodes;
  const code = nodes[2].parameters?.jsCode;
  if (typeof code !== "string" || createHash("sha256").update(code).digest("hex") !== definition.codeSha256) {
    throw new Error(`Código sin revisar en ${key}`);
  }
  if (typeof workflow.description !== "string" || !workflow.description.trim() || workflow.settings?.saveManualExecutions !== false || workflow.settings?.saveDataSuccessExecution !== "none" || workflow.settings?.saveDataErrorExecution !== "none" || workflow.settings?.saveExecutionProgress !== false || workflow.settings?.executionTimeout !== 60) {
    throw new Error(`Documentación o retención incompatible en ${key}`);
  }
  if (new Set(nodes.map((node: any) => node.id)).size !== nodes.length) throw new Error("IDs duplicados en demo");
  nodes.forEach((node: any, index: number) => {
    if (node.name !== names[index] || node.type !== types[index] || node.credentials !== undefined || node.disabled || typeof node.notes !== "string" || !node.notes.trim() || node.notesInFlow !== true) throw new Error(`Nodo incompatible en ${key}`);
    const expected = index === nodes.length - 1 ? undefined : { main: [[{ node: names[index + 1], type: "main", index: 0 }]] };
    if (JSON.stringify(workflow.connections?.[node.name]) !== JSON.stringify(expected)) throw new Error(`Recorrido incompatible en ${key}`);
  });
  if (Object.keys(workflow.connections ?? {}).length !== 3) throw new Error("Conexiones adicionales en demo");
  const assignments = nodes[1].parameters?.assignments?.assignments;
  if (!Array.isArray(assignments) || assignments.length !== definition.fields.length) throw new Error("Entrada sintética incompatible");
  const sample = definition.fields.map((field, index) => {
    const assignment = assignments.find((item: any) => item.name === field);
    if (!assignment || !["string", "number"].includes(typeof assignment.value)) throw new Error(`Entrada ausente: ${field}`);
    return { label: definition.labels[index], value: assignment.value as string | number };
  });
  if (!String(sample[0].value).startsWith("demo-")) throw new Error("Se requiere un identificador ficticio");
  return {
    sample,
    steps: definition.names.map((name, index) => ({ name, detail: definition.details[index] })),
  };
}
