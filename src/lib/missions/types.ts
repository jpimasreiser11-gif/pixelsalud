export type MissionId = "cold-opportunities" | "repetitive-process" | "private-knowledge";

export type ServiceId = "automation-sprint" | "growth-system" | "private-ai";

export interface MissionOption {
  id: string;
  label: string;
  consequence: string;
  control: string;
}

export interface MissionScenario {
  id: MissionId;
  label: string;
  title: string;
  situation: string;
  disclaimer: string;
  service: ServiceId;
  indicativeRange: string;
  question: string;
  options: MissionOption[];
  currentFlow: string[];
  proposedFlow: string[];
  risks: string[];
}

export interface CustomMissionInput {
  sector: string;
  objective: string;
  tools: string;
  volume: "low" | "medium" | "high";
  sensitivity: "low" | "medium" | "high";
  friction: "manual" | "sales-followup" | "knowledge";
}

export interface MissionResult {
  service: ServiceId;
  indicativeRange: string;
  rationale: string;
  assumptions: string[];
  humanControls: string[];
  currentFlow: string[];
  proposedFlow: string[];
  bindingQuote: false;
}
