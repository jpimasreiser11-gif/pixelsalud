import { expect, test } from "@playwright/test";

// Respuesta del servidor local en desarrollo. La forma es la que devuelve
// guide-engine, con un modelo que existe de verdad en Ollama.
const guideResponse = {
  reply: "Entiendo: quieres ordenar un proceso sensible sin perder el control.",
  nextQuestion: "¿Quién debe aprobar el resultado antes de enviarlo?",
  stage: "architecture",
  profile: { business: "Clínica", sector: "salud", problem: "Ordenar documentos sensibles", channels: "Formulario web", approvals: "Dirección", goal: "Reducir tiempos", integrations: 2, workflows: 2, users: 8, complexity: "standard", sensitivity: "high", customUi: true, dataMigration: false, localAi: true },
  estimate: { quotedHours: 146, range: { min: 10250, max: 13100 }, maintenanceMonthly: 650 },
  hardware: { profile: "Producción (Qwen3 14B)", model: "qwen3:14b", unifiedMemoryGb: 32, freeStorageGb: 180, headroom: "30% libre tras las pruebas" },
  service: { name: "IA privada", slug: "ia-privada" },
};

test("la guía responde y convierte la conversación en arquitectura", async ({ page }) => {
  await page.route("**/api/guide", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(guideResponse) }));
  await page.goto("/experiencia/");
  const answer = page.getByLabel("Escribe tu mensaje");
  await answer.fill("Somos una clínica y queremos ordenar documentos sensibles");
  await answer.press("Enter");
  await expect(page.getByText(/quieres ordenar un proceso sensible/i)).toBeVisible();
  await expect(page.getByText(/quién debe aprobar/i)).toBeVisible();
  await expect(page.locator("[data-service]")).toHaveText("IA privada");
  await expect(page.getByText("146")).toBeVisible();
  await expect(page.getByText(/32 GB de memoria unificada/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Ver IA privada/i })).toHaveAttribute("href", "/servicios/ia-privada/");
});

// La web publicada es estática: no existe /api/guide. Esta prueba simula esa
// situación y comprueba que la guía sigue razonando en el navegador, porque de
// lo contrario el visitante real vería un asistente muerto.
test("la guía sigue funcionando sin servidor, como en la web publicada", async ({ page }) => {
  await page.route("**/api/guide", (route) => route.abort());
  await page.goto("/experiencia/");
  const answer = page.getByLabel("Escribe tu mensaje");

  await answer.fill("Tenemos una clínica dental y perdemos citas");
  await answer.press("Enter");
  await expect(page.locator("[data-service]")).toHaveText("IA privada");
  await expect(page.locator("[data-guide-status]")).toContainText(/navegador/i);

  await answer.fill("Se nos pierden las solicitudes que llegan por WhatsApp");
  await answer.press("Enter");
  await answer.fill("Recepción lo apunta a mano en Excel y confirma por teléfono");
  await answer.press("Enter");
  // Con negocio, problema y proceso ya hay horas y precio calculados en local:
  // sin ese mínimo no se presupuesta, para no inventar alcance.
  await expect(page.locator("[data-budget]")).toBeVisible();
  await expect(page.locator("[data-budget-hours]")).not.toHaveText("—");
  await expect(page.locator("[data-hardware]")).toContainText(/GB de memoria unificada/i);
});

test("la conversación no persiste en el navegador y puede reiniciarse", async ({ page }) => {
  await page.route("**/api/guide", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(guideResponse) }));
  await page.goto("/experiencia/");
  const answer = page.getByLabel("Escribe tu mensaje");
  await answer.fill("Quiero mejorar mi proceso");
  await answer.press("Enter");
  await page.getByRole("button", { name: "Nueva conversación" }).click();
  await expect(page.getByText(/Empezamos de nuevo/i)).toBeVisible();
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});
