import { describe, expect, it } from "vitest";

import { MAINTENANCE_PLANS, SERVICES, SITE } from "../../src/config";

describe("VARINO configuration", () => {
  it("uses the approved identity but remains unlaunchable", () => {
    expect(SITE.name).toBe("VARINO");
    expect(SITE.tagline).toBe("Inteligencia, puesta a trabajar.");
    expect(SITE.launchReady).toBe(false);
    expect(SITE.legalOwner).toBe("");
  });

  it("publishes the approved offer ranges", () => {
    expect(SERVICES.map((service) => service.range)).toEqual([
      "950–1.500 €",
      "2.500–4.500 €",
      "4.500–12.000 €+",
    ]);
    expect(MAINTENANCE_PLANS.map((plan) => plan.monthly)).toEqual([
      "149 €/mes",
      "349 €/mes",
      "690 €/mes",
      "Desde 1.190 €/mes",
    ]);
  });
});
