import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // No personal data, CRM writes, or real model calls during UI tests.
  await page.route('**/webhook/**', async route => {
    await route.fulfill({ json: { ok: true, reply: 'Entendido. ¿Qué herramientas utilizas?' } });
  });
});

test('reabrir el chat no duplica el historial', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-aichat-open]').click();
  await page.locator('[data-aichat-input]').fill('Quiero automatizar presupuestos');
  await page.locator('[data-aichat-form]').getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.locator('.aichat-bubble').last()).toHaveText('Entendido. ¿Qué herramientas utilizas?');
  await page.locator('[data-aichat-close]').click();
  await page.locator('[data-aichat-open]').click();
  await expect(page.locator('.aichat-bubble')).toHaveCount(2);
});

test('el chat conserva más de ocho mensajes de contexto', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('varino_aichat_msgs', JSON.stringify(
    Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `Dato ${i}` }))
  )));
  await page.reload();
  await page.locator('[data-aichat-open]').click();
  await page.locator('[data-aichat-input]').fill('Continúa con lo que te he explicado');
  const request = page.waitForRequest('**/webhook/chat');
  await page.locator('[data-aichat-form]').getByRole('button', { name: 'Enviar', exact: true }).click();
  expect((await request).postDataJSON().history).toHaveLength(20);
});
