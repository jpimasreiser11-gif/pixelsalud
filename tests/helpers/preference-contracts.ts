import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

type Scheme = "light" | "dark";
type Preference = "transparency" | "contrast";

async function preferences(page: Page, scheme: Scheme, preference?: Preference) {
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: scheme },
      { name: "prefers-reduced-motion", value: "reduce" },
      { name: "prefers-reduced-transparency", value: preference === "transparency" ? "reduce" : "no-preference" },
      { name: "prefers-contrast", value: preference === "contrast" ? "more" : "no-preference" },
    ],
  });
  return session;
}

export function registerPreferenceTests() {
  for (const scheme of ["light", "dark"] as const) {
    for (const preference of ["transparency", "contrast"] as const) {
      test(`${scheme}: ${preference} preference keeps navigation opaque, readable and usable`, async ({ page, isMobile }) => {
        await preferences(page, scheme, preference);
        await page.goto("/");
        await expect(page.locator("html")).toHaveClass(scheme === "dark" ? /dark/ : /^(?!.*\bdark\b)/);
        expect(await page.evaluate((value) => matchMedia(value).matches,
          preference === "contrast" ? "(prefers-contrast: more)" : "(prefers-reduced-transparency: reduce)"),
        ).toBe(true);
        const header = page.locator("body > header");
        await expect(header).toHaveCSS("background-color", scheme === "dark" ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)");
        await expect(header).toHaveCSS("backdrop-filter", "none");
        const guide = page.locator(".ai-chat").first();
        await expect(guide).toHaveCSS("background-color", scheme === "dark" ? "rgb(15, 17, 23)" : "rgb(255, 255, 255)");
        if (preference === "contrast") {
          await expect(header).toHaveCSS("border-bottom-color", scheme === "dark" ? "rgb(161, 161, 166)" : "rgb(110, 110, 115)");
          const theme = page.getByRole("button", { name: /Cambiar a tema/ });
          await theme.focus();
          await expect(theme).toHaveCSS("outline-style", "solid");
          await expect(theme).toHaveCSS("outline-width", "3px");
          await expect(theme).toHaveCSS("outline-color", scheme === "dark" ? "rgb(245, 245, 247)" : "rgb(0, 63, 126)");
          const composer = guide.locator("textarea");
          await composer.focus();
          await expect(composer).toHaveCSS("outline-style", "solid");
          await expect(composer).toHaveCSS("outline-width", "3px");
        }
        if (isMobile) {
          await page.getByRole("button", { name: "Menú", exact: true }).click();
          const menu = page.getByRole("navigation", { name: "Navegación móvil" });
          await expect(menu).toBeVisible();
          await expect(menu).toHaveCSS("backdrop-filter", "none");
          await expect(menu).toHaveCSS("background-color", scheme === "dark" ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)");
          await menu.getByRole("link", { name: "Precios", exact: true }).click();
        } else {
          await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Precios", exact: true }).click();
        }
        await expect(page).toHaveURL(/\/precios\/$/);
        const toggle = page.getByRole("button", { name: /Cambiar a tema/ });
        await toggle.click();
        await expect(header).toHaveCSS("background-color", scheme === "dark" ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)");
        await expect(header).toHaveCSS("backdrop-filter", "none");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      });
    }
  }

  test("preference changes are reversible without overriding a manual theme", async ({ page }) => {
    const session = await preferences(page, "light", "transparency");
    await page.goto("/");
    const header = page.locator("body > header");
    const toggle = page.getByRole("button", { name: /Cambiar a tema/ });
    await toggle.click();
    await session.send("Emulation.setEmulatedMedia", { features: [
      { name: "prefers-color-scheme", value: "light" },
      { name: "prefers-reduced-motion", value: "reduce" },
      { name: "prefers-reduced-transparency", value: "no-preference" },
      { name: "prefers-contrast", value: "no-preference" },
    ] });
    const baseline = await header.evaluate((element) => getComputedStyle(element).backgroundColor);
    await session.send("Emulation.setEmulatedMedia", { features: [
      { name: "prefers-color-scheme", value: "light" },
      { name: "prefers-reduced-motion", value: "reduce" },
      { name: "prefers-reduced-transparency", value: "reduce" },
      { name: "prefers-contrast", value: "no-preference" },
    ] });
    await expect(header).toHaveCSS("background-color", "rgb(0, 0, 0)");
    await session.send("Emulation.setEmulatedMedia", { features: [
      { name: "prefers-color-scheme", value: "light" },
      { name: "prefers-reduced-motion", value: "reduce" },
      { name: "prefers-reduced-transparency", value: "no-preference" },
      { name: "prefers-contrast", value: "no-preference" },
    ] });
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(header).not.toHaveCSS("backdrop-filter", "none");
    await expect(header).toHaveCSS("background-color", baseline);
  });
}
