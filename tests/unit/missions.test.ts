import { describe, expect, it } from "vitest";
import { evaluateCustomMission } from "../../src/lib/missions/evaluate";
import { MISSION_SCENARIOS } from "../../src/lib/missions/scenarios";

describe("VARINO interactive missions", () => {
  it("provides three truthful guided scenarios", () => {
    expect(MISSION_SCENARIOS).toHaveLength(3);
    for (const scenario of MISSION_SCENARIOS) {
      expect(scenario.disclaimer.toLowerCase()).toContain("demostrativo");
      expect(scenario.options.every((option) => option.control.length > 0)).toBe(true);
      expect(scenario.indicativeRange).toMatch(/€/);
    }
  });

  it("routes sensitive knowledge to private AI without quoting contractually", () => {
    const result = evaluateCustomMission({ sector: "legal", objective: "buscar", tools: "Drive", volume: "medium", sensitivity: "high", friction: "knowledge" });
    expect(result.service).toBe("private-ai");
    expect(result.bindingQuote).toBe(false);
    expect(result.humanControls.length).toBeGreaterThan(0);
  });

  it("routes a bounded manual process to the automation sprint", () => {
    const result = evaluateCustomMission({ sector: "consultoría", objective: "ordenar", tools: "Email", volume: "low", sensitivity: "low", friction: "manual" });
    expect(result.service).toBe("automation-sprint");
  });
});
