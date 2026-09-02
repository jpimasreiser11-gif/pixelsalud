import { expect, test } from "@playwright/test";

test("guided mission explains a decision without claiming a result", async ({ page }) => {
  await page.goto("/experiencia/");
  await expect(page.getByRole("heading", { name: /Entender haciendo/i })).toBeVisible();
  await page.getByRole("tab", { name: /Operaciones/i }).click();
  await page.getByRole("button", { name: "Pausar y solicitar revisión" }).click();
  await expect(page.getByText(/Recuperación manual sin perder el registro/i)).toBeVisible();
  await expect(page.getByText(/No es un presupuesto ni el resultado de un cliente/i)).toBeVisible();
});

test("custom case remains local and can be transferred explicitly", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", (request) => { if (request.method() !== "GET") posts.push(request.url()); });
  await page.goto("/experiencia/");
  await page.getByRole("tab", { name: /Tu situación/i }).click();
  await page.getByLabel("Sector").fill("Consultoría");
  await page.getByLabel("Objetivo").fill("Ordenar solicitudes");
  await page.getByLabel("Bloqueo principal").selectOption("manual");
  await expect(page.getByRole("heading", { name: "Automation Sprint" })).toBeVisible();
  await page.getByRole("button", { name: "Pasar al asesor" }).click();
  await expect(page.getByText(/Resumen preparado localmente/i)).toBeVisible();
  expect(posts).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.getItem("varino_advisor_import_v1"))).toContain("Consultoría");
});

test("mission draft can be reset", async ({ page }) => {
  await page.goto("/experiencia/");
  await page.getByRole("tab", { name: /Tu situación/i }).click();
  await page.getByLabel("Sector").fill("Agencia");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("varino_mission_draft_v1"))).toContain("Agencia");
  await page.getByRole("button", { name: "Reiniciar" }).click();
  await expect(page.getByLabel("Sector")).toHaveValue("");
});
