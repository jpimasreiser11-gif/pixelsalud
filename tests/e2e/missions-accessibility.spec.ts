import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const keyRoutes = [
  ["home", "/"],
  ["services", "/servicios/"],
  ["pricing", "/precios/"],
  ["monthly plans", "/planes/"],
  ["contact form", "/contacto/"],
  ["booking form", "/reservar/"],
  ["interactive experience", "/experiencia/"],
  ["audit", "/auditoria/"],
  ["case studies", "/casos/"],
  ["technical demos", "/demos/"],
  ["method", "/metodo/"],
  ["security", "/seguridad/"],
  ["tool comparison", "/n8n-vs-zapier-make/"],
  ["about", "/sobre/"],
  ["resources", "/recursos/"],
  ["local AI resource", "/recursos/ia-local-datos-sensibles/"],
  ["automation pricing resource", "/recursos/presupuesto-automatizacion/"],
  ["appointments resource", "/recursos/solicitudes-citas-whatsapp/"],
  ["legal notice", "/aviso-legal/"],
  ["guarantees", "/garantias/"],
  ["sector index", "/sectores/"],
  ["clinics sector", "/sectores/clinicas/"],
  ["sector landing", "/sectores/consultoras/"],
  ["aesthetics sector", "/sectores/estetica/"],
  ["fertility sector", "/sectores/fertilidad/"],
  ["real-estate sector", "/sectores/inmobiliarias/"],
  ["legal sector", "/sectores/legal/"],
  ["ophthalmology sector", "/sectores/oftalmologia/"],
  ["traumatology sector", "/sectores/traumatologia/"],
  ["veterinary sector", "/sectores/veterinarias/"],
  ["automation sprint", "/servicios/automation-sprint/"],
  ["private AI service", "/servicios/ia-privada/"],
  ["growth system service", "/servicios/sistema-crecimiento/"],
  ["privacy", "/privacidad/"],
  ["cookies", "/cookies/"],
  ["data-processing agreement", "/dpa/"],
] as const;

for (const [name, route] of keyRoutes) {
  test(`${name} has no axe findings`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(route, { waitUntil: "networkidle" });
    await expect(page.locator("main")).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const findings = results.violations.flatMap((violation) =>
      violation.nodes.map((node) => `${violation.impact ?? "unknown"} ${violation.id} ${node.target.join(" ")}`),
    );
    expect(findings, `${route}: ${findings.join("; ")}`).toEqual([]);
  });
}

for (const [name, route] of keyRoutes) {
  test(`${name} has no axe findings in dark theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(route, { waitUntil: "networkidle" });
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.waitForFunction(() =>
      document.getAnimations()
        .filter((animation) => animation.constructor.name === "CSSTransition")
        .every((animation) => animation.playState !== "running"),
    );
    const results = await new AxeBuilder({ page }).analyze();
    const findings = results.violations.flatMap((violation) =>
      violation.nodes.map((node) => `${violation.impact ?? "unknown"} ${violation.id} ${node.target.join(" ")}`),
    );
    expect(findings, `${route} dark theme: ${findings.join("; ")}`).toEqual([]);
  });
}

test("key content stays visible when JavaScript is unavailable", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Menos trabajo repetitivo/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /De una tarea repetitiva a un sistema claro/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Reservar llamada/i })).toBeVisible();
  await context.close();
});
