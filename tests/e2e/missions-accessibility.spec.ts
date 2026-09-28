import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const keyRoutes = [
  ["home", "/"],
  ["services", "/servicios/"],
  ["pricing", "/precios/"],
  ["monthly plans", "/planes/"],
  ["contact form", "/contacto/"],
  ["booking form", "/reservar/"],
  ["interactive experience", "/experiencia/"],
  ["sector landing", "/sectores/consultoras/"],
  ["privacy", "/privacidad/"],
  ["cookies", "/cookies/"],
  ["data-processing agreement", "/dpa/"],
] as const;

for (const [name, route] of keyRoutes) {
  test(`${name} has no serious or critical axe findings`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(route, { waitUntil: "networkidle" });
    await expect(page.locator("main")).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations
      .filter((violation) => ["serious", "critical"].includes(violation.impact || ""))
      .flatMap((violation) => violation.nodes.map((node) => {
        const contrast = node.any.find((item) => item.id === "color-contrast")?.data;
        return `${violation.id} ${node.target.join(" ")} ${contrast?.fgColor ?? ""}/${contrast?.bgColor ?? ""}`;
      }));
    expect(serious.length, `${route}: ${serious.join("; ")}`).toBe(0);
  });
}

for (const [name, route] of keyRoutes) {
  test(`${name} has no serious or critical findings in dark theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(route, { waitUntil: "networkidle" });
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.waitForFunction(() =>
      document.getAnimations()
        .filter((animation) => animation.constructor.name === "CSSTransition")
        .every((animation) => animation.playState !== "running"),
    );
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations
      .filter((violation) => ["serious", "critical"].includes(violation.impact || ""))
      .flatMap((violation) => violation.nodes.map((node) => {
        const contrast = node.any.find((item) => item.id === "color-contrast")?.data;
        return `${violation.id} ${node.target.join(" ")} ${contrast?.fgColor ?? ""}/${contrast?.bgColor ?? ""}`;
      }));
    expect(serious.length, `${route} dark theme: ${serious.join("; ")}`).toBe(0);
  });
}

test("key content stays visible when JavaScript is unavailable", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Menos trabajo repetitivo/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /De una tarea repetitiva a un sistema claro/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Reservar llamada/i })).toBeVisible();
  await context.close();
});
