import { describe, expect, it } from "vitest";

import { BACKEND, BACKEND_CHAT, BACKEND_EVENT, BACKEND_LEAD, MAINTENANCE_PLANS, SERVICES, SITE } from "../../src/config";

describe("VARINO configuration", () => {
  it("keeps launch indexing gated while legal and brand reviews remain incomplete", () => {
    expect(SITE.name).toBe("VARINO");
    expect(SITE.tagline).toBe("Inteligencia, puesta a trabajar.");
    // La presencia de datos del titular no sustituye las revisiones legal,
    // de seguridad y de marca necesarias para habilitar la indexación.
    expect(SITE.legalOwner).toBe("Joan Pimas Reiser");
    expect(SITE.legalNif).toBe("20569591Q");
    expect(SITE.email).toBe("varinoagency@gmail.com");
    expect(SITE.whatsapp).toBe("34623204319");
    expect(SITE.url).toBe("https://varinoai.me");
    expect(SITE.domainVerified).toBe(true);
    expect(SITE.launchReady).toBe(false);
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

  it("does not send visitor data to an unverified public tunnel", () => {
    expect(BACKEND.enabled).toBe(false);
    expect(BACKEND.url).toBe("");
    expect(BACKEND_CHAT).toBe("");
    expect(BACKEND_LEAD).toBe("");
    expect(BACKEND_EVENT).toBe("");
  });
});
