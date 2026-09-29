import { expect, test } from "@playwright/test";

test("la visualización recorre el flujo n8n sintético y termina en revisión humana", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const outboundAutomationCalls: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/|\/webhook\//.test(new URL(request.url()).pathname)) {
      outboundAutomationCalls.push(request.url());
    }
  });

  await page.goto("/demos/");

  const simulation = page.locator("[data-demo-runthrough]");
  await expect(simulation.getByRole("heading", { name: /Una solicitud entra/i })).toBeVisible();
  await expect(simulation.getByText("demo-clinic-001")).toBeVisible();
  await expect(simulation.getByRole("listitem")).toHaveCount(3);
  await expect(simulation.getByRole("status")).toContainText(/no se ha ejecutado n8n/i);

  await simulation.getByRole("button", { name: "Ver recorrido" }).click();
  await expect(simulation.getByRole("status")).toContainText(/Vista previa completada.*pendiente de revisión humana/i, { timeout: 5000 });
  await expect(simulation.locator('[data-demo-step][aria-current="step"]')).toHaveCount(1);
  await expect(simulation.locator('[data-demo-step][aria-current="step"]')).toContainText(/PARAR - revisión de recepción/);
  await expect(simulation.getByText(/No se ejecutó n8n ni se guardaron o enviaron datos/i)).toBeVisible();
  expect(outboundAutomationCalls).toEqual([]);
});
