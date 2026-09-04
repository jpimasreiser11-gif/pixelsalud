import { describe, expect, it } from "vitest";
import { advise, applyLastAnswer, cleanReply, consultativeReply, mergeProfile, nextUsefulQuestion, normalizeProfile, recommendService } from "../../src/lib/guide-engine.mjs";

describe("motor de VARINO Guide", () => {
  it("conserva respuestas anteriores aunque el modelo devuelva campos vacíos", () => {
    const profile = mergeProfile({ business: "Clínica Norte", problem: "Citas manuales" }, { business: "", problem: "no" });
    expect(profile.business).toBe("Clínica Norte");
    expect(profile.problem).toBe("Citas manuales");
  });

  it("asigna la respuesta al campo que pedía la última pregunta", () => {
    const { profile, filledField } = applyLastAnswer(normalizeProfile({ business: "Clínica", problem: "Citas" }), [
      { role: "assistant", content: "¿Cómo realizáis ahora ese proceso, desde que empieza hasta que termina?" },
      { role: "user", content: "Llegan por teléfono y WhatsApp y lo apuntamos manualmente en Excel" },
    ]);
    expect(filledField).toBe("process");
    expect(profile.process).toContain("WhatsApp");
    expect(profile.sensitivity).toBe("high");
    expect(nextUsefulQuestion(profile)).toMatch(/herramientas|canales|volumen/i);
  });

  it("elimina la pregunta que el modelo mete dentro de la respuesta", () => {
    expect(cleanReply("Entendido. ¿Qué herramienta utilizáis?")).toBe("Entendido.");
  });

  it("descarta una respuesta genérica del modelo y reconoce el dato concreto", () => {
    const profile = normalizeProfile({
      business: "clínica dental",
      problem: "gestión manual de citas",
      process: "recepción copia solicitudes a Excel",
      volume: "500 solicitudes al mes",
      sensitivity: "high",
    });
    const reply = consultativeReply({
      profile,
      filledField: "volume",
      modelReply: "VARINO podría ayudar con esta tarea. Una propuesta inicial sería un Sistema de crecimiento.",
      service: recommendService(profile),
    });
    expect(reply).toContain("500 solicitudes al mes");
    expect(reply).toContain("IA privada");
    expect(reply).not.toContain("Sistema de crecimiento");
  });

  it("responde al saludo sin inventar presupuesto", () => {
    const result = advise({ messages: [{ role: "user", content: "hola" }] });
    expect(result.stage).toBe("welcome");
    expect(result.estimate).toBeNull();
    expect(result.nextQuestion).toMatch(/a qué se dedica/i);
  });

  it("produce presupuesto y hardware coherentes sin modelo de lenguaje", () => {
    const result = advise({
      messages: [
        { role: "user", content: "Somos una asesoría fiscal" },
        { role: "assistant", content: "¿Qué tarea, problema o cuello de botella quieres mejorar primero?" },
        { role: "user", content: "Perdemos horas preparando presupuestos para clientes potenciales" },
        { role: "assistant", content: "¿Cómo realizáis ahora ese proceso, desde que empieza hasta que termina?" },
        { role: "user", content: "Un compañero copia los datos del correo a una hoja de cálculo y responde a mano" },
      ],
      profile: { business: "asesoría fiscal", problem: "preparar presupuestos para clientes potenciales" },
    });
    expect(result.service.slug).toBe("sistema-crecimiento");
    expect(result.estimate.quotedHours).toBeGreaterThan(0);
    expect(result.estimate.range.max).toBeGreaterThan(result.estimate.range.min);
    // Un sistema de crecimiento no despliega modelo local: presupuestarle
    // hardware era inflar la oferta con equipo que la solución no usa.
    expect(result.hardware).toBeNull();
    expect(result.reply).not.toContain("¿");
  });

  it("recomienda modelo y hardware solo cuando el servicio es IA privada", () => {
    const result = advise({
      messages: [
        { role: "user", content: "Somos una clínica dental" },
        { role: "assistant", content: "¿Qué tarea, problema o cuello de botella quieres mejorar primero?" },
        { role: "user", content: "Perdemos citas y los datos de pacientes son sensibles" },
        { role: "assistant", content: "¿Cómo realizáis ahora ese proceso, desde que empieza hasta que termina?" },
        { role: "user", content: "Recepción apunta las solicitudes en un Excel y confirma por teléfono" },
      ],
      profile: { business: "Somos una clínica dental", problem: "Perdemos citas y los datos de pacientes son sensibles" },
    });
    expect(result.service.slug).toBe("ia-privada");
    expect(result.profile.localAi).toBe(true);
    expect(result.hardware.model).toMatch(/^qwen3:/);
    // Un caso pequeño no debe pedir un equipo de 64 GB, pero sí memoria
    // suficiente para el modelo y su contexto.
    expect(result.hardware.unifiedMemoryGb).toBeGreaterThan(result.hardware.modelWeightsGb * 2);
  });

  it("no vuelve a preguntar por un campo ya contestado", () => {
    const first = advise({ messages: [{ role: "user", content: "Tenemos un taller mecánico" }] });
    const second = advise({
      messages: [
        { role: "user", content: "Tenemos un taller mecánico" },
        { role: "assistant", content: first.nextQuestion },
        { role: "user", content: "Las citas de revisión se pierden entre llamadas" },
      ],
      profile: first.profile,
    });
    expect(second.nextQuestion).not.toBe(first.nextQuestion);
    expect(second.profile.business).toContain("taller");
  });
});
