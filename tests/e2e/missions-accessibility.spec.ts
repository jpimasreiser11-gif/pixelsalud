import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("mission simulator has no serious or critical axe findings", async ({ page }) => {
  await page.goto("/experiencia/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact || ""))).toEqual([]);
});
