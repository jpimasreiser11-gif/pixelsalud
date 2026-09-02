import { expect, test } from "@playwright/test";

test("exposes the approved primary navigation", async ({ page, isMobile }) => {
  await page.goto("/");

  if (isMobile) {
    await page.getByRole("button", { name: "Menú" }).click();
  }

  const navigation = page.getByRole("navigation", {
    name: isMobile ? "Navegación móvil" : "Navegación principal",
  });
  await expect(navigation.getByRole("link", { name: "Servicios" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Método" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Seguridad" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Precios" })).toBeVisible();
});
