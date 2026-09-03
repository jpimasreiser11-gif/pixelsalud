import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("la portada empieza limpia y sin la antigua entrada de scroll", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Menos trabajo repetitivo/i })).toBeVisible();
  await expect(page.locator("[data-scroll-world]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Diseñemos tu sistema juntos/i })).toBeVisible();
  await expect(page.getByText("ESCENARIO DEMOSTRATIVO").first()).toBeVisible();
  await expect(page.getByText(/No representan clientes ni resultados inventados/i)).toBeVisible();
});

test("la portada no tiene fallos axe serios o críticos", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact || ""))).toEqual([]);
});
