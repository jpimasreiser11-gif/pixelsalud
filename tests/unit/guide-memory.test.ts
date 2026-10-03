import { describe, expect, it } from "vitest";
import { advise, applyLastAnswer, cleanReply, consultativeReply, nextUsefulQuestion, normalizeProfile, recommendService } from "../../src/lib/guide-engine.mjs";
import { MAINTENANCE_PLANS, SERVICES } from "../../src/config";

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

  it.each([
    "Entendido, para diseñar el flujo exacto necesito que me describas paso a paso cómo gestionáis las citas actualmente, desde que llega la solicitud hasta que se confirma.",
    "Entendido, para diseñar la solución ajustada a vuestro flujo actual necesito saber cómo gestionáis el proceso paso a paso hoy en día.",
  ])("descarta una petición indirecta del modelo que duplicaría la siguiente pregunta", (modelReply) => {
    const result = advise({
      messages: [{
        role: "user",
        content: "Somos una clínica veterinaria pequeña. Queremos automatizar la solicitud y confirmación de citas desde un formulario y una hoja de cálculo; una persona debe aprobar cada cita.",
      }],
      modelReply,
    });

    expect(result.replySource).toBe("rules");
    expect(result.reply).not.toMatch(/necesito que me|necesito saber|describas paso a paso|cómo gestionáis el proceso/i);
    expect(result.nextQuestion).toBe("¿Cómo realizáis ahora ese proceso, desde que empieza hasta que termina?");
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
    expect(result.replySource).toBe("rules");
    expect(result.estimate).toBeNull();
    expect(result.reply).toMatch(/^¡Hola!/i);
    expect(result.nextQuestion).toBe("");
  });

  it("contesta una consulta de servicios y precios sin convertirla en un proceso del cliente", () => {
    const result = advise({
      messages: [{ role: "user", content: "Quiero saber qué servicios ofrecéis y cuánto cuestan." }],
      modelReply: "El sistema calcula automáticamente la solución y el presupuesto adaptados a tu caso concreto.",
    });

    expect(result.reply).toContain("950–1.900 € + IVA");
    expect(result.reply).toContain("2.500–6.000 € + IVA");
    expect(result.reply).toContain("desde 5.500 € + IVA");
    expect(result.reply).toContain("Care 149 €/mes");
    for (const service of SERVICES) {
      expect(result.reply.toLowerCase()).toContain(`${service.name} (${service.range}`.toLowerCase());
    }
    for (const plan of MAINTENANCE_PLANS) {
      expect(result.reply.toLowerCase()).toContain(`${plan.name} ${plan.monthly.replace(" + IVA", "")}`.toLowerCase());
    }
    expect(result.nextQuestion).toMatch(/tarea repetitiva o cuello de botella/i);
    expect(result.profile.business).toBe("");
    expect(result.estimate).toBeNull();
    expect(result.service).toBeNull();
    expect(result.catalog).toBe(true);
  });

  it("recuerda herramientas, proceso, volumen y límites humanos al pedir precio", () => {
    const firstMessage = "Llevo una clínica dental y recibo unas 60 solicitudes semanales. Copiamos las solicitudes web a Doctoralia y queremos conservar ese software.";
    const priceMessage = "No queremos cambiar de herramienta. Una recepcionista revisa y aprueba cada caso, y no guardaríamos datos clínicos en una hoja genérica. Dime un precio orientativo y el siguiente paso.";
    const first = advise({
      messages: [
        { role: "user", content: "hola" },
        { role: "assistant", content: "¡Hola! Claro, estoy aquí." },
        { role: "user", content: firstMessage },
      ],
    });
    const result = advise({
      profile: first.profile,
      messages: [
        { role: "user", content: "hola" },
        { role: "assistant", content: "¡Hola! Claro, estoy aquí." },
        { role: "user", content: firstMessage },
        { role: "assistant", content: first.nextQuestion },
        { role: "user", content: priceMessage },
      ],
      modelReply: "Entendido, vamos a optimizar la gestión de esas 60 citas semanales manteniendo Doctoralia.",
    });

    expect(result.catalog).toBe(true);
    expect(result.profile.business).toMatch(/clínica dental/i);
    expect(result.profile.process).toMatch(/solicitudes web a Doctoralia/i);
    expect(result.profile.tools).toContain("Doctoralia");
    expect(result.profile.volume).toMatch(/60 solicitudes semanales/i);
    expect(result.profile.approvals).toBe("Una recepcionista revisa y aprueba cada caso");
    expect(result.profile.dataHandling).toMatch(/^no guardaríamos datos clínicos en una hoja genérica/i);
    expect(result.profile.dataHandling).not.toMatch(/recepcionista/i);
    expect(result.reply).toContain("950–1.900 € + IVA");
    expect(result.reply).toMatch(/mantener Doctoralia/i);
    expect(result.reply).toMatch(/control humano: Una recepcionista revisa y aprueba cada caso/i);
    expect(result.reply).toMatch(/restricción de datos: no guardaríamos datos clínicos en una hoja genérica/i);
    expect(result.reply).toMatch(/siguiente paso sería mapear el flujo/i);
    expect(result.nextQuestion).toMatch(/sin cambiar Doctoralia/i);
    expect(result.nextQuestion).not.toBe(first.nextQuestion);
    expect(result.estimate).toBeNull();
  });

  it("descarta la respuesta local genérica que promete un presupuesto automático", () => {
    const result = advise({
      messages: [{ role: "user", content: "Somos una tienda y queremos mejorar las consultas de stock." }],
      modelReply: "El sistema calcula automáticamente la solución y el presupuesto adaptados a tu caso concreto.",
    });

    expect(result.replySource).toBe("rules");
    expect(result.reply).not.toMatch(/el sistema calcula automáticamente/i);
    expect(result.nextQuestion).toMatch(/proceso|empresa/i);
  });

  it("marca como modelo solo una redacción útil que realmente aparece en la respuesta", () => {
    const modelReply = "El proceso que describes está claro: una persona copia las solicitudes en Excel y redacta cada respuesta manualmente. La revisión final del equipo puede seguir siendo el punto de aprobación.";
    const result = advise({
      profile: {
        business: "asesoría",
        problem: "el registro manual de solicitudes",
        process: "Una persona copia solicitudes en Excel y responde a mano.",
      },
      messages: [
        { role: "assistant", content: "¿Qué herramientas intervienen?" },
        { role: "user", content: "Usamos Excel y una persona revisa cada respuesta." },
      ],
      modelReply,
    });

    expect(result.reply).toBe(modelReply);
    expect(result.replySource).toBe("model");
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

  it("no vuelve a preguntar por el problema si ya describieron una tarea y su objetivo", () => {
    const result = advise({
      messages: [{
        role: "user",
        content: "Caso ficticio: una tienda de bicicletas recibe consultas de stock por email. Una persona copia cada solicitud a una hoja y comprueba existencias antes de responder. Queremos clasificar las consultas y preparar respuestas para revisión humana, sin envío automático.",
      }],
      modelReply: "Entendido, puedo ayudarte a ordenar esas consultas y preparar borradores para revisión humana.",
    });

    expect(result.profile.sector).toBe("comercio y ecommerce");
    expect(result.profile.problem).toMatch(/clasificar las consultas/i);
    expect(result.profile.process).toMatch(/copia cada solicitud/i);
    expect(result.nextQuestion).not.toMatch(/qu[eé] tarea, problema o cuello de botella/i);
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

  it("rechaza promesas y unidades de volumen que contradicen lo dicho", () => {
    const profile = {
      business: "clínica dental",
      problem: "confirmar solicitudes",
      process: "Copiamos solicitudes web a Doctoralia.",
    };
    const result = advise({
      profile,
      messages: [
        { role: "assistant", content: "¿Qué volumen aproximado gestionáis al día o al mes?" },
        { role: "user", content: "Son 60 solicitudes semanales." },
      ],
      modelReply: "Entendido, vamos a optimizar la gestión de esas 60 citas semanales manteniendo Doctoralia.",
    });

    expect(result.profile.volume).toMatch(/60 solicitudes semanales/i);
    expect(result.replySource).toBe("rules");
    expect(result.reply).toContain("60 solicitudes semanales");
    expect(result.reply).not.toMatch(/optimizar|60 citas/i);

    const promiseOnly = advise({
      profile,
      messages: [
        { role: "assistant", content: "¿Qué volumen aproximado gestionáis al día o al mes?" },
        { role: "user", content: "Son 60 solicitudes semanales." },
      ],
      modelReply: "Entendido: manteniendo el mismo volumen de 60 solicitudes semanales, vamos a optimizar la gestión sin cambiar Doctoralia; el alcance aún debe validarse.",
    });
    expect(promiseOnly.replySource).toBe("rules");
    expect(promiseOnly.reply).not.toMatch(/vamos a optimizar/i);
  });
});
