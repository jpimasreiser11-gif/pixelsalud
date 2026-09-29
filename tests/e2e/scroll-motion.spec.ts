import { expect, test } from "@playwright/test";

test("page content does not wait for a scroll reveal", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[data-reveal]")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveClass(/has-reveal-motion/);
  await expect(page.getByRole("heading", { name: /Menos trabajo repetitivo/i })).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByRole("heading", { name: /Menos trabajo repetitivo/i })).toBeVisible();
});

test("hover lift respects pointer capability and reduced-motion preference", async ({ page }) => {
  await page.goto("/");
  const cta = page.getByRole("link", { name: /Explorar mi caso/i });
  await cta.hover();

  const supportsFineHover = await page.evaluate(() =>
    window.matchMedia("(hover: hover) and (pointer: fine)").matches,
  );
  if (supportsFineHover) {
    await expect.poll(() => cta.evaluate((element) => getComputedStyle(element).transform)).not.toBe("none");
  } else {
    await expect.poll(() => cta.evaluate((element) => getComputedStyle(element).transform)).toBe("none");
  }

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => cta.evaluate((element) => getComputedStyle(element).transform)).toBe("none");
});
