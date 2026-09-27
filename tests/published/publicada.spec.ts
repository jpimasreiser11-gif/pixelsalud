import AxeBuilder from "@axe-core/playwright";
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

test("la versión no aprobada bloquea robots y no publica sitemap", async ({ page }) => {
  const robotsResponse = await page.goto("/robots.txt");
  expect(robotsResponse?.status()).toBe(200);
  expect(await robotsResponse?.text()).toMatch(/Allow:\s*\//);
  expect(await robotsResponse?.text()).not.toMatch(/^Sitemap:/mi);

  const sitemapResponse = await page.goto("/sitemap-index.xml");
  expect(sitemapResponse?.status()).toBe(404);

  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,follow");
});

test("el HTML legal de prelanzamiento no contiene identidad ni permite contratar", async ({ page }) => {
  await page.goto("aviso-legal/");
  await expect(page.getByRole("status")).toContainText(/prelanzamiento/i);
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/\b\d{8}[A-Z]\b/i);
  expect(text).not.toMatch(/domicilio:\s*\S/i);
  expect(text).not.toMatch(/contratar servicios|contratación online está habilitada/i);
});

test("la landing de Automation Sprint no carga chat, analítica ni el túnel antiguo", async ({ page, baseURL }) => {
  const propio = new URL(baseURL ?? "http://localhost:4456").origin;
  const externos: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== propio) externos.push(request.url());
  });

  await page.goto("automation-sprint/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Más control del proceso");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,follow");
  await expect(page.locator("[data-aichat]")).toHaveCount(0);
  await expect(page.locator("[data-analytics]")).toHaveCount(0);
  await expect(page.locator("form")).toHaveCount(0);
  await expect(page.getByText(/esquema ilustrativo/i)).toBeVisible();
  await expect(page.getByText(/no es un flujo instalado ni un caso de cliente/i)).toBeVisible();
  await expect(page.locator("#alcance")).toContainText("950–1.900 € + IVA");

  const contactLink = page.getByRole("link", { name: /Cuéntanos qué proceso se repite/i }).first();
  await expect(contactLink).toHaveAttribute("href", /^mailto:varinoagency@gmail\.com\?/);
  const html = await page.locator("body").innerText();
  expect(html).not.toContain("ngrok-free.dev");
  expect(externos, "la landing no debe llamar servicios externos al cargar").toEqual([]);

  const accesibilidad = await new AxeBuilder({ page }).analyze();
  expect(accesibilidad.violations.filter((violation) => ["serious", "critical"].includes(violation.impact || ""))).toEqual([]);
});

test("la plantilla DPA permanece oculta hasta aprobación de identidad y seguridad", async ({ page }) => {
  await page.goto("dpa/");
  await expect(page.getByRole("status")).toContainText(/no publicable ni firmable/i);
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/\b\d{8}[A-Z]\b/i);
});

test("las páginas sectoriales se presentan como propuestas, no como proyectos implantados", async ({ page }) => {
  for (const path of ["sectores/", "sectores/clinicas/", "sectores/veterinarias/"]) {
    await page.goto(path);
    await expect(page.locator('main [role="note"]:not(aside)')).toContainText(/ejemplo de diseño, no un sistema implantado/i);
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
  }
});

test("las páginas sectoriales no prometen métricas inventadas ni decisiones clínicas o financieras automatizadas", async ({ page }) => {
  const rutas = [
    "sectores/clinicas/",
    "sectores/estetica/",
    "sectores/fertilidad/",
    "sectores/inmobiliarias/",
    "sectores/legal/",
    "sectores/oftalmologia/",
    "sectores/traumatologia/",
    "sectores/veterinarias/",
  ];
  const afirmacionesRetiradas = /70% de solicitudes|facturación (?:quirúrgica )?recuperada|incomparecencias reducidas|100% conforme al Art\. 9|entrega garantizada en 7 días|triaje (?:automatizado|automático) de urgencias|pre-KYC y verificación de fondos/i;

  for (const ruta of rutas) {
    await page.goto(ruta);
    await expect(page.locator('main [role="note"]:not(aside)')).toContainText(/ejemplo de diseño, no un sistema implantado/i);
    await expect(page.getByRole("heading", { name: "Lo que esta propuesta no hace" })).toBeVisible();
    expect(await page.locator("main").innerText()).not.toMatch(afirmacionesRetiradas);
  }
});

test("publica el dominio canonico y el logo de la pestaña", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://varinoai.me/");
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute("href", "/favicon.svg");
  await expect(page.locator('link[rel="shortcut icon"]')).toHaveAttribute("href", "/favicon.ico");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/apple-touch-icon.png");
});

