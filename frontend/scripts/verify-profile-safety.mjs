import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.APP_URL || 'http://127.0.0.1:3101';
const out = '../.mozak/evidence/profile-flow/browser';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
const checks = [];
async function check(name, fn) { await fn(); checks.push({ name, passed: true }); console.log('PASS', name); }
try {
  await check('Profile API rejects cross-origin, invalid step, empty and oversized inputs', async () => {
    const api = ctx.request;
    for (const [headers, data, status] of [
      [{}, { step: 0, text: 'Student' }, 403],
      [{ Origin: 'https://example.org' }, { step: 0, text: 'Student' }, 403],
      [{ Origin: base }, { step: 3, text: 'Student' }, 400],
      [{ Origin: base }, { step: 0, text: '' }, 400],
      [{ Origin: base }, { step: 0, text: 'x'.repeat(3000) }, 413],
    ]) expect((await api.post(`${base}/api/zagreb/profile`, { headers, data })).status()).toBe(status);
  });
  await check('Live extraction preserves negative preferences without positive tag or third-party inference', async () => {
    const response = await ctx.request.post(`${base}/api/zagreb/profile`, { headers: { Origin: base }, data: { step: 1, text: 'Ne volim nogomet. Volim glazbu. Moja sestra voli tenis.' } });
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.items.some(i => /Ne volim nogomet/i.test(i.text) && i.topic === 'none')).toBe(true);
    expect(data.items.some(i => /Volim glazbu/i.test(i.text) && i.topic === 'glazba')).toBe(true);
    expect(data.items.some(i => /sestra/i.test(i.text) || i.topic === 'sport')).toBe(false);
  });
  const page = await ctx.newPage();
  await page.route('**/api/zagreb/profile', r => r.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'Pokušaj ponovno.' }) }));
  await page.goto(base);
  await check('Profile error preserves question and answer for retry', async () => {
    await page.getByLabel('Tvoj odgovor', { exact: true }).fill('Ja sam student.');
    await page.getByRole('button', { name: /Idemo|Dalje/, exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Pokušaj ponovno.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Kako bi se opisao/la?', exact: true })).toBeVisible();
    await expect(page.getByLabel('Tvoj odgovor', { exact: true })).toHaveValue('Ja sam student.');
    await expect(page.getByTestId('profile-fact')).toHaveCount(0);
    await expect(page.getByTestId('zagreb-map')).toHaveCount(0);
  });
  await check('Microphone denial keeps typed fallback usable', async () => {
    await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); }; });
    await page.getByRole('button', { name: 'Pritisni i govori', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: /Mikrofon/ })).toBeVisible();
    await expect(page.getByLabel('Tvoj odgovor', { exact: true })).toBeEnabled();
  });
} finally { await writeFile(`${out}/safety-results.json`, JSON.stringify({ checks, errorResponseMocked: true, liveNegationCheck: true }, null, 2)); await browser.close(); }
