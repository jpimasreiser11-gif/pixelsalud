import { describe, expect, it } from "vitest";

import { MAINTENANCE_PLANS, SERVICES, SITE } from "../../src/config";

describe("VARINO configuration", () => {
  it("retains the published identity and keeps brand approval separate from indexing", () => {
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
    expect(SITE.launchReady).toBe(true);
    expect(SITE.trademarkReviewed).toBe(false);
  });

  it("publishes the approved offer ranges", () => {
    expect(SERVICES.map((service) => service.range)).toEqual([
      "950–1.900 €",
      "2.500–6.000 €",
      "Desde 5.500 €",
    ]);
    expect(MAINTENANCE_PLANS.map((plan) => plan.monthly)).toEqual([
      "149 €/mes",
      "349 €/mes",
      "690 €/mes",
      "Desde 1.190 €/mes",
    ]);
  });
});
