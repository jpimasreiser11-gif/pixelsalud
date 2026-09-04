import { describe, expect, it } from "vitest";
import { calculateEstimate, QUOTE_POLICY, recommendHardware } from "../../src/lib/quote-engine.mjs";

describe("motor de presupuesto", () => {
  it("añade un margen visible y no incluye IVA", () => {
    const estimate = calculateEstimate({ integrations: 2, workflows: 3, users: 8, complexity: "standard" });
    expect(estimate.contingencyHours).toBeGreaterThan(0);
    expect(estimate.quotedHours).toBe(estimate.baseHours + estimate.contingencyHours);
    expect(estimate.range.max).toBeGreaterThan(estimate.range.min);
    expect(QUOTE_POLICY.vatIncluded).toBe(false);
  });

  it("calibra los casos típicos dentro de los rangos publicados en la web", () => {
    // Los rangos de config.ts son el compromiso comercial público
    // (ops/PLAN-0-A-10K.md). Si el motor se descalibra y vuelve a presupuestar
    // 22.000 € a una clínica de tres personas, esta prueba lo detiene.
    const sprint = calculateEstimate({ integrations: 2, workflows: 1, users: 2, complexity: "standard", sensitivity: "medium", localAi: false });
    expect(sprint.range.min).toBeGreaterThanOrEqual(900);
    expect(sprint.range.max).toBeLessThanOrEqual(2400);

    const crecimiento = calculateEstimate({ integrations: 3, workflows: 2, users: 4, complexity: "standard", sensitivity: "high", localAi: false });
    expect(crecimiento.range.min).toBeGreaterThanOrEqual(2500);
    expect(crecimiento.range.max).toBeLessThanOrEqual(4500);

    const iaPrivada = calculateEstimate({ integrations: 5, workflows: 3, users: 3, complexity: "advanced", sensitivity: "high", localAi: true });
    expect(iaPrivada.range.min).toBeGreaterThanOrEqual(4500);
    expect(iaPrivada.range.max).toBeLessThanOrEqual(12000);
  });

  it("incrementa horas cuando aumenta el alcance", () => {
    const small = calculateEstimate({ integrations: 1, workflows: 1, complexity: "simple", localAi: false });
    const advanced = calculateEstimate({ integrations: 7, workflows: 9, complexity: "advanced", localAi: true, customUi: true, dataMigration: true });
    expect(advanced.quotedHours).toBeGreaterThan(small.quotedHours);
    expect(advanced.maintenanceMonthly).toBeGreaterThan(small.maintenanceMonthly);
  });

  it("nombra un modelo local que existe y dimensiona con margen", () => {
    const hardware = recommendHardware({ modelSize: "large", users: 20, concurrency: 3, sensitivity: "high" });
    expect(hardware.model).toBe("qwen3:14b");
    expect(hardware.unifiedMemoryGb).toBeGreaterThanOrEqual(32);
    expect(hardware.unifiedMemoryGb).toBeGreaterThan(hardware.modelWeightsGb);
    expect(hardware.backupStorageGb).toBeGreaterThanOrEqual(hardware.freeStorageGb * 2);
    expect(hardware.headroom).toContain("30%");
    expect(hardware.profile).not.toContain("27B");
  });

  it("sube de nivel cuando la carga lo exige y nunca baja del pedido", () => {
    const piloto = recommendHardware({ modelSize: "small", users: 1, concurrency: 1 });
    const cargado = recommendHardware({ modelSize: "small", users: 80, concurrency: 8 });
    expect(piloto.modelSize).toBe("small");
    expect(cargado.modelSize).toBe("xlarge");
    expect(cargado.unifiedMemoryGb).toBeGreaterThan(piloto.unifiedMemoryGb);
  });
});
