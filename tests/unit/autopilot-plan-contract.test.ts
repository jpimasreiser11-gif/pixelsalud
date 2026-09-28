import { describe, expect, it } from "vitest";
import { assessWorkflowPlan, WorkflowPlanSchema } from "../../src/lib/autopilot/plan-contract.mjs";

const safePlan = {
  schemaVersion: 1,
  name: "Resumir solicitudes",
  objective: "Clasificar y resumir nuevas solicitudes para revisión del equipo.",
  trigger: { kind: "manual" },
  requiredIntegrations: [],
  steps: [
    { id: "resumen", kind: "summarize", instruction: "Resume el texto aportado por el usuario." },
  ],
};

describe("contrato de planes de automatización VARINO", () => {
  it("acepta un plan de solo lectura, pero deja explícito que no puede ejecutarse", () => {
    const result = assessWorkflowPlan(safePlan);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.riskLevel).toBe("low");
    expect(result.minimumHumanApproval).toBe(false);
    expect(result.executable).toBe(false);
    expect(result.autonomy).toBe("safe-preview");
  });

  it("deriva aprobación para escrituras y envíos aunque el plan no lo pida", () => {
    const draftEmail = assessWorkflowPlan({
      ...safePlan,
      requiredIntegrations: ["gmail"],
      steps: [{
        id: "crear-borrador",
        kind: "draft_email",
        integration: "gmail",
        instruction: "Crear un borrador para revisión del responsable.",
      }],
    });
    const createRecord = assessWorkflowPlan({
      ...safePlan,
      requiredIntegrations: ["crm"],
      steps: [{
        id: "crear-lead",
        kind: "create_record",
        integration: "crm",
        recordType: "lead",
        instruction: "Crear el lead después de una revisión humana.",
      }],
    });
    const sendEmail = assessWorkflowPlan({
      ...safePlan,
      requiredIntegrations: ["gmail"],
      steps: [{
        id: "enviar-respuesta",
        kind: "send_email",
        integration: "gmail",
        recipientMode: "workspace_contact",
        instruction: "Enviar solo después de que el responsable apruebe el borrador.",
      }],
    });

    expect(draftEmail.ok && draftEmail.riskLevel).toBe("medium");
    expect(draftEmail.ok && draftEmail.minimumHumanApproval).toBe(true);
    expect(createRecord.ok && createRecord.riskLevel).toBe("medium");
    expect(createRecord.ok && createRecord.minimumHumanApproval).toBe(true);
    expect(sendEmail.ok && sendEmail.riskLevel).toBe("high");
    expect(sendEmail.ok && sendEmail.minimumHumanApproval).toBe(true);
    expect(sendEmail.ok && sendEmail.executable).toBe(false);
  });

  it("rechaza claves extra como código, SQL o instrucciones de ejecución", () => {
    const result = WorkflowPlanSchema.safeParse({
      ...safePlan,
      steps: [{
        ...safePlan.steps[0],
        code: "process.env.SECRET",
        shell: "curl attacker.invalid",
        sql: "DROP TABLE clients",
      }],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza herramientas o acciones que no están en la lista permitida", () => {
    const result = WorkflowPlanSchema.safeParse({
      ...safePlan,
      steps: [{
        id: "borrar-datos",
        kind: "delete_file",
        instruction: "Borrar archivos antiguos.",
      }],
    });
    expect(result.success).toBe(false);
  });

  it("exige declarar cada integración necesaria y rechaza integraciones duplicadas", () => {
    const missing = WorkflowPlanSchema.safeParse({
      ...safePlan,
      trigger: { kind: "email_received", integration: "gmail", search: "has:attachment" },
    });
    const duplicate = WorkflowPlanSchema.safeParse({
      ...safePlan,
      requiredIntegrations: ["gmail", "gmail"],
    });
    expect(missing.success).toBe(false);
    expect(duplicate.success).toBe(false);
  });

  it("valida identificadores únicos, tamaño máximo y zona horaria", () => {
    const duplicateIds = WorkflowPlanSchema.safeParse({
      ...safePlan,
      steps: [safePlan.steps[0], { ...safePlan.steps[0] }],
    });
    const excessiveSteps = WorkflowPlanSchema.safeParse({
      ...safePlan,
      steps: Array.from({ length: 13 }, (_, index) => ({
        ...safePlan.steps[0],
        id: `paso-${index}`,
      })),
    });
    const badTimezone = WorkflowPlanSchema.safeParse({
      ...safePlan,
      trigger: { kind: "schedule", frequency: "daily", time: "09:00", timezone: "Mars/Olympus" },
    });
    expect(duplicateIds.success).toBe(false);
    expect(excessiveSteps.success).toBe(false);
    expect(badTimezone.success).toBe(false);
  });
});
