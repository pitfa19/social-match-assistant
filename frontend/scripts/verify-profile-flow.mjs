import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.APP_URL || 'http://127.0.0.1:3101';
const out = '../.mozak/evidence/profile-flow/browser';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${process.env.VOICE_FIXTURE || '/home/pitfa/.jcode/scratch/zagreb-hr-48.wav'}`] });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, permissions: ['microphone'] });
await context.addInitScript(() => {
  window.__tracks = [];
  const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async options => { const stream = await get(options); window.__tracks.push(...stream.getTracks()); return stream; };
});
const page = await context.newPage();
const checks = [], errors = [];
page.on('pageerror', e => errors.push(e.message));
async function check(name, fn) { await fn(); checks.push({ name, passed: true }); console.log('PASS', name); }
const questions = ['Kako bi se opisao/la?', 'Što te zanima?', 'Što trenutno tražiš ili možeš ponuditi?', 'Koji kvart te zanima?'];
async function answer(text) { await page.getByLabel('Tvoj odgovor', { exact: true }).fill(text); await page.getByRole('button', { name: /Idemo|Dalje/, exact: true }).click(); }
try {
  await page.goto(base);
  await check('Auto-open first question, notes left, no microphone or map', async () => {
    await expect(page.getByRole('heading', { name: questions[0], exact: true })).toBeVisible();
    await expect(page.getByTestId('profile-fact')).toHaveCount(0);
    await expect(page.getByTestId('zagreb-map')).toHaveCount(0);
    expect(await page.evaluate(() => window.__tracks.length)).toBe(0);
    await expect(page.getByRole('button', { name: /Idemo|Dalje/, exact: true })).toBeDisabled();
    await page.screenshot({ path: `${out}/initial-desktop.png`, fullPage: true });
  });
  let removedFact = '';
  await check('Real Decisions creates grounded self-notes and removable items', async () => {
    await answer('Ja sam student. Radim kao programer.');
    await expect(page.getByRole('heading', { name: questions[1], exact: true })).toBeVisible({ timeout: 25000 });
    await expect.poll(() => page.getByTestId('profile-fact').count()).toBeGreaterThan(0);
    const fact = page.getByTestId('profile-fact').first();
    removedFact = await fact.getAttribute('aria-label');
    await fact.click();
    await expect(page.getByRole('button', { name: removedFact, exact: true })).toHaveCount(0);
  });
  let removedTopic = '';
  await check('Interest topics appear and removals survive subsequent answers', async () => {
    await answer('Volim glazbu. Volim planinarenje.');
    await expect(page.getByRole('heading', { name: questions[2], exact: true })).toBeVisible({ timeout: 25000 });
    await expect.poll(() => page.getByTestId('profile-topic').count()).toBeGreaterThan(0);
    const topic = page.getByTestId('profile-topic').first();
    removedTopic = await topic.getAttribute('aria-label');
    await topic.click();
    await expect(page.getByRole('button', { name: removedFact, exact: true })).toHaveCount(0);
    await page.screenshot({ path: `${out}/notes-desktop.png`, fullPage: true });
    await answer('Tražim društvo za šetnju. Mogu pomoći s računalima.');
    await expect(page.getByRole('heading', { name: questions[3], exact: true })).toBeVisible({ timeout: 25000 });
    await expect(page.getByRole('button', { name: removedFact, exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: removedTopic, exact: true })).toHaveCount(0);
    await expect(page.getByTestId('zagreb-map')).toHaveCount(0);
  });
  await check('Ambiguous kvart stays on question without map', async () => {
    await answer('Ne znam, možda Mars');
    await expect(page.getByRole('heading', { name: questions[3], exact: true })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /Nisam siguran/ })).toBeVisible({ timeout: 25000 });
    await expect(page.getByTestId('zagreb-map')).toHaveCount(0);
  });
  await check('Live voice selects Maksimir, reveals highlighted map right and preserves notes', async () => {
    const notesBefore = await page.getByTestId('profile-notes').innerText();
    const orb = page.getByRole('button', { name: 'Pritisni i govori', exact: true });
    const box = await orb.boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByRole('button', { name: 'Zaustavi snimanje' })).toBeVisible();
    await page.waitForTimeout(5200);
    await page.getByRole('button', { name: 'Zaustavi snimanje' }).click();
    await expect(page.getByTestId('zagreb-map')).toHaveAttribute('data-selected', 'maksimir', { timeout: 30000 });
    await expect(page.getByTestId('map-highlight')).toBeVisible();
    await expect.poll(() => page.getByTestId('zagreb-map').getAttribute('data-zoom')).toBe('14.60');
    expect(await page.getByTestId('profile-notes').innerText()).toBe(notesBefore);
    const notes = await page.getByTestId('profile-notes').boundingBox(), map = await page.getByTestId('zagreb-map').boundingBox();
    expect(map.x).toBeGreaterThan(notes.x + notes.width - 1);
    expect(await page.evaluate(() => window.__tracks.every(t => t.readyState === 'ended'))).toBe(true);
    await expect.poll(() => page.getByTestId('zagreb-map').locator('img').evaluateAll(images => images.length > 0 && images.every(i => i.complete && i.naturalWidth > 0)), { timeout: 20000 }).toBe(true);
    await page.screenshot({ path: `${out}/map-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${out}/map-mobile.png`, fullPage: true });
  });
  await check('Reload clears personal notes and returns to start, mobile reduced motion', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.reload();
    await expect(page.getByRole('heading', { name: questions[0], exact: true })).toBeVisible();
    await expect(page.getByTestId('profile-fact')).toHaveCount(0);
    await expect(page.getByTestId('zagreb-map')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${out}/initial-mobile.png`, fullPage: true });
  });
  expect(errors).toEqual([]);
} finally { await writeFile(`${out}/results.json`, JSON.stringify({ checks, errors, realProviderCalls: true, voiceInput: 'synthetic Croatian' }, null, 2)); await browser.close(); }
