import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.APP_URL || 'http://127.0.0.1:3000';
const out = process.env.EVIDENCE_DIR || '../.mozak/evidence/frontend-local/browser';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, permissions: ['microphone'] });
await context.addInitScript(() => {
  window.__micTracks = [];
  if (navigator.mediaDevices?.getUserMedia) {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await original(constraints);
      window.__micTracks.push(...stream.getTracks());
      return stream;
    };
  }
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const checks = [];
async function check(name, fn) { await fn(); checks.push({ name, passed: true }); console.log('PASS', name); }
try {
  await page.goto(base);
  await check('Croatian hero has two primary actions', async () => {
    await expect(page.locator('html')).toHaveAttribute('lang', 'hr');
    await expect(page.getByRole('button', { name: 'Predstavi se', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Pretraži', exact: true })).toBeVisible();
    await expect(page.locator('.cta-row button')).toHaveCount(2);
    await page.screenshot({ path: `${out}/hero-desktop.png`, fullPage: true });
  });
  await check('Search works without a profile', async () => {
    await page.getByRole('button', { name: 'Pretraži', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Što trenutno tražite ili nudite?').fill('bušilica');
    await page.getByRole('button', { name: 'Pronađi', exact: true }).click();
    await expect(page.getByRole('heading', { name: /bušilic/i }).first()).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('note').first()).toContainText('Demo pretraga · sintetički zapisi');
    await page.getByRole('button', { name: 'Zatvori', exact: true }).click();
  });
  await check('Introduction is edge-to-edge green with one large question', async () => {
    await page.getByRole('button', { name: 'Predstavi se', exact: true }).click();
    const screen = page.getByTestId('intro-screen');
    await expect(screen).toBeVisible();
    const geometry = await screen.evaluate(el => ({ rect: { x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }, bg: getComputedStyle(el).backgroundColor, vw: innerWidth, vh: innerHeight }));
    expect(geometry.rect.x).toBe(0);
    expect(geometry.rect.y).toBe(0);
    expect(geometry.rect.width).toBe(geometry.vw);
    expect(geometry.rect.height).toBeGreaterThanOrEqual(geometry.vh);
    expect(geometry.bg).toBe('rgb(20, 48, 31)');
    expect(await page.getByTestId('intro-question').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(48);
    await expect(page.getByTestId('intro-question')).toHaveCount(1);
    await page.screenshot({ path: `${out}/intro-desktop.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Predstavi se', exact: true })).toBeFocused();
  });
  await check('Introduction requires explicit textual profile confirmation', async () => {
    await page.getByRole('button', { name: 'Predstavi se', exact: true }).click();
    const answers = ['Tražim sobu i mogu pomoći s računalima.', 'Trešnjevka, navečer.', 'Ukupno najviše 450 eura.', 'Ne želim automatsku objavu.'];
    for (const answer of answers) { await page.locator('#intro-input').fill(answer); await page.getByRole('button', { name: 'Dalje', exact: true }).click(); }
    await expect(page.locator('#draft')).toContainText('');
    await expect(page.locator('#draft')).toHaveValue(/Trešnjevka/);
    await expect(page.getByRole('button', { name: 'Profil', exact: true })).toHaveCount(0);
    await page.screenshot({ path: `${out}/profile-review.png`, fullPage: true });
    await page.getByRole('button', { name: 'Potvrdi i spremi', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Profil', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Profil', exact: true })).toBeEnabled();
  });
  await check('Profile edits persist and blank profile is rejected', async () => {
    await page.getByRole('button', { name: 'Profil', exact: true }).click();
    await page.getByTestId('profile-text').fill('');
    await page.getByTestId('profile-save').click();
    await expect(page.getByRole('dialog').getByRole('alert').filter({ hasText: 'prazan' })).toBeVisible();
    await page.getByTestId('profile-text').fill('Tražim sobu u Trešnjevci, najviše 450 eura uključujući režije.');
    await page.getByTestId('profile-save').click();
    await page.getByRole('button', { name: 'Profil', exact: true }).click();
    await expect(page.getByTestId('profile-text')).toHaveValue(/450/);
    await page.getByRole('button', { name: 'Zatvori', exact: true }).click();
  });
  await check('Hard filters, saved results, details and editable grounded draft work', async () => {
    await page.getByRole('button', { name: 'Pretraži', exact: true }).click();
    await page.getByLabel('Što trenutno tražite ili nudite?').fill('soba');
    await page.getByText('Filtri', { exact: true }).click();
    await page.getByRole('radio', { name: 'Najam', exact: true }).check();
    await page.getByLabel('Ukupni proračun (€)').fill('450');
    await page.getByRole('button', { name: 'Pronađi', exact: true }).click();
    const cards = page.getByRole('region', { name: 'Popis' }).locator('li').filter({ has: page.getByRole('button', { name: 'Detalji', exact: true }) });
    await expect(cards.first()).toBeVisible();
    await page.getByRole('button', { name: 'Spremi', exact: true }).first().click();
    await page.getByRole('tab', { name: /Spremljeno/ }).click();
    await expect(page.getByRole('button', { name: 'Ukloni iz spremljenog', exact: true })).toHaveCount(1);
    await page.getByRole('button', { name: 'Detalji', exact: true }).first().click();
    await expect(page.getByRole('complementary')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('complementary')).toHaveCount(0);
    await page.getByRole('button', { name: 'Pomozi mi napisati objavu', exact: true }).first().click();
    await expect(page.locator('textarea').last()).toHaveValue(/soba/);
    await page.locator('textarea').last().fill('Moja uređena objava bez novih tvrdnji.');
    await page.screenshot({ path: `${out}/search-draft.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Zatvori', exact: true }).click();
  });
  await check('Profile deletion requires confirmation', async () => {
    await page.getByRole('button', { name: 'Profil', exact: true }).click();
    await page.getByTestId('profile-delete').click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: 'Odustani', exact: true }).click();
    await expect(page.getByTestId('profile-text')).toHaveValue(/450/);
    await page.getByTestId('profile-delete').click();
    await page.getByTestId('profile-delete-confirm').click();
    await expect(page.getByRole('button', { name: 'Predstavi se', exact: true })).toBeEnabled();
  });
  await check('Local microphone records, plays back, discards and stops tracks', async () => {
    await page.getByRole('button', { name: 'Predstavi se', exact: true }).click();
    await page.getByRole('button', { name: 'Pritisni za govor', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Zaustavi snimanje', exact: true })).toBeVisible();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: 'Zaustavi snimanje', exact: true }).click();
    await expect(page.locator('audio')).toBeVisible();
    expect(await page.evaluate(() => window.__micTracks.length > 0 && window.__micTracks.every(track => track.readyState === 'ended'))).toBe(true);
    await page.locator('audio').evaluate(a => a.play());
    await page.getByRole('button', { name: 'Odbaci snimku', exact: true }).click();
    await expect(page.locator('audio')).toHaveCount(0);
    await page.getByRole('button', { name: 'Pritisni za govor', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Zaustavi snimanje', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Zatvori', exact: true }).click();
    expect(await page.evaluate(() => window.__micTracks.every(track => track.readyState === 'ended'))).toBe(true);
  });
  await check('Microphone-denied branch preserves usable typed input (simulated denial)', async () => {
    await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied for test', 'NotAllowedError'); }; });
    await page.getByRole('button', { name: 'Predstavi se', exact: true }).click();
    await page.getByRole('button', { name: 'Pritisni za govor', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText(/odbijen/i);
    await page.locator('#intro-input').fill('Tekst radi i bez mikrofona.');
    await expect(page.getByRole('button', { name: 'Dalje', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Zatvori', exact: true }).click();
  });
  await check('Mobile layout has no horizontal overflow and keyboard closes sheet', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: 'Predstavi se', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${out}/hero-mobile.png`, fullPage: true });
    await page.getByRole('button', { name: 'Predstavi se', exact: true }).click();
    await expect(page.getByTestId('intro-screen')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.getByTestId('intro-question').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(32);
    await page.screenshot({ path: `${out}/intro-mobile.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Predstavi se', exact: true })).toBeFocused();
  });
  await check('No browser runtime or hydration errors', async () => { expect(errors).toEqual([]); });
  await writeFile(`${out}/results.json`, JSON.stringify({ base, checks, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true });
  await writeFile(`${out}/results.json`, JSON.stringify({ base, checks, errors, failure: String(error) }, null, 2));
  throw error;
} finally { await browser.close(); }
