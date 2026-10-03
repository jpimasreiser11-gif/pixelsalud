import { expect, test } from "@playwright/test";

test("navigation respects reduced-transparency preference in light and dark themes", async ({ page }) => {
  await page.goto("/");
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
  });

  const header = page.locator("header.site-header");
  const mobileMenu = page.locator("#menu-movil");
  for (const element of [header, mobileMenu]) {
    await expect.poll(() => element.evaluate((node) => getComputedStyle(node).backdropFilter)).toBe("none");
  }

  await expect.poll(() => header.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgb(255, 255, 255)");
  await expect.poll(() => mobileMenu.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgb(255, 255, 255)");

  await page.locator("html").evaluate((node) => node.classList.add("dark"));
  await expect.poll(() => header.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgb(0, 0, 0)");
  await expect.poll(() => mobileMenu.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgb(0, 0, 0)");
});

test("navigation strengthens its boundaries for high-contrast preference", async ({ page }) => {
  await page.goto("/");
  await page.emulateMedia({ contrast: "more" });

  const header = page.locator("header.site-header");
  const mobileMenu = page.locator("#menu-movil");
  await expect.poll(() => header.evaluate((node) => getComputedStyle(node).borderBottomWidth)).toBe("2px");
  await expect.poll(() => header.evaluate((node) => getComputedStyle(node).borderBottomColor)).toBe("rgb(110, 110, 115)");
  await expect.poll(() => mobileMenu.evaluate((node) => getComputedStyle(node).borderTopWidth)).toBe("2px");
  await expect.poll(() => mobileMenu.evaluate((node) => getComputedStyle(node).borderTopColor)).toBe("rgb(110, 110, 115)");

  await page.locator("html").evaluate((node) => node.classList.add("dark"));
  await expect.poll(() => header.evaluate((node) => getComputedStyle(node).borderBottomColor)).toBe("rgb(161, 161, 166)");
  await expect.poll(() => mobileMenu.evaluate((node) => getComputedStyle(node).borderTopColor)).toBe("rgb(161, 161, 166)");
});
