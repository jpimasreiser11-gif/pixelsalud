import { expect, test } from "@playwright/test";

// Respuesta simulada del servidor local en desarrollo: incluye la etiqueta del
// modelo que el servidor solo devuelve tras confirmar que Ollama respondió.
const guideResponse = {
  model: "qwen3.8:latest",
  reply: "Entiendo: quieres ordenar un proceso sensible sin perder el control.",
  nextQuestion: "¿Quién debe aprobar el resultado antes de enviarlo?",
  stage: "architecture",
  profile: { business: "Clínica", sector: "salud", problem: "Ordenar documentos sensibles", channels: "Formulario web", approvals: "Dirección", goal: "Reducir tiempos", integrations: 2, workflows: 2, users: 8, complexity: "standard", sensitivity: "high", customUi: true, dataMigration: false, localAi: true },
  estimate: { quotedHours: 50.5, range: { min: 3600, max: 4550 }, maintenanceMonthly: 650 },
  hardware: { profile: "IA exigente (Qwen 3.8 · 27,3B Q4_K_M)", model: "qwen3.8:latest", unifiedMemoryGb: 64, freeStorageGb: 300, headroom: "30% libre tras las pruebas" },
  service: { name: "IA privada", slug: "ia-privada" },
};

test("la guía responde y convierte la conversación en arquitectura", async ({ page }) => {
  await page.route("**/api/guide", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(guideResponse) }));
  await page.goto("/experiencia/");
  const guide = page.locator("[data-ai-guide]");
  const answer = guide.getByLabel("Escribe tu mensaje");
  await answer.fill("Somos una clínica y queremos ordenar documentos sensibles");
  await answer.press("Enter");
  await expect(page.getByText(/quieres ordenar un proceso sensible/i)).toBeVisible();
  await expect(page.getByText(/quién debe aprobar/i)).toBeVisible();
  await expect(guide.locator("[data-service]")).toHaveText("IA privada");
  await expect(guide.locator("[data-guide-status]")).toHaveText("Modelo local · qwen3.8:latest");
  await expect(guide.getByText("50.5")).toBeVisible();
  await expect(guide.getByText(/64 GB de memoria unificada/i)).toBeVisible();
  await expect(guide.getByRole("link", { name: /Ver IA privada/i })).toHaveAttribute("href", "/servicios/ia-privada/");
});

test("la guía no afirma que Ollama funciona si el endpoint responde sin modelo", async ({ page }) => {
  await page.route("**/api/guide", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ...guideResponse, model: null }),
  }));
  await page.goto("/experiencia/");
  const guide = page.locator("[data-ai-guide]");
  const answer = guide.getByLabel("Escribe tu mensaje");

  await expect(guide.locator("[data-guide-status]")).toHaveText("Modelo local: se comprueba al responder");
  await answer.fill("Somos una clínica y queremos ordenar documentos sensibles");
  await answer.press("Enter");
  await expect(guide.locator("[data-guide-status]")).toHaveText("Guía base · sin modelo local");
  await expect(guide.locator(".ai-message--assistant").last()).toContainText(/Entiendo:/i);
});

// La web publicada es estática: no existe /api/guide. Esta prueba simula esa
// situación y comprueba que la guía sigue razonando en el navegador, porque de
// lo contrario el visitante real vería un asistente muerto.
test("la guía sigue funcionando sin servidor, como en la web publicada", async ({ page }) => {
  await page.route("**/api/guide", (route) => route.abort());
  await page.goto("/experiencia/");
  const guide = page.locator("[data-ai-guide]");
  const answer = guide.getByLabel("Escribe tu mensaje");

  await answer.fill("Tenemos una clínica dental y perdemos citas");
  await answer.press("Enter");
  await expect(guide.locator("[data-service]")).toHaveText("IA privada");
  await expect(guide.locator("[data-guide-status]")).toHaveText("Guía base · conexión local no disponible");
  await expect(guide.locator("[data-guide-status]")).not.toContainText(/modelo local activo/i);

  await answer.fill("Se nos pierden las solicitudes que llegan por WhatsApp");
  await answer.press("Enter");
  await answer.fill("Recepción lo apunta a mano en Excel y confirma por teléfono");
  await answer.press("Enter");
  // Con negocio, problema y proceso ya hay horas y precio calculados en local:
  // sin ese mínimo no se presupuesta, para no inventar alcance.
  await expect(guide.locator("[data-budget]")).toBeVisible();
  await expect(guide.locator("[data-budget-hours]")).not.toHaveText("—");
  await expect(guide.locator("[data-hardware]")).toContainText(/GB de memoria unificada/i);
});

