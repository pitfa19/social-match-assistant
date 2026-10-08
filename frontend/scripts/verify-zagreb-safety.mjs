import { chromium, expect } from '@playwright/test';
import { writeFile, readFile, readdir } from 'node:fs/promises';
const base = 'http://127.0.0.1:3101';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
const ctx = await browser.newContext({ reducedMotion: 'reduce' });
const checks = [];
async function check(name, fn) { await fn(); checks.push({ name, passed: true }); console.log('PASS', name); }
try {
  await check('Server request guards reject cross-origin, empty, oversized, invalid audio', async () => {
    const api = ctx.request;
    expect((await api.post(`${base}/api/zagreb/neighbourhood`, { data: { text: 'Maksimir' } })).status()).toBe(403);
    expect((await api.post(`${base}/api/zagreb/neighbourhood`, { headers: { Origin: 'https://example.org' }, data: { text: 'Maksimir' } })).status()).toBe(403);
    expect((await api.post(`${base}/api/zagreb/neighbourhood`, { headers: { Origin: base }, data: { text: '' } })).status()).toBe(400);
    expect((await api.post(`${base}/api/zagreb/neighbourhood`, { headers: { Origin: base }, data: { text: 'x'.repeat(3000) } })).status()).toBe(413);
    expect((await api.post(`${base}/api/zagreb/transcribe`, { headers: { Origin: base }, multipart: { audio: { name: 'test.txt', mimeType: 'text/plain', buffer: Buffer.alloc(250) } } })).status()).toBe(415);
  });
  await ctx.addInitScript(() => {
    window.__lateTracks = [];
    navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { window.__resolveMic = () => { const audio = new AudioContext(); const dest = audio.createMediaStreamDestination(); window.__lateTracks = dest.stream.getTracks(); resolve(dest.stream); }; });
  });
  const page = await ctx.newPage();
  await page.goto(base);
  await check('Closing during permission request stops late microphone and sends no clip', async () => {
    let posts = 0;
    page.on('request', r => { if (r.url().includes('/api/zagreb/')) posts++; });
    await page.getByRole('button', { name: 'Predstavi se', exact: true }).click();
    await page.getByRole('button', { name: 'Pritisni i govori', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.evaluate(() => window.__resolveMic());
    await expect.poll(() => page.evaluate(() => window.__lateTracks.length > 0 && window.__lateTracks.every(t => t.readyState === 'ended'))).toBe(true);
    expect(posts).toBe(0);
  });
  await check('Provider errors stay visible, retry enabled, no map movement', async () => {
    await page.route('**/api/zagreb/neighbourhood', r => r.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'Pokušaj ponovno ili upiši kvart.' }) }));
    await page.getByRole('button', { name: 'Predstavi se', exact: true }).click();
    await page.locator('#kvart').fill('Maksimir');
    await page.getByRole('button', { name: 'Idemo', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('status')).toContainText('Pokušaj ponovno');
    await expect(page.getByRole('button', { name: 'Idemo', exact: true })).toBeEnabled();
    await expect(page.getByTestId('zagreb-map')).toHaveAttribute('data-selected', '');
  });
  await check('Supplied secret values are absent from source and browser bundles', async () => {
    const env = await readFile('.env.local', 'utf8');
    const values = env.split('\n').filter(x => x.includes('=')).map(x => x.slice(x.indexOf('=') + 1)).filter(Boolean);
    async function scan(root) { for (const item of await readdir(root, { withFileTypes: true })) { const p = `${root}/${item.name}`; if (item.isDirectory()) await scan(p); else { const content = await readFile(p); for (const secret of values) if (content.includes(Buffer.from(secret))) throw new Error('Secret found in public/source file'); } } }
    await scan('src'); await scan('.next/static');
  });
} finally { await writeFile('../.mozak/evidence/zagreb-demo/browser/safety-results.json', JSON.stringify({ checks, errorPathUsesFixture: true }, null, 2)); await browser.close(); }
