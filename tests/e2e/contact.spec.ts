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
  const submit = page.getByRole("button", { name: /preparar correo/i });
  const form = page.locator("#form-contacto");
  await expect(submit).toBeEnabled();
  await expect(page.getByText(/envío automático está desconectado/i)).toBeVisible();
  // El canal público ya está configurado: el email es visible y pulsable
  // (aparece en el bloque de contacto y también en el pie).
  await expect(page.getByRole("link", { name: /varinoagency@gmail\.com/i }).first()).toBeVisible();

  await page.getByLabel("Nombre completo").fill("Cliente de prueba");
  await form.getByLabel("Email", { exact: true }).fill("prueba@example.com");
  await page.getByLabel("Empresa / organización").fill("Clínica Norte");
  await page.getByLabel("Sitio web o software").fill("https://clinicanorte.example");
  await page.getByLabel("Detalles del proyecto").fill("Automatizar la entrada de citas con aprobación humana.");
  await submit.click();
  await expect(page.locator("[data-form-status]")).toContainText(/no se ha enviado ni guardado/i);
  const draftLink = page.getByRole("link", { name: /abrir borrador en tu correo/i });
  await expect(draftLink).toBeVisible();
  const draftHref = await draftLink.getAttribute("href");
  expect(draftHref).toContain("mailto:varinoagency@gmail.com");
  expect(draftHref).toContain(encodeURIComponent("prueba@example.com"));
  expect(draftHref).toContain(encodeURIComponent("https://clinicanorte.example"));

  await page.getByRole("button", { name: /copiar briefing/i }).click();
  await expect(page.locator("[data-form-status]")).toContainText(/briefing copiado/i);
  expect(await page.evaluate(() => (window as unknown as { __briefingCopy?: string }).__briefingCopy)).toContain("prueba@example.com");
  expect(webhookRequests).toBe(0);
});

test("el formulario conserva la clave en un reintento y la rota tras una recepción confirmada", async ({ page }) => {
  const submissionIds: string[] = [];
  await page.addInitScript(() => {
    const original = Element.prototype.getAttribute;
    Element.prototype.getAttribute = function (name: string) {
      if (name === "data-lead" && this.id === "form-contacto") return `${location.origin}/__test/lead`;
      return original.call(this, name);
    };
  });
  await page.route("**/__test/lead", async (route) => {
    const request = route.request().postDataJSON() as { submissionId: string };
    submissionIds.push(request.submissionId);
    if (submissionIds.length === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, duplicate: true }) });
  });

  await page.goto("/contacto/");
  const form = page.locator("#form-contacto");
  const fillContact = async (email: string) => {
    await form.getByLabel("Nombre completo").fill("Cliente de prueba");
    await form.getByLabel("Empresa / organización").fill("Clínica Norte");
    await form.getByLabel("Email", { exact: true }).fill(email);
  };
  await fillContact("prueba@example.com");
  await form.locator('button[type="submit"]').click();
  await expect(page.locator("[data-form-status]")).toContainText(/no se pudo confirmar la recepción/i);

  await form.locator('button[type="submit"]').click();
  await expect(page.locator("[data-form-status]")).toContainText(/solicitud recibida/i);
  expect(submissionIds).toHaveLength(2);
  expect(submissionIds[0]).toMatch(/^[0-9a-f]{64}$/i);
  expect(submissionIds[1]).toBe(submissionIds[0]);

  await fillContact("otra@example.com");
  await form.locator('button[type="submit"]').click();
  await expect.poll(() => submissionIds.length).toBe(3);
  expect(submissionIds[2]).not.toBe(submissionIds[0]);
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

test("la llamada de encaje desde una página sectorial prepara un correo sin guardar ni enviar datos", async ({ page }) => {
  let webhookRequests = 0;
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: (text: string) => { (window as unknown as { __briefingCopy: string }).__briefingCopy = text; return Promise.resolve(); } },
    });
  });
  page.on("request", (request) => { if (request.url().includes("/webhook/")) webhookRequests += 1; });
  await page.goto("/sectores/inmobiliarias/");
  await page.getByRole("link", { name: /pedir una llamada de encaje/i }).click();
  await expect(page).toHaveURL(/\/auditoria\/\?sector=Inmobiliarias&interes=automation-sprint/);
  const form = page.locator("#form-auditoria");
  await expect(form.getByLabel("Sector (opcional)")).toHaveValue("Inmobiliarias");
  await expect(form.getByLabel("¿Qué te interesa?")).toHaveValue("automation-sprint");
  await expect(form.getByLabel(/acepto que VARINO guarde/i)).toHaveCount(0);
  await form.getByLabel("Nombre").fill("Persona de prueba");
  await form.getByLabel("Email").fill("test@example.com");
  await form.getByLabel("Empresa (opcional)").fill("Inmuebles Demo");
  await form.getByLabel(/qué proceso te gustaría mejorar/i).fill("Organizar solicitudes de visita con revisión humana.");
  await form.getByRole("button", { name: /preparar correo/i }).click();
  await expect(page.locator("[data-form-status]")).toContainText(/no se ha enviado ni guardado/i);
  const draft = page.locator("#auditoria-mailto");
  await expect(draft).toBeVisible();
  const href = await draft.getAttribute("href");
  expect(href).toContain("mailto:varinoagency@gmail.com");
  expect(href).toContain(encodeURIComponent("Inmuebles Demo"));
  expect(href).toContain(encodeURIComponent("Organizar solicitudes de visita con revisión humana."));
  await form.getByRole("button", { name: /copiar resumen/i }).click();
  await expect(page.locator("[data-form-status]")).toContainText(/resumen copiado/i);
  expect(await page.evaluate(() => (window as unknown as { __briefingCopy?: string }).__briefingCopy)).toContain("Inmobiliarias");
  expect(webhookRequests).toBe(0);
});

test("el aviso legal oculta los datos identificativos durante el prelanzamiento", async ({ page }) => {
  await page.goto("/aviso-legal/");
  await expect(page.getByRole("status")).toContainText(/información de prelanzamiento/i);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,follow");
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/\b\d{8}[A-Z]\b/i);
  expect(text).not.toMatch(/domicilio:\s*\S/i);
});
