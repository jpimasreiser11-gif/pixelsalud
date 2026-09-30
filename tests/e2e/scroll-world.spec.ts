import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("la portada empieza limpia y conserva sus demostraciones honestas", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Menos trabajo repetitivo/i })).toBeVisible();
  await expect(page.locator("[data-scroll-world]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /De una tarea repetitiva a un sistema claro/i })).toBeVisible();
  await expect(page.getByText("ESCENARIO DEMOSTRATIVO").first()).toBeVisible();
  await expect(page.getByText(/No representan clientes ni resultados inventados/i)).toBeVisible();
});

test("las demos usan profundidad ligada al scroll como mejora progresiva", async ({ page }) => {
  await page.goto("/");
  const cards = page.locator(".demo-flow-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(2).getByRole("heading", { name: "De una bandeja manual a un flujo observable" })).toBeVisible();

  const supportsScrollTimeline = await page.evaluate(() =>
    CSS.supports("animation-timeline", "view()") && CSS.supports("animation-range", "entry 0% cover 35%"),
  );
  if (supportsScrollTimeline) {
    const motions = await cards.evaluateAll((elements) => elements.map((element) => {
      const style = getComputedStyle(element);
      return { timeline: style.animationTimeline, animation: style.animationName, opacity: style.opacity };
    }));
    for (const motion of motions) {
      expect(motion.timeline).toContain("view");
      expect(motion.animation).toContain("demo-flow-arrive");
      expect(motion.opacity).toBe("1");
    }
  }
});

test("las demos permanecen estáticas cuando se prefiere movimiento reducido", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const card = page.locator(".demo-flow-card").first();
  await expect(card).toBeVisible();
  await expect(card.getByRole("heading", { name: "Solicitudes y documentación bajo control" })).toBeVisible();
  const animationName = await card.evaluate((element) => getComputedStyle(element).animationName);
  expect(animationName).toBe("none");
});

test("la portada no tiene fallos axe serios o críticos", async ({ page }) => {
  // Escanea la versión accesible con movimiento reducido; las animaciones
  // de entrada no deben dejar texto a media opacidad durante el análisis.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact || ""))).toEqual([]);
});
