export type PlanRiskLevel = "low" | "medium" | "high";

export type AssessedWorkflowPlan =
  | {
      ok: true;
      plan: Record<string, unknown>;
      riskLevel: PlanRiskLevel;
      minimumHumanApproval: boolean;
      autonomy: "safe-preview" | "assisted" | "approval-required";
      executable: false;
      reason: string;
    }
  | {
      ok: false;
      issues: Array<{ path: Array<string | number>; message: string }>;
    };

export function assessWorkflowPlan(input: unknown): AssessedWorkflowPlan;
