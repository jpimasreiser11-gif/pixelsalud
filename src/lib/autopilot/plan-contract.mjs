import { z } from "zod";

/**
 * Versioned, backend-independent contract for an AI-proposed automation.
 * This module validates plans only: it deliberately contains no executor,
 * credentials, HTTP client, dynamic code, or n8n activation path.
 */

export const PLAN_SCHEMA_VERSION = 1;

export const INTEGRATIONS = Object.freeze([
  "gmail",
  "google_drive",
  "google_calendar",
  "google_sheets",
  "crm",
]);

const IntegrationSchema = z.enum(INTEGRATIONS);
const StepIdSchema = z.string().trim().regex(/^[a-z][a-z0-9-]{1,39}$/);
const InstructionSchema = z.string().trim().min(3).max(400);

const TriggerSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("manual") }),
  z.strictObject({
    kind: z.literal("schedule"),
    frequency: z.enum(["daily", "weekly"]),
    time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    timezone: z.string().trim().min(1).max(80),
  }),
  z.strictObject({
    kind: z.literal("email_received"),
    integration: z.literal("gmail"),
    search: z.string().trim().max(160),
  }),
]);

const StepBase = {
  id: StepIdSchema,
  instruction: InstructionSchema,
};

const StepSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...StepBase, kind: z.literal("summarize") }),
  z.strictObject({
    ...StepBase,
    kind: z.literal("classify"),
    categories: z.array(z.string().trim().min(1).max(50)).min(1).max(12),
  }),
  z.strictObject({
    ...StepBase,
    kind: z.literal("extract"),
    fields: z.array(z.string().trim().regex(/^[a-z][a-z0-9_]{0,39}$/)).min(1).max(12),
  }),
  z.strictObject({
    ...StepBase,
    kind: z.literal("draft_email"),
    integration: z.literal("gmail"),
  }),
  z.strictObject({
    ...StepBase,
    kind: z.literal("create_record"),
    integration: z.enum(["crm", "google_sheets"]),
    recordType: z.enum(["lead", "invoice", "task", "other"]),
  }),
  z.strictObject({
    ...StepBase,
    kind: z.literal("update_record"),
    integration: z.enum(["crm", "google_sheets"]),
    recordType: z.enum(["lead", "invoice", "task", "other"]),
  }),
  z.strictObject({
    ...StepBase,
    kind: z.literal("send_email"),
    integration: z.literal("gmail"),
    recipientMode: z.literal("workspace_contact"),
  }),
]);

export const WorkflowPlanSchema = z.strictObject({
  schemaVersion: z.literal(PLAN_SCHEMA_VERSION),
  name: z.string().trim().min(3).max(80),
  objective: z.string().trim().min(8).max(400),
  trigger: TriggerSchema,
  requiredIntegrations: z.array(IntegrationSchema).max(5),
  steps: z.array(StepSchema).min(1).max(12),
}).superRefine((plan, context) => {
  const integrationSet = new Set(plan.requiredIntegrations);
  if (integrationSet.size !== plan.requiredIntegrations.length) {
    context.addIssue({
      code: "custom",
      path: ["requiredIntegrations"],
      message: "No se pueden repetir integraciones.",
    });
  }

  if (plan.trigger.kind === "schedule") {
    try {
      new Intl.DateTimeFormat("en", { timeZone: plan.trigger.timezone });
    } catch {
      context.addIssue({
        code: "custom",
        path: ["trigger", "timezone"],
        message: "La zona horaria no es válida.",
      });
    }
  }

  const requiredByPlan = new Set();
  if (plan.trigger.kind === "email_received") requiredByPlan.add("gmail");
  for (const step of plan.steps) {
    if (step.integration) requiredByPlan.add(step.integration);
  }
  for (const integration of requiredByPlan) {
    if (!integrationSet.has(integration)) {
      context.addIssue({
        code: "custom",
        path: ["requiredIntegrations"],
        message: `Falta declarar la integración requerida: ${integration}.`,
      });
    }
  }

  const stepIds = plan.steps.map((step) => step.id);
  if (new Set(stepIds).size !== stepIds.length) {
    context.addIssue({
      code: "custom",
      path: ["steps"],
      message: "Cada paso debe tener un identificador único.",
    });
  }
});

const RISK_BY_STEP = Object.freeze({
  summarize: "low",
  classify: "low",
  extract: "low",
  draft_email: "medium",
  create_record: "medium",
  update_record: "medium",
  send_email: "high",
});

const RISK_RANK = Object.freeze({ low: 0, medium: 1, high: 2 });

/**
 * Parse an AI/user proposal and derive its minimum approval policy from the
 * allow-listed action kinds; the proposal itself cannot lower its risk.
 */
export function assessWorkflowPlan(input) {
  const parsed = WorkflowPlanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map(({ path, message }) => ({ path, message })),
    };
  }

  const plan = parsed.data;
  const riskLevel = plan.steps.reduce((highest, step) => (
    RISK_RANK[RISK_BY_STEP[step.kind]] > RISK_RANK[highest]
      ? RISK_BY_STEP[step.kind]
      : highest
  ), "low");

  return {
    ok: true,
    plan,
    riskLevel,
    minimumHumanApproval: riskLevel !== "low",
    autonomy: riskLevel === "low" ? "safe-preview" : riskLevel === "medium" ? "assisted" : "approval-required",
    executable: false,
    reason: "planning-only: no authenticated executor or connected integrations are part of this module",
  };
}
