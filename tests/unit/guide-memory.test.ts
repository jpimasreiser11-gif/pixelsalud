import { describe, expect, it } from "vitest";
import { advise, applyLastAnswer, cleanReply, consultativeReply, nextUsefulQuestion, normalizeProfile, recommendService } from "../../src/lib/guide-engine.mjs";

describe("motor de VARINO Guide", () => {
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

  it("responde al saludo sin repetir la pregunta inicial ni inventar presupuesto", () => {
    const result = advise({ messages: [{ role: "user", content: "hola" }] });
    expect(result.stage).toBe("welcome");
    expect(result.estimate).toBeNull();
    expect(result.reply).toMatch(/^¡Hola!/i);
    expect(result.nextQuestion).toBe("");
  });

  it("extrae negocio y problema del primer mensaje sustantivo después de un saludo", () => {
    const result = advise({
      messages: [
        { role: "user", content: "hola" },
        { role: "assistant", content: "¡Hola! Claro, estoy aquí." },
        { role: "user", content: "Tengo una clínica dental y perdemos tiempo confirmando citas por teléfono." },
      ],
    });

    expect(result.profile.business).toBe("clínica dental");
    expect(result.profile.sector).toBe("clínicas dentales");
    expect(result.profile.problem).toBe("perdemos tiempo confirmando citas por teléfono");
    expect(result.nextQuestion).toMatch(/cómo realizáis ahora ese proceso/i);
    expect(result.nextQuestion).not.toMatch(/a qué se dedica|sector/i);
  });

  it("guarda herramientas, volumen, canal y objetivo explícitos del primer mensaje", () => {
    const result = advise({
      messages: [{
        role: "user",
        content: "Quiero automatizar la recepción de correos de una asesoría pequeña; usamos Gmail y una hoja de cálculo. Recibimos unos 30 al día y quiero que no se pierda ninguno.",
      }],
    });

    expect(result.profile.business).toMatch(/asesor[ií]a/i);
    expect(result.profile.tools).toMatch(/Gmail/i);
    expect(result.profile.tools).toMatch(/hoja de c[aá]lculo/i);
    expect(result.profile.channels).toMatch(/correo electr[oó]nico/i);
    expect(result.profile.volume).toMatch(/30 al d[ií]a/i);
    expect(result.profile.goal).toMatch(/no se pierda ninguno/i);
    expect(result.profile.process).toBe("");
    expect(result.profile.approvals).toBe("");
    expect(result.nextQuestion).toMatch(/c[oó]mo realiz[aá]is ahora ese proceso/i);
  });

  it("extrae datos adicionales explícitos mientras conserva la respuesta al proceso", () => {
    const first = advise({
      messages: [
        { role: "user", content: "Quiero automatizar la recepción de correos de una asesoría pequeña; usamos Gmail y una hoja de cálculo. Recibimos unos 30 al día y quiero que no se pierda ninguno." },
      ],
    });
    const result = advise({
      profile: first.profile,
      messages: [
        { role: "assistant", content: first.nextQuestion },
        { role: "user", content: "Los correos entran por Gmail, registramos cada solicitud en Google Sheets y respondemos manualmente. Son unos 30 al día; la IA solo puede clasificar, nunca enviar respuestas. Queremos que no se pierda ninguno." },
      ],
    });

    expect(result.filledField).toBe("process");
    expect(result.profile.process).toContain("registramos cada solicitud en Google Sheets");
    expect(result.profile.tools).toMatch(/Gmail/i);
    expect(result.profile.tools).toMatch(/Google Sheets/i);
    expect(result.profile.tools).not.toMatch(/hoja de c[aá]lculo/i);
    expect(result.profile.channels).toMatch(/correo electr[oó]nico/i);
    expect(result.profile.volume).toMatch(/30 al d[ií]a/i);
    expect(result.profile.approvals).toMatch(/nunca enviar respuestas/i);
    expect(result.profile.goal).toMatch(/no se pierda ninguno/i);
    expect(result.reply).toMatch(/herramientas:.*Gmail.*Google Sheets/i);
    expect(result.reply).toMatch(/volumen:.*30 al d[ií]a/i);
    expect(result.reply).toMatch(/control humano:.*nunca enviar respuestas/i);
    expect(result.reply).not.toContain("Quere.");
    expect(result.nextQuestion).toMatch(/propuesta revisada/i);
  });

  it("un saludo intermedio conserva el perfil y no repite la pregunta pendiente", () => {
    const result = advise({
      messages: [
        { role: "assistant", content: "¿Qué tarea, problema o cuello de botella quieres mejorar primero?" },
        { role: "user", content: "hola" },
      ],
      profile: { business: "clínica dental", problem: "confirmación de citas" },
    });

    expect(result.profile.business).toBe("clínica dental");
    expect(result.profile.problem).toBe("confirmación de citas");
    expect(result.nextQuestion).toBe("");
    expect(result.reply).toMatch(/conservo el contexto/i);
  });

  it("extrae negocio y problema de un primer mensaje libre sin repetir el sector", () => {
    const result = advise({
      messages: [{
        role: "user",
        content: "Hola, tengo una clínica pequeña y perdemos tiempo confirmando citas por teléfono.",
      }],
    });

    expect(result.profile.business).toBe("clínica pequeña");
    expect(result.profile.sector).toBe("salud");
    expect(result.profile.problem).toBe("perdemos tiempo confirmando citas por teléfono");
    expect(result.profile.channels).toBe("");
    expect(result.profile.goal).toBe("");
    expect(result.filledField).toBe("problem");
    expect(result.nextQuestion).toMatch(/cómo realizáis ahora ese proceso/i);
    expect(result.nextQuestion).not.toMatch(/a qué se dedica|sector/i);
  });

  it("ignora las afirmaciones del modelo al calcular el perfil y el presupuesto", () => {
    const result = advise({
      messages: [{
        role: "user",
        content: "Hola, tengo una clínica pequeña y perdemos tiempo confirmando citas por teléfono.",
      }],
      modelReply: "Gestionas 500 citas diarias y ya usáis Salesforce con un equipo de 20 personas.",
    });

    expect(result.profile.business).toBe("clínica pequeña");
    expect(result.profile.problem).toBe("perdemos tiempo confirmando citas por teléfono");
    expect(result.profile.channels).toBe("");
    expect(result.profile.users).toBe(1);
    expect(result.nextQuestion).toMatch(/cómo realizáis ahora ese proceso/i);
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
    expect(result.estimate.range.min).toBeGreaterThanOrEqual(5500);
    expect(result.hardware.model).toMatch(/^qwen3(?::|\.8:)/);
    // El caso avanzado de IA privada usa el perfil Qwen 27B y conserva margen
    // para contexto, sistema operativo y concurrencia.
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

  it("no confunde los canales con el proceso y reformula la pregunta pendiente", () => {
    const result = advise({
      profile: { business: "clínica dental", problem: "confirmar citas" },
      messages: [
        { role: "assistant", content: "¿Cómo realizáis ahora ese proceso, desde que empieza hasta que termina?" },
        { role: "user", content: "Las solicitudes entran por formulario y WhatsApp." },
      ],
      modelReply: "Ya tengo el proceso. La opción más coherente es IA privada para gestionar los datos sensibles.",
    });

    expect(result.profile.channels).toMatch(/WhatsApp/);
    expect(result.profile.channels).toMatch(/web\/formulario/);
    expect(result.profile.process).toBe("");
    expect(result.filledField).toBe("channels");
    expect(result.nextQuestion).toMatch(/paso a paso|quién hace qué/i);
    expect(result.nextQuestion).not.toBe("¿Cómo realizáis ahora ese proceso, desde que empieza hasta que termina?");
    expect(result.reply).not.toMatch(/IA privada|opción más coherente/i);
    expect(result.estimate).toBeNull();
  });

  it("conserva el problema aunque la respuesta también mencione los canales", () => {
    const first = advise({ messages: [{ role: "user", content: "Tenemos una clínica dental en Valencia" }] });
    const result = advise({
      profile: first.profile,
      messages: [
        { role: "assistant", content: first.nextQuestion },
        { role: "user", content: "Perdemos citas porque las peticiones llegan por WhatsApp y teléfono." },
      ],
    });

    expect(result.profile.problem).toMatch(/perdemos citas/i);
    expect(result.profile.channels).toMatch(/WhatsApp.*teléfono|teléfono.*WhatsApp/i);
    expect(result.filledField).toBe("problem");
    expect(result.nextQuestion).toMatch(/cómo realizáis ahora ese proceso/i);
  });

  it("reconoce el proceso manual y mantiene separado el sistema usado", () => {
    const result = advise({
      profile: { business: "clínica dental", problem: "confirmar citas", channels: "WhatsApp, web/formulario" },
      messages: [
        { role: "assistant", content: "¿Qué ocurre hoy, paso a paso, desde que llega una solicitud hasta que queda resuelta?" },
        { role: "user", content: "Recepción copia los datos en Excel y confirma cada cita a mano." },
      ],
    });

    expect(result.profile.process).toContain("copia los datos en Excel");
    expect(result.profile.tools).toContain("Excel");
    expect(result.profile.channels).toMatch(/WhatsApp/);
    expect(result.filledField).toBe("process");
    // Excel ya quedó registrado como herramienta a partir de esta misma frase.
    expect(result.nextQuestion).toMatch(/volumen|cuántos casos/i);
  });

  it("no guarda una respuesta sobre control humano y objetivo como volumen", () => {
    const result = advise({
      profile: {
        business: "clínica dental",
        problem: "confirmar citas",
        process: "Recepción confirma cada cita a mano.",
        tools: "Excel",
        channels: "WhatsApp",
      },
      messages: [
        { role: "assistant", content: "¿Qué volumen aproximado gestionáis al día o al mes?" },
        { role: "user", content: "La responsable debe revisar cada envío; queremos responder más rápido." },
      ],
    });

    expect(result.profile.volume).toBe("");
    expect(result.profile.approvals).toMatch(/responsable debe revisar/i);
    expect(result.profile.goal).toMatch(/queremos responder más rápido/i);
    expect(result.filledField).toBe("approvals");
    expect(result.nextQuestion).toMatch(/cuántos casos|decenas o cientos/i);
  });

  it("descarta prestaciones y ahorros que el modelo añade sin evidencia", () => {
    const profile = normalizeProfile({
      business: "clínica dental",
      problem: "confirmar citas",
      process: "Recepción copia solicitudes a Excel y confirma manualmente.",
      volume: "120 citas al mes.",
      sensitivity: "high",
    });
    const reply = consultativeReply({
      profile,
      filledField: "volume",
      modelReply: "Con ese volumen, los recordatorios automáticos por WhatsApp liberarán a recepción y reducirán el trabajo manual.",
      service: recommendService(profile),
    });

    expect(reply).toContain("120 citas al mes");
    expect(reply).not.toContain("..");
    expect(reply).not.toMatch(/recordatorios|liberarán|reducirán/i);
  });
});
