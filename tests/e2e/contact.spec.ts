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

const contactConfig = { enabled: true, mode: "local-test", noticeVersion: "contact-request-v1" };
const acceptedReceipt = { ok: true, receiptId: "04bf0ebe-fd8c-4253-a4a6-ec2eed6ebfb2", duplicate: true, status: "received", crmConfirmed: false };
async function enableSyntheticContact(page) {
  await page.route("**/api/briefings/config", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(contactConfig) }));
  await page.goto("/contacto/");
  await expect(page.getByRole("button", { name: "Enviar solicitud →" })).toBeVisible();
}
async function fillSyntheticContact(page, email = "prueba@example.test") {
  const form = page.locator("#form-contacto");
  await form.getByLabel("Nombre completo").fill("Equipo ficticio");
  await form.getByLabel("Empresa / organización").fill("Empresa ficticia");
  await form.getByLabel("Email", { exact: true }).fill(email);
  return form;
}

test("el formulario conserva la clave y campos tras un fallo; nueva solicitud solo con acción explícita", async ({ page }) => {
  const payloads: Array<Record<string, unknown>> = [];
  await page.route("**/api/briefings", async (route) => {
    payloads.push(route.request().postDataJSON());
    await route.fulfill({ status: payloads.length === 1 ? 503 : 202, contentType: "application/json",
      body: JSON.stringify(payloads.length === 1 ? { error: "service_unavailable" } : acceptedReceipt) });
  });
  await enableSyntheticContact(page);
  const form = await fillSyntheticContact(page);
  await form.locator('button[type="submit"]').click();
  expect(payloads).toHaveLength(0);
  await form.locator('[name="privacy_acknowledged"]').check();
  await form.locator('button[type="submit"]').click();
  await expect(form.locator("[data-form-status]")).toContainText(/no se pudo confirmar la recepción/i);
  await expect(form.getByLabel("Email", { exact: true })).toHaveValue("prueba@example.test");
  await expect(form.getByLabel("Nombre completo")).toBeDisabled();
  await expect(form.locator("#contacto-mailto")).toBeHidden();
  await form.getByRole("button", { name: "Confirmar el mismo envío" }).click();
  await expect(form.locator("[data-contact-receipt]")).toBeVisible();
  await expect(form.locator("[data-contact-reference]")).toHaveText(acceptedReceipt.receiptId);
  await expect(form.locator("[data-contact-result]")).toContainText(/solicitud ficticia/i);
  expect(payloads).toHaveLength(2);
  expect(payloads[0].submissionId).toMatch(/^[0-9a-f]{64}$/);
  expect(payloads[1].submissionId).toBe(payloads[0].submissionId);
  expect(payloads.every((payload) => payload.privacy_acknowledged === true && payload.marketing_consent === false && payload.noticeVersion === "contact-request-v1")).toBe(true);
  await expect(form.locator('button[type="submit"]')).toBeDisabled();
  await form.getByRole("button", { name: "Preparar otra solicitud" }).click();
  await expect(form.getByLabel("Email", { exact: true })).toHaveValue("");
  await expect(form.locator('[name="privacy_acknowledged"]')).not.toBeChecked();
  await expect(form.locator('[name="marketing_consent"]')).not.toBeChecked();
  await fillSyntheticContact(page);
  await form.locator('[name="privacy_acknowledged"]').check();
  await form.locator('button[type="submit"]').click();
  await expect.poll(() => payloads.length).toBe(3);
  expect(payloads[2].submissionId).not.toBe(payloads[0].submissionId);
});

test("un ok genérico no se presenta como solicitud registrada", async ({ page }) => {
  await page.route("**/api/briefings", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }));
  await enableSyntheticContact(page);
  const form = await fillSyntheticContact(page);
  await form.locator('[name="privacy_acknowledged"]').check();
  await form.locator('button[type="submit"]').click();
  await expect(form.locator("[data-form-status]")).toContainText(/no se pudo confirmar/i);
  await expect(form.locator("[data-contact-receipt]")).toBeHidden();
  await expect(form.getByRole("button", { name: "Confirmar el mismo envío" })).toBeEnabled();
});