test("un primer mensaje libre reconoce el sector y el problema sin pedirlos otra vez", async ({ page }) => {
  await page.route("**/api/guide", (route) => route.abort());
  await page.goto("/experiencia/");
  const guide = page.locator("[data-ai-guide]");
  const answer = guide.getByLabel("Escribe tu mensaje");

  await answer.fill("Hola, tengo una clínica pequeña y perdemos tiempo confirmando citas por teléfono.");
  await answer.press("Enter");

  await expect(guide.locator(".ai-message--assistant").last()).toContainText(/confirmando citas por teléfono/i);
  await expect(guide.locator(".ai-message--assistant").last()).toContainText(/cómo realizáis ahora ese proceso/i);
  await expect(guide.locator(".ai-message--assistant").last()).not.toContainText(/a qué se dedica tu empresa|qué sector/i);
  await expect(guide.locator("[data-service]")).toHaveText("IA privada");
  await expect(guide.locator("[data-guide-status]")).toHaveText("Guía base · conexión local no disponible");
});

test("conserva el contexto durante todo el diagnóstico y no repite preguntas", async ({ page }) => {
  await page.route("**/api/guide", (route) => route.abort());
  await page.goto("/experiencia/");
  const guide = page.locator("[data-ai-guide]");
  const answer = guide.getByLabel("Escribe tu mensaje");
  const assistantMessages = guide.locator(".ai-message--assistant");

  const send = async (message: string) => {
    const before = await assistantMessages.count();
    await answer.fill(message);
    await answer.press("Enter");
    await expect(assistantMessages).toHaveCount(before + 1);
    await expect(guide.locator(".ai-message--pending")).toHaveCount(0);
    await expect(answer).toBeEnabled();
  };

  await send("hola");
  for (const message of [
    "Somos una clínica dental pequeña",
    "Se nos pierden citas entre llamadas y WhatsApp",
    "Recepción apunta solicitudes en una hoja y confirma a mano",
    "Usamos Google Sheets y el calendario",
    "Entra por teléfono, WhatsApp y formulario web",
    "Unas 30 solicitudes por semana",
    "Una persona debe aprobar los mensajes al paciente",
    "Queremos reducir el tiempo de respuesta y evitar duplicados",
  ]) {
    await send(message);
  }

  const turns = await assistantMessages.allInnerTexts();
  const questions = turns.flatMap((turn) => turn.match(/¿[^?]+\?/g) || []);
  expect(questions.length).toBe(9);
  expect(new Set(questions).size).toBe(questions.length);
  await expect(guide.locator("[data-guide-stage]")).toHaveText("ESTIMACIÓN");
  await expect(guide.locator("[data-service]")).toHaveText("IA privada");
  await expect(guide.locator("[data-budget]")).toBeVisible();
  await expect(guide.locator("[data-node=\"control\"]")).toContainText("Una persona debe aprobar");
});

test("la conversación no persiste en el navegador y puede reiniciarse", async ({ page }) => {
  await page.route("**/api/guide", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(guideResponse) }));
  await page.goto("/experiencia/");
  const guide = page.locator("[data-ai-guide]");
  const answer = guide.getByLabel("Escribe tu mensaje");
  await answer.fill("Quiero mejorar mi proceso");
  await answer.press("Enter");
  await guide.getByRole("button", { name: "Nueva conversación" }).click();
  await expect(guide.getByText(/Empezamos de nuevo/i)).toBeVisible();
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});

test("bloquea datos personales antes de llamar al modelo y limpia el diagnóstico", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/guide", (route) => {
    requests += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(guideResponse) });
  });
  await page.goto("/experiencia/");
  const guide = page.locator("[data-ai-guide]");
  const answer = guide.getByLabel("Escribe tu mensaje");

  await answer.fill("Somos una clínica dental");
  await answer.press("Enter");
  await expect.poll(() => requests).toBe(1);
  await answer.fill("Mi correo es cliente@example.com");
  await answer.press("Enter");

  await expect(guide.getByText(/no he enviado esa información al modelo/i)).toBeVisible();
  await expect(guide.locator(".ai-message--user")).toHaveCount(0);
  expect(requests).toBe(1);
  await expect(guide.locator("[data-preview-title]")).toHaveText("Tu necesidad, convertida en una arquitectura clara.");
});