test("distingue la llamada gratuita del Diagnóstico CAIO de pago", async ({ page }) => {
  await page.goto("precios/");
  await expect(page.getByRole("heading", { name: "Diagnóstico CAIO" })).toBeVisible();
  await expect(page.getByText("290 € + IVA").first()).toBeVisible();
  await expect(page.getByText(/llamada de encaje gratuita de 30 minutos, sin informe ni entregable/i)).toBeVisible();
  await expect(page.getByText(/auditoría gratuita/i)).toHaveCount(0);

  await page.goto("auditoria/");
  await expect(page.getByText(/llamada de encaje no tiene coste y no incluye informe ni entregable/i)).toBeVisible();
  await expect(page.getByText(/Diagnóstico CAIO cuesta 290 € \+ IVA/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Preparar correo/i })).toBeVisible();
});

test("muestra límites claros en cada paquete antes de pedir contacto", async ({ page }) => {
  await page.goto("precios/");
  const main = page.locator("main");
  await expect(main).toContainText("1 proceso, 1 flujo de trabajo y 1 integración estándar");
  await expect(main).toContainText("hasta 3 flujos conectados y 4 integraciones estándar");
  await expect(main).toContainText("1 caso de uso y asistente, hasta 3 flujos y 3 integraciones");
  await expect(main).toContainText("Si el caso supera estos límites, se presupuesta por separado.");
  await expect(main).toContainText("950–1.900 € + IVA");
  await expect(main).toContainText("2.500–6.000 € + IVA");
  await expect(main).toContainText("Desde 5.500 € + IVA");

  await page.goto("planes/");
  await expect(page.getByText(/contratación y cobro online desactivados/i)).toBeVisible();
  const planes = (await page.locator("body").innerText()).toLowerCase();
  expect(planes).not.toMatch(/factura automática|stripe/);
  await expect(page.getByText("149 €/mes + IVA").first()).toBeVisible();
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
  const guide = page.locator("[data-ai-guide]");
  const caja = guide.getByLabel("Escribe tu mensaje");
  const esperar = () => page.waitForFunction(() => !document.querySelector(".ai-message--pending"));

  await caja.fill("Tenemos una clínica dental en Valencia");
  await caja.press("Enter");
  await esperar();
  await expect(guide.locator("[data-guide-status]")).toHaveText("Guía interactiva en navegador");
  await expect(guide.locator("[data-guide-status]")).not.toContainText(/modelo local activo/i);

  await caja.fill("Perdemos citas porque las peticiones llegan por WhatsApp y teléfono");
  await caja.press("Enter");
  await esperar();
  await caja.fill("Recepción las apunta a mano en un Excel y confirma llamando");
  await caja.press("Enter");
  await esperar();

  await expect(guide.locator("[data-service]")).toHaveText("IA privada");
  await expect(guide.locator("[data-budget]")).toBeVisible();
  await expect(guide.locator("[data-budget-hours]")).not.toHaveText("—");
  await expect(guide.locator("[data-hardware]")).toContainText(/GB de memoria unificada/i);
  // El modelo se nombra con una etiqueta que existe en Ollama. "Qwen 27B" no
  // existe y estuvo escrito en el producto: la prueba impide que vuelva.
  await expect(page.locator("[data-hardware]")).not.toContainText(/27\s?B/i);

  expect(externas, "la guía publicada no debe llamar a ningún servicio").toEqual([]);
  expect(errores).toEqual([]);
});

test("el formulario publicado no afirma guardar solicitudes sin backend", async ({ page }) => {
  const bloqueos: string[] = [];
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
  page.on("console", (msg) => {
    if (msg.type() === "error" && /content security policy/i.test(msg.text())) bloqueos.push(msg.text());
  });

  await page.goto("contacto/");
  const form = page.locator("#form-contacto");
  await page.getByLabel("Nombre completo").fill("Cliente de prueba");
  await form.getByLabel("Email", { exact: true }).fill("prueba@example.com");
  await page.getByLabel("Empresa / organización").fill("Clínica Norte");
  await page.getByLabel("Sitio web o software").fill("https://clinicanorte.example");
  await page.getByLabel("Detalles del proyecto").fill("Automatizar la entrada de citas con aprobación humana.");

  await page.getByRole("button", { name: /preparar correo/i }).click();
  await expect(page.locator("[data-form-status]")).toContainText(/no se ha enviado ni guardado/i);
  await expect(page.getByText(/nada se envía ni se guarda/i)).toBeVisible();

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

  expect(bloqueos).toEqual([]);
});

test("el laboratorio publica tres demos n8n descargables y seguras", async ({ page }) => {
  const respuestas: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400) respuestas.push(`${response.status()} ${response.url()}`);
  });

  await page.goto("demos/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Te enseñamos cómo se comporta");
  await expect(page.locator("#clinica")).toContainText("IA privada · Desde 5.500 € + IVA");
  await expect(page.locator("#crecimiento")).toContainText("Sistema de crecimiento · 2.500–6.000 € + IVA");
  await expect(page.locator("#operaciones")).toContainText("Automation Sprint · 950–1.900 € + IVA");

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