test("si no carga la validación, conserva los campos editables y no envía", async ({ page }) => {
  let posts = 0;
  await page.route("**/src/lib/inbound-contract.mjs", (route) => route.abort("failed"));
  page.on("request", (request) => { if (request.method() === "POST" && request.url().endsWith("/api/briefings")) posts += 1; });
  await enableSyntheticContact(page);
  const form = await fillSyntheticContact(page);
  await form.locator('[name="privacy_acknowledged"]').check();
  await form.locator('button[type="submit"]').click();
  await expect(form.locator("[data-form-status]")).toContainText(/no se pudo preparar el envío seguro/i);
  await expect(form.getByLabel("Nombre completo")).toBeEnabled();
  await expect(form.getByLabel("Email", { exact: true })).toHaveValue("prueba@example.test");
  await expect(form.locator('button[type="submit"]')).toBeEnabled();
  await expect(form.locator("[data-contact-receipt]")).toBeHidden();
  expect(posts).toBe(0);
});

test("la capacidad de ensayo rechaza contactos no ficticios antes de enviar", async ({ page }) => {
  let posts = 0;
  page.on("request", (request) => { if (request.method() === "POST" && request.url().endsWith("/api/briefings")) posts += 1; });
  await enableSyntheticContact(page);
  const form = await fillSyntheticContact(page, "prueba@example.com");
  await form.locator('[name="privacy_acknowledged"]').check();
  await form.locator('button[type="submit"]').click();
  await expect(form.locator("[data-form-status]")).toContainText(/solo admite emails acabados en .test/i);
  await expect(form.getByLabel("Email", { exact: true })).toBeEnabled();
  expect(posts).toBe(0);
});

test("una configuración con destino arbitrario no habilita ni envía el formulario", async ({ page }) => {
  const unsafe: string[] = [];
  await page.route("**/api/briefings/config", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...contactConfig, endpoint: "https://attacker.test/lead" }) }));
  page.on("request", (request) => { if (/attacker\.test|challenges\.cloudflare\.com|\/webhook\//.test(request.url())) unsafe.push(request.url()); });
  await page.goto("/contacto/");
  await expect(page.locator('#form-contacto')).toHaveAttribute('data-contact-state', 'offline');
  await expect(page.getByRole("button", { name: /preparar correo/i })).toBeVisible();
  await expect(page.locator("[data-contact-privacy]")).toBeHidden();
  expect(unsafe).toEqual([]);
});

test("la reserva se presenta como no disponible si no hay agenda conectada", async ({ page }) => {
  const webhooks: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/webhook/")) webhooks.push(request.url());
  });
  await page.goto("/reservar/");
  await expect(page.getByRole("heading", { name: "Agenda online en preparación" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "1 · Elige un hueco" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Hablemos del proceso que quieres mejorar." })).toBeVisible();
  await expect(page.getByRole("link", { name: /escríbenos por WhatsApp/i })).toHaveAttribute(
    "href",
    /Hola%2C%20me%20gustar%C3%ADa%20coordinar%20una%20llamada/,
  );
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

test("la política describe el estado real de backend y analítica en prelanzamiento", async ({ page }) => {
  const unsafeRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/webhook\/|ngrok|:11434/i.test(request.url())) unsafeRequests.push(request.url());
  });
  await page.goto("/privacidad/");
  const policy = page.locator("main");
  await expect(policy).toContainText(/la analítica web está desactivada/i);
  await expect(policy).toContainText(/el backend de esta rama está deshabilitado/i);
  const text = await policy.innerText();
  expect(text).not.toMatch(/ngrok/i);
  expect(unsafeRequests).toEqual([]);
});
