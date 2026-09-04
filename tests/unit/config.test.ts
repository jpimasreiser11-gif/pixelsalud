import { describe, expect, it } from "vitest";

import { MAINTENANCE_PLANS, SERVICES, SITE } from "../../src/config";

describe("VARINO configuration", () => {
  it("uses the approved identity with real owner data but remains unlaunchable", () => {
    expect(SITE.name).toBe("VARINO");
    expect(SITE.tagline).toBe("Inteligencia, puesta a trabajar.");
    // Datos legales del titular: publicables en el aviso legal, pero no
    // bastan para lanzar: faltan revisión de marca y aprobaciones.
    expect(SITE.legalOwner).toBe("Joan Pimas Reiser");
    expect(SITE.legalNif).toBe("20569591Q");
    expect(SITE.email).toBe("varinoagency@gmail.com");
    expect(SITE.whatsapp).toBe("34623204319");
    expect(SITE.url).toBe("https://varinoai.me");
    expect(SITE.domainVerified).toBe(true);
    expect(SITE.launchReady).toBe(false);
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
