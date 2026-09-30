import { expect, test } from "@playwright/test";

test("appointment hover styling is limited to precise pointers and remains keyboard-visible", async ({ page }) => {
  await page.goto("/reservar/");

  await page.evaluate(() => {
    const probe = document.createElement("button");
    probe.type = "button";
    probe.id = "slot-motion-probe";
    probe.className = "slot-btn";
    probe.textContent = "Hora de prueba";
    probe.style.cssText = "position: fixed; top: 18rem; left: 1rem; width: 10rem; min-height: 2.75rem; z-index: 1000;";
    document.body.prepend(probe);
  });

  const precisePointer = await page.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches);
  const isMobileProject = test.info().project.name === "mobile";
  expect(precisePointer).toBe(!isMobileProject);

  const slot = page.locator("#slot-motion-probe");
  const beforeHover = await slot.evaluate((element) => getComputedStyle(element).backgroundColor);
  await slot.hover();
  await expect.poll(() => slot.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe(isMobileProject ? beforeHover : "rgb(240, 247, 255)");

  await page.keyboard.press("Tab");
  await expect(slot).toBeFocused();
  await expect(slot).toHaveCSS("outline-width", "2px");
});

test("primary actions use restrained press feedback and remove movement for reduced motion", async ({ page }) => {
  await page.goto("/reservar/");
  await page.evaluate(() => {
    const probe = document.createElement("button");
    probe.type = "button";
    probe.id = "press-motion-probe";
    probe.className = "button-primary";
    probe.textContent = "Acción de prueba";
    document.body.append(probe);
  });

  const button = page.locator("#press-motion-probe");
  await button.hover();
  await page.mouse.down();
  await page.waitForFunction(() => {
    const element = document.getElementById("press-motion-probe");
    if (!element) return false;
    const scale = new DOMMatrixReadOnly(getComputedStyle(element).transform).a;
    return Math.abs(scale - 0.98) < 0.003;
  });
  const transform = await button.evaluate((element) => getComputedStyle(element).transform);
  const scale = await button.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).a);
  expect(transform).not.toBe("none");
  expect(scale).toBeCloseTo(0.98, 2);
  await page.mouse.up();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await button.hover();
  await page.mouse.down();
  await expect(button).toHaveCSS("transform", "none");
  await page.mouse.up();
});
