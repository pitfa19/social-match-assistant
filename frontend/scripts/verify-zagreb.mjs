import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.APP_URL || 'http://127.0.0.1:3101';
const out = '../.mozak/evidence/zagreb-demo/browser';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${process.env.VOICE_FIXTURE || '/home/pitfa/.jcode/scratch/zagreb-hr-48.wav'}`] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, permissions: ['microphone'] });
await ctx.addInitScript(() => {
  window.__tracks = [];
  const original = navigator.mediaDevices?.getUserMedia.bind(navigator.mediaDevices);
  if (original) navigator.mediaDevices.getUserMedia = async c => { const s = await original(c); window.__tracks.push(...s.getTracks()); return s; };
});
const page = await ctx.newPage();
const checks = [], errors = [];
page.on('pageerror', e => errors.push(e.message));
async function check(name, fn) { await fn(); checks.push({ name, passed: true }); console.log('PASS', name); }
try {
  await page.goto(base);
  await check('Croatian hero, two actions, real map tiles', async () => {
    await expect(page.getByRole('heading', { name: 'Pričaj sa svojim gradom' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Predstavi se', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pretraži', exact: true })).toBeVisible();
    await expect.poll(() => page.locator('[data-testid="zagreb-map"] img').evaluateAll(imgs => imgs.length > 0 && imgs.every(i => i.complete && i.naturalWidth > 0)), { timeout: 20000 }).toBe(true);
    await page.screenshot({ path: `${out}/hero-desktop.png`, fullPage: true });
  });
  await check('Single question, full-page orb, focus trap and Escape', async () => {
    await page.getByRole('button', { name: 'Predstavi se', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Koji kvart te zanima?' })).toHaveCount(1);
    await page.waitForTimeout(650);
    await page.screenshot({ path: `${out}/orb-desktop.png`, fullPage: true });
    for (let i = 0; i < 7; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true); }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Predstavi se', exact: true })).toBeFocused();
  });
  await check('Actual microphone recording -> ElevenLabs -> Decisions -> map zoom (synthetic speech)', async () => {
    await page.getByRole('button', { name: 'Predstavi se', exact: true }).click();
    await page.waitForTimeout(650);
    const orb = page.getByRole('button', { name: 'Pritisni i govori', exact: true });
    const orbBox = await orb.boundingBox();
    await page.mouse.click(orbBox.x + orbBox.width / 2, orbBox.y + orbBox.height / 2);
    await expect(page.getByRole('button', { name: 'Zaustavi snimanje', exact: true })).toBeVisible();
    await page.waitForTimeout(5200);
    const stt = page.waitForResponse(r => r.url().endsWith('/api/zagreb/transcribe'));
    const decision = page.waitForResponse(r => r.url().endsWith('/api/zagreb/neighbourhood'));
    await page.getByRole('button', { name: 'Zaustavi snimanje', exact: true }).click();
    const sr = await stt; expect(sr.status()).toBe(200);
    console.log('Transcription:', (await sr.json()).text);
    const dr = await decision; expect(dr.status()).toBe(200); expect(await dr.json()).toEqual({ status: 'selected', id: 'maksimir' });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('zagreb-map')).toHaveAttribute('data-selected', 'maksimir');
    await expect.poll(() => page.getByTestId('zagreb-map').getAttribute('data-zoom')).toBe('14.60');
    expect(await page.evaluate(() => window.__tracks.every(t => t.readyState === 'ended'))).toBe(true);
    await page.screenshot({ path: `${out}/selected-maksimir.png`, fullPage: true });
  });
  await check('Unknown neighbourhood asks clarification without moving map', async () => {
    await page.getByRole('button', { name: 'Predstavi se', exact: true }).click();
    await page.locator('#kvart').fill('Ne znam, možda negdje na Marsu');
    await page.getByRole('button', { name: 'Idemo', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('status')).toContainText('Nisam siguran', { timeout: 20000 });
    await expect(page.getByTestId('zagreb-map')).toHaveAttribute('data-selected', 'maksimir');
    await page.keyboard.press('Escape');
  });
  await check('Pretraži honestly marked unavailable', async () => {
    await page.getByRole('button', { name: 'Pretraži', exact: true }).click();
    await expect(page.getByText('Pretraga još nije dostupna.')).toBeVisible();
  });
  await check('Mobile layout and reduced motion', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${out}/hero-mobile.png`, fullPage: true });
    await page.getByRole('button', { name: 'Predstavi se', exact: true }).click();
    await expect(page.locator('#kvart')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${out}/orb-mobile.png`, fullPage: true });
    await page.keyboard.press('Escape');
  });
  await check('No page runtime exceptions', async () => expect(errors).toEqual([]));
} finally {
  await writeFile(`${out}/results.json`, JSON.stringify({ checks, errors, syntheticVoiceInput: true, realProviderCalls: true }, null, 2));
  await browser.close();
}
