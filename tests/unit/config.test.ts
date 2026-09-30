import { describe, expect, it } from "vitest";

import { BACKEND, BACKEND_CHAT, BACKEND_EVENT, BACKEND_LEAD, MAINTENANCE_PLANS, SERVICES, SITE } from "../../src/config";

describe("VARINO configuration", () => {
  it("keeps launch indexing gated while legal and brand reviews remain incomplete", () => {
    expect(SITE.name).toBe("VARINO");
    expect(SITE.tagline).toBe("Inteligencia, puesta a trabajar.");
    // Los datos legales identificativos se mantienen fuera del repositorio
    // público durante el prelanzamiento.
    expect(SITE.legalOwner).toBe("");
    expect(SITE.legalNif).toBe("");
    expect(SITE.legalAddress).toBe("");
    expect(SITE.email).toBe("varinoagency@gmail.com");
    expect(SITE.whatsapp).toBe("34623204319");
    expect(SITE.url).toBe("https://varinoai.me");
    expect(SITE.domainVerified).toBe(true);
    expect(SITE.launchReady).toBe(false);
    expect(SITE.trademarkReviewed).toBe(false);
  });

  it("publishes the approved offer ranges", () => {
    expect(SERVICES.map((service) => service.range)).toEqual([
      "950–1.900 € + IVA",
      "2.500–6.000 € + IVA",
      "Desde 5.500 € + IVA",
    ]);
    expect(MAINTENANCE_PLANS.map((plan) => plan.monthly)).toEqual([
      "149 €/mes + IVA",
      "349 €/mes + IVA",
      "690 €/mes + IVA",
      "Desde 1.190 €/mes + IVA",
    ]);
    expect(SERVICES.map((service) => service.scope)).toEqual([
      expect.stringContaining("1 proceso, 1 flujo de trabajo y 1 integración estándar"),
      expect.stringContaining("hasta 3 flujos conectados y 4 integraciones estándar"),
      expect.stringContaining("1 caso de uso y asistente, hasta 3 flujos y 3 integraciones"),
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
