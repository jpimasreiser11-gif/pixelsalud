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

test("marks the current service section and restores focus when the mobile menu closes", async ({ page, isMobile }) => {
  await page.goto("/servicios/automation-sprint/");

  const menuButton = isMobile ? page.getByRole("button", { name: "Menú" }) : null;
  if (menuButton) await menuButton.click();

  const navigation = page.getByRole("navigation", {
    name: isMobile ? "Navegación móvil" : "Navegación principal",
  });
  const servicesLink = navigation.getByRole("link", { name: "Servicios" });
  await expect(servicesLink).toHaveAttribute("aria-current", "location");

  if (menuButton) {
    await expect(servicesLink).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(navigation).toBeHidden();
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await expect(menuButton).toBeFocused();
  }
});

test("mobile navigation controls meet the 44px touch-target floor", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Touch target dimensions apply to the mobile layout.");
  await page.goto("/");

  const dimensions = await page.locator("#theme-toggle-btn, #menu-btn").evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );
  expect(dimensions).toHaveLength(2);
  for (const target of dimensions) {
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  }
});
