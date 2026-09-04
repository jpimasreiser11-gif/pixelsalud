import { expect, test } from "@playwright/test";

test("contacto prepara el briefing por correo con el canal real", async ({ page }) => {
  await page.goto("/contacto/");
  const submit = page.getByRole("button", { name: /preparar correo/i });
  await expect(submit).toBeEnabled();
  // El canal público ya está configurado: el email es visible y pulsable
  // (aparece en el bloque de contacto y también en el pie).
  await expect(page.getByRole("link", { name: /varinoagency@gmail\.com/i }).first()).toBeVisible();

  await page.getByLabel("Nombre completo").fill("Cliente de prueba");
  await page.getByLabel("Empresa / organización").fill("Clínica Norte");
  await page.getByLabel("Detalles del proyecto").fill("Automatizar la entrada de citas con aprobación humana.");

  // El envío abre la aplicación de correo del visitante (mailto). Nada se
  // envía ni se almacena desde la web: el mensaje sale desde su propio
  // correo, lo que además deja constancia en su bandeja.
  await submit.click();
  await expect(page.locator("[data-form-status]")).toContainText(/aplicación de correo/i);
});

test("el aviso legal identifica al titular con datos reales", async ({ page }) => {
  await page.goto("/aviso-legal/");
  await expect(page.getByText("Joan Pimas Reiser").first()).toBeVisible();
  await expect(page.getByText("20569591Q").first()).toBeVisible();
  await expect(page.getByText(/passeig de la rectoria vella/i).first()).toBeVisible();
});
