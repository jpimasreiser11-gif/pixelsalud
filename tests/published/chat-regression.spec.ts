import { test, expect } from '@playwright/test';

test('la guía ofrece una ruta real y no presenta una ventana desconectada como IA', async ({ page }, testInfo) => {
  const backendRequests: string[] = [];
  page.on('request', request => {
    if (/\/webhook\/|ollama|ngrok/i.test(request.url())) backendRequests.push(request.url());
  });

  await page.goto('/');
  await expect(page.locator('[data-aichat]')).toHaveCount(0);
  await expect(page.locator('[data-aichat-offline]')).toHaveCount(0);
  await expect(page.getByText('Guía lista')).toBeVisible();

  if (testInfo.project.use.isMobile) {
    const floatingEntry = page.locator('.aichat-guide-entry');
    await expect(floatingEntry).toBeHidden();
    const headerEntry = page.getByRole('link', { name: 'Abrir guía interactiva' });
    await expect(headerEntry).toBeVisible();
    await headerEntry.click();
  } else {
    const floatingEntry = page.getByRole('link', { name: 'Explorar la guía interactiva de VARINO' });
    await expect(floatingEntry).toBeVisible();
    await floatingEntry.click();
  }

  const guide = page.locator('[data-ai-guide]');
  await expect(guide).toBeVisible();
  const input = guide.locator('[data-guide-form] textarea');
  await expect(input).toBeVisible();
  await input.fill('hola');
  await guide.locator('[data-guide-form] button').click();
  await expect(guide.locator('[data-guide-messages]')).toContainText('¡Hola! Claro, estoy aquí.');
  await expect(guide.locator('[data-guide-status]')).toHaveText('Guía lista');
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(backendRequests).toEqual([]);

  if (testInfo.project.use.isMobile) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(await page.evaluate(() => window.innerWidth));
  }
});

test('el acceso a la guía no cubre contenido en páginas móviles', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.use.isMobile, 'Comprobación específica de móvil');
  for (const path of ['/precios/', '/contacto/']) {
    await page.goto(path);
    await expect(page.getByRole('link', { name: 'Abrir guía interactiva' })).toBeVisible();
    await expect(page.locator('.aichat-guide-entry')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(await page.evaluate(() => window.innerWidth));
  }
});
