import { expect, test } from "@playwright/test";

test("uses VARINO identity and exposes the selected V.I mark", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "VARINO, inicio" })).toBeVisible();
  await expect(page.locator('[data-logo="vi-monogram"]').first()).toBeVisible();
});

test("respects and persists a manual theme choice", async ({ page }) => {
  await page.goto("/");

  const toggle = page.getByRole("button", { name: /tema/i });
  const startedDark = await page.locator("html").evaluate((element) =>
    element.classList.contains("dark"),
  );

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", String(!startedDark));
  await page.reload();

  expect(
    await page.locator("html").evaluate((element) => element.classList.contains("dark")),
  ).toBe(!startedDark);
});
