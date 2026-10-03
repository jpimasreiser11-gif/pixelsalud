import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

export function registerDemoContracts() {
  test("tres recorridos muestran exactamente los nodos y ejemplos descargables sin llamadas operativas", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const outbound: string[] = [];
    page.on("request", (request) => {
      if (/\/api\/|\/webhook\//.test(new URL(request.url()).pathname)) outbound.push(request.url());
    });
    await page.goto("/demos/");
    await expect(page.locator("[data-demo-runthrough]")).toHaveCount(3);
    for (const key of ["clinica", "crecimiento", "operaciones"]) {
      const demo = page.locator(`[data-demo-case="${key}"]`);
      await expect(demo.getByRole("listitem")).toHaveCount(3);
      const download = demo.getByRole("link", { name: "Descargar flujo n8n" });
      const href = await download.getAttribute("href");
      const response = await page.request.get(new URL(href!, page.url()).href);
      expect(response.ok()).toBe(true);
      const workflow = await response.json();
      expect(workflow.active).toBe(false);
      const serviceHref = await demo.getByRole("link", { name: "Ver alcance y precio" }).getAttribute("href");
      expect(serviceHref).toMatch(/^\/servicios\/(ia-privada|sistema-crecimiento|automation-sprint)\/$/);
      expect((await page.request.get(new URL(serviceHref!, page.url()).href)).ok()).toBe(true);
      await expect(demo.locator("[data-demo-step] h3")).toHaveText(workflow.nodes.slice(1).map((node: { name: string }) => node.name));
      for (const field of workflow.nodes[1].parameters.assignments.assignments) await expect(demo).toContainText(String(field.value));
      await demo.getByRole("button", { name: "Ver recorrido", exact: true }).click();
      await expect(demo.getByRole("status")).toContainText(/Vista previa completada.*pendiente de revisión humana/i);
      await expect(demo.locator('[aria-current="step"]')).toContainText("PARAR -");
      await expect(demo.locator('[aria-current="step"]')).toHaveCount(1);
    }
    expect(outbound).toEqual([]);
  });

  test("pausar, retroceder y reiniciar no bloquean la entrada ni se sobreescriben por un temporizador", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/demos/");
    const demo = page.locator("#clinica");
    await expect(demo.locator("[data-demo-controls]")).toBeVisible();
    await page.clock.install();
    await demo.getByRole("button", { name: "Ver recorrido", exact: true }).click();
    const pause = demo.getByRole("button", { name: "Pausar recorrido" });
    await expect(pause).toBeEnabled();
    await pause.click();
    await page.clock.runFor(6000);
    await expect(demo).toHaveAttribute("data-demo-state", "paused");
    await expect(demo.locator('[aria-current="step"] h3')).toHaveText("Solicitud sintética");
    await demo.getByRole("button", { name: "Siguiente", exact: true }).click();
    await expect(demo.locator('[aria-current="step"] h3')).toHaveText("Validar y minimizar");
    await demo.getByRole("button", { name: "Anterior", exact: true }).click();
    await expect(demo.locator('[aria-current="step"] h3')).toHaveText("Solicitud sintética");
    await demo.getByRole("button", { name: "Reiniciar", exact: true }).click();
    await page.clock.runFor(6000);
    await expect(demo).toHaveAttribute("data-demo-state", "idle");
    await expect(demo.locator('[aria-current="step"]')).toHaveCount(0);
  });

  test("teclado y selección directa funcionan en cada caso sin cambiar los otros", async ({ page }) => {
    await page.goto("/demos/");
    const demo = page.locator("#crecimiento");
    const first = demo.getByRole("button", { name: /Explorar paso 1/ });
    await first.focus();
    await first.press("End");
    const last = demo.getByRole("button", { name: /Explorar paso 3/ });
    await expect(last).toBeFocused();
    await expect(demo.locator('[aria-current="step"] h3')).toHaveText("PARAR - revisión comercial");
    await last.press("ArrowLeft");
    await expect(demo.getByRole("button", { name: /Explorar paso 2/ })).toBeFocused();
    await expect(demo.locator('[aria-current="step"] h3')).toHaveText("Validar y priorizar");
    await page.locator("#operaciones").getByRole("button", { name: /Explorar paso 2/ }).click();
    await expect(page.locator('#operaciones [aria-current="step"] h3')).toHaveText("Validar y enrutar");
    await expect(page.locator('#clinica [aria-current="step"]')).toHaveCount(0);
    await expect(demo.locator('[aria-current="step"] h3')).toHaveText("Validar y priorizar");
  });

  test("activar movimiento reducido durante la reproducción elimina desplazamiento y completa la vista estática", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/demos/");
    const demo = page.locator("#operaciones");
    await demo.getByRole("button", { name: "Ver recorrido", exact: true }).click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(demo).toHaveAttribute("data-demo-state", "complete");
    await expect(demo.locator('[aria-current="step"]')).toHaveCSS("transform", "none");
    await demo.getByRole("button", { name: "Anterior", exact: true }).click();
    await expect(demo.locator('[aria-current="step"] h3')).toHaveText("Validar y enrutar");
  });

  test("sin JavaScript conserva los tres ejemplos y las descargas, sin controles muertos", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto(new URL("/demos/", baseURL).href);
      await expect(page.locator("[data-demo-runthrough]")).toHaveCount(3);
      await expect(page.getByRole("link", { name: "Descargar flujo n8n" })).toHaveCount(3);
      await expect(page.getByRole("button", { name: /Ver recorrido|Explorar paso/ })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Validar y enrutar", exact: true })).toBeVisible();
    } finally { await context.close(); }
  });

  test("controles táctiles, tema oscuro y contraste alto conservan lectura y foco", async ({ page }) => {
    await page.goto("/demos/");
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.emulateMedia({ contrast: "more" });
    const demo = page.locator("#clinica");
    const select = demo.getByRole("button", { name: /Explorar paso 2/ });
    await select.focus();
    await expect(select).toHaveCSS("outline-width", "3px");
    for (const control of await demo.getByRole("button").all()) {
      const box = await control.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await select.click();
    const results = await new AxeBuilder({ page }).include("[data-demo-runthrough]").analyze();
    expect(results.violations).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflow).toBe(false);
  });
}
