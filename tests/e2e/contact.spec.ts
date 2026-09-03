import { expect, test } from "@playwright/test";

test("contacto permite preparar el briefing sin fingir un envío", async ({ page }) => {
  await page.goto("/contacto/");
  const submit = page.getByRole("button", { name: /copiar briefing|preparar correo/i });
  await expect(submit).toBeEnabled();
  await expect(page.getByText(/nada se envía ni se almacena/i)).toBeVisible();
  await page.getByLabel("Nombre completo").fill("Cliente de prueba");
  await page.getByLabel("Empresa / organización").fill("Clínica Norte");
  await page.getByLabel("Detalles del proyecto").fill("Automatizar la entrada de citas con aprobación humana.");
});
