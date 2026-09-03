import { expect, test } from "@playwright/test";

// Estas pruebas navegan el contenido de dist/ servido sin cabeceras, igual que
// GitHub Pages. Su razón de ser: todo lo que sigue funcionaba en `astro dev` y
// aun así habría llegado roto al visitante, porque la CSP del HTML publicado
// bloquea los scripts incrustados y en producción no existe /api/guide.

test("el HTML publicado trae su propia política de contenido", async ({ page }) => {
  await page.goto("experiencia/");
  const csp = await page.locator('meta[http-equiv="content-security-policy" i]').getAttribute("content");
  expect(csp, "sin <meta> de CSP la web viaja sin política: GitHub Pages ignora public/_headers").toBeTruthy();
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).not.toContain("unsafe-inline");
  expect(csp).not.toContain("unsafe-eval");
});

test("el tema y el menú funcionan bajo la CSP publicada", async ({ page, isMobile }) => {
  const bloqueos: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && /content security policy/i.test(msg.text())) bloqueos.push(msg.text());
  });

  await page.goto("./");

  if (isMobile) {
    await page.getByRole("button", { name: "Menú" }).click();
    await expect(page.getByRole("navigation", { name: "Navegación móvil" })).toBeVisible();
  }

  const toggle = page.getByRole("button", { name: /tema/i });
  const empezoOscuro = await page.locator("html").evaluate((el) => el.classList.contains("dark"));
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", String(!empezoOscuro));
  expect(await page.evaluate(() => localStorage.getItem("varino_theme"))).toBe(empezoOscuro ? "light" : "dark");

  expect(bloqueos, "la CSP bloqueó scripts de la página publicada").toEqual([]);
});

test("la guía razona en el navegador sin ninguna llamada de red", async ({ page, baseURL }) => {
  const propio = new URL(baseURL ?? "http://localhost:4456").host;
  const externas: string[] = [];
  const errores: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.host !== propio || url.pathname.startsWith("/api/")) externas.push(request.url());
  });
  page.on("pageerror", (error) => errores.push(error.message));

  await page.goto("experiencia/");
  const caja = page.getByLabel("Escribe tu mensaje");
  const esperar = () => page.waitForFunction(() => !document.querySelector(".ai-message--pending"));

  await caja.fill("Tenemos una clínica dental en Valencia");
  await caja.press("Enter");
  await esperar();
  await expect(page.locator("[data-guide-status]")).toContainText(/navegador/i);

  await caja.fill("Perdemos citas porque las peticiones llegan por WhatsApp y teléfono");
  await caja.press("Enter");
  await esperar();
  await caja.fill("Recepción las apunta a mano en un Excel y confirma llamando");
  await caja.press("Enter");
  await esperar();

  await expect(page.locator("[data-service]")).toHaveText("IA privada");
  await expect(page.locator("[data-budget]")).toBeVisible();
  await expect(page.locator("[data-budget-hours]")).not.toHaveText("—");
  await expect(page.locator("[data-hardware]")).toContainText(/GB de memoria unificada/i);
  // El modelo se nombra con una etiqueta que existe en Ollama. "Qwen 27B" no
  // existe y estuvo escrito en el producto: la prueba impide que vuelva.
  await expect(page.locator("[data-hardware]")).not.toContainText(/27\s?B/i);

  expect(externas, "la guía publicada no debe llamar a ningún servicio").toEqual([]);
  expect(errores).toEqual([]);
});

test("el formulario de contacto sigue vivo en la web publicada", async ({ page }) => {
  const bloqueos: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && /content security policy/i.test(msg.text())) bloqueos.push(msg.text());
  });

  await page.goto("contacto/");
  await page.getByLabel("Nombre completo").fill("Cliente de prueba");
  await page.getByLabel("Empresa / organización").fill("Clínica Norte");
  await page.getByLabel("Detalles del proyecto").fill("Automatizar la entrada de citas con aprobación humana.");

  // Sin canal público configurado, el botón copia el briefing al portapapeles.
  // Si el script estuviera bloqueado, el envío recargaría la página.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: /copiar briefing|preparar correo/i }).click();
  await expect(page.locator("[data-form-status]")).not.toBeEmpty();

  expect(bloqueos).toEqual([]);
});

test("el laboratorio publica tres demos n8n descargables y seguras", async ({ page }) => {
  const respuestas: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400) respuestas.push(`${response.status()} ${response.url()}`);
  });

  await page.goto("demos/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Te enseñamos cómo se comporta");

  const descargas = page.getByRole("link", { name: "Descargar flujo n8n" });
  await expect(descargas).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    const href = await descargas.nth(index).getAttribute("href");
    expect(href).toMatch(/\/demos\/.+\.n8n\.json$/);
    const response = await page.request.get(new URL(href!, page.url()).toString());
    expect(response.ok(), href ?? "descarga sin href").toBe(true);
    const workflow = await response.json();
    expect(workflow.active).toBe(false);
    expect(workflow.nodes.at(-1)?.name).toMatch(/^PARAR -/);
  }

  expect(respuestas).toEqual([]);
});
