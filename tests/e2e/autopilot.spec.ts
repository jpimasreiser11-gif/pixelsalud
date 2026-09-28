import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("Autopilot muestra su estado real y no aparenta tener el backend activo", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ authenticated: false }) }));
  await page.route("**/api/auth/google/start", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "sign_in_unavailable" }) }));

  await page.goto("/app/");
  await expect(page.getByRole("heading", { name: "Tu espacio de trabajo." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeVisible();
  await expect(page.getByText(/No pedimos acceso a Gmail/i)).toBeVisible();
  await expect(page.getByText(/No hay ejecuciones ni conexiones externas activas/i)).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,follow");

  await page.getByRole("button", { name: "Continuar con Google" }).click();
  await expect(page.getByRole("status")).toContainText(/aún no está configurado/i);
});

test("el acceso Autopilot no tiene fallos axe serios o críticos", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ authenticated: false }) }));
  await page.goto("/app/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact || ""))).toEqual([]);
});
