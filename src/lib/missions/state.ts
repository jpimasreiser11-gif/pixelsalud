import type { CustomMissionInput, MissionId } from "./types";

export const MISSION_DRAFT_KEY = "varino_mission_draft_v1";

export interface MissionDraft {
  mode: "guided" | "custom";
  scenario?: MissionId;
  decision?: string;
  custom?: Partial<CustomMissionInput>;
  updatedAt: string;
}

export function sanitizeMissionDraft(value: unknown): MissionDraft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<MissionDraft>;
  if (draft.mode !== "guided" && draft.mode !== "custom") return null;
  return {
    mode: draft.mode,
    scenario: draft.scenario,
    decision: typeof draft.decision === "string" ? draft.decision.slice(0, 80) : undefined,
    custom: draft.custom,
    updatedAt: typeof draft.updatedAt === "string" ? draft.updatedAt : new Date(0).toISOString(),
  };
}
