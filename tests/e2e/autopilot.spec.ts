import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("Autopilot muestra su estado real y no aparenta tener el backend activo", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ authenticated: false }) }));
  await page.route("**/api/auth/google/start", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "sign_in_unavailable" }) }));

  await page.goto("/app/");
  await expect(page.getByRole("heading", { name: "Tu espacio de trabajo." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeVisible();
  await expect(page.getByText(/No pedimos acceso a Gmail/i)).toBeVisible();
  await expect(page.getByText(/Un plan validado queda guardado como borrador/i)).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,follow");

  await page.getByRole("button", { name: "Continuar con Google" }).click();
  await expect(page.getByRole("status")).toContainText(/aún no está configurado/i);
});

test("un propietario guarda y vuelve a ver un borrador sin ejecutar", async ({ page }) => {
  const saved = [];
  await page.route("**/api/auth/session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      authenticated: true,
      user: { email: "owner@example.test" },
      workspaces: [{ id: "workspace-test", name: "Equipo de prueba", role: "OWNER" }],
    }),
  }));
  await page.route("**/api/automations**", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ automations: saved, executable: false }) });
    }
    const plan = route.request().postDataJSON().plan;
    const key = route.request().headers()["idempotency-key"];
    expect(key).toMatch(/^[A-Za-z0-9._:-]{16,128}$/);
    expect(plan.trigger).toEqual({ kind: "manual" });
    expect(plan.requiredIntegrations).toEqual([]);
    expect(plan.steps[0].kind).toBe("summarize");
    const automation = {
      id: "automation-test",
      name: plan.name,
      objective: plan.objective,
      status: "draft",
      autonomy: "safe",
      version: 1,
      riskLevel: "low",
      approvalRequired: false,
      executable: false,
    };
    saved.splice(0, saved.length, automation);
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ created: true, automation }) });
  });

  await page.goto("/app/");
  await expect(page.getByRole("heading", { name: "Tus espacios" })).toBeVisible();
  await page.getByLabel("Nombre del borrador").fill("Resumen de solicitudes");
  await page.getByLabel("¿Qué quieres resumir manualmente?").fill("Preparar un resumen manual de solicitudes entrantes para revisarlo en equipo.");
  await page.getByRole("button", { name: "Guardar borrador" }).click();

  await expect(page.getByRole("status")).toContainText("No se ha ejecutado");
  await expect(page.getByText("Resumen de solicitudes", { exact: true })).toBeVisible();
  await expect(page.getByText(/Borrador · versión 1 · low · no ejecutable/)).toBeVisible();
});

test("el acceso Autopilot no tiene fallos axe serios o críticos", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ authenticated: false }) }));
  await page.goto("/app/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact || ""))).toEqual([]);
});
