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
      "750–1.500 €",
      "1.800–4.000 €",
      "3.500–12.000 €+",
    ]);
    expect(MAINTENANCE_PLANS.map((plan) => plan.monthly)).toEqual([
      "99 €/mes",
      "249 €/mes",
      "549 €/mes",
      "Desde 990 €/mes",
    ]);
  });
});
