import { expect, test } from "@playwright/test";

test("contacto no afirma recibir datos si el backend está desconectado", async ({ page }) => {
  let webhookRequests = 0;
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          (window as unknown as { __briefingCopy: string }).__briefingCopy = text;
          return Promise.resolve();
        },
      },
    });
  });
  page.on("request", (request) => {
    if (request.url().includes("/webhook/lead")) webhookRequests += 1;
  });
  await page.goto("/contacto/");
  const submit = page.getByRole("button", { name: /copiar briefing/i });
  const form = page.locator("#form-contacto");
  await expect(submit).toBeEnabled();
  await expect(page.getByText(/envío automático está desconectado/i)).toBeVisible();
  // El canal público ya está configurado: el email es visible y pulsable
  // (aparece en el bloque de contacto y también en el pie).
  await expect(page.getByRole("link", { name: /varinoagency@gmail\.com/i }).first()).toBeVisible();

  await page.getByLabel("Nombre completo").fill("Cliente de prueba");
  await form.getByLabel("Email", { exact: true }).fill("prueba@example.com");
  await page.getByLabel("Empresa / organización").fill("Clínica Norte");
  await page.getByLabel("Detalles del proyecto").fill("Automatizar la entrada de citas con aprobación humana.");
  await submit.click();
  await expect(page.locator("[data-form-status]")).toContainText(/briefing copiado/i);
  expect(await page.evaluate(() => (window as unknown as { __briefingCopy?: string }).__briefingCopy)).toContain("prueba@example.com");
  expect(webhookRequests).toBe(0);
});

test("la reserva se presenta como no disponible si no hay agenda conectada", async ({ page }) => {
  const webhooks: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/webhook/")) webhooks.push(request.url());
  });
  await page.goto("/reservar/");
  await expect(page.locator("[data-slot-status]")).toContainText(/no está disponible/i);
  await expect(page.locator("#app-reservar")).toHaveAttribute("data-avail", "");
  await expect(page.locator("#app-reservar")).toHaveAttribute("data-book", "");
  expect(webhooks).toEqual([]);
});

test("el aviso legal muestra los datos configurados del titular", async ({ page }) => {
  await page.goto("/aviso-legal/");
  await expect(page.getByText("Joan Pimas Reiser").first()).toBeVisible();
  await expect(page.getByText("20569591Q").first()).toBeVisible();
  await expect(page.getByText(/passeig de la rectoria vella/i).first()).toBeVisible();
});
