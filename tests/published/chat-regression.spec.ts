import { test, expect } from '@playwright/test';

test('el chat desconectado ofrece una ruta útil y no finge ser IA', async ({ page }) => {
  const backendRequests: string[] = [];
  page.on('request', request => {
    if (/\/webhook\/|ollama|ngrok/i.test(request.url())) backendRequests.push(request.url());
  });

  await page.goto('/');
  await expect(page.locator('[data-aichat-open]')).toHaveText(/Guía VARINO/);
  await page.locator('[data-aichat-open]').click();
  await expect(page.locator('[data-aichat-offline]')).toBeVisible();
  await expect(page.locator('[data-aichat-offline]')).toContainText('La IA conversacional no está conectada');
  await expect(page.locator('[data-aichat-form]')).toHaveCount(0);
  await expect(page.locator('[data-aichat-lead]')).toHaveCount(0);
  await expect(page.locator('[data-aichat-offline] a').first()).toHaveAttribute('href', /experiencia/);

  await page.locator('[data-aichat-close]').click();
  await page.locator('[data-aichat-open]').click();
  await expect(page.locator('[data-aichat-offline]')).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(backendRequests).toEqual([]);
});
