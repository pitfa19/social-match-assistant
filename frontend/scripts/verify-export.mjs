import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = resolve(process.env.EXPORT_DIR);
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const context = await browser.newContext({ offline: true, viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
const errors = [];
const network = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
const manifest = JSON.parse(await readFile(resolve(dir, 'manifest.json'), 'utf8'));
const checks = [];
try {
  for (const { file } of manifest.states) {
    await page.goto(pathToFileURL(resolve(dir, file)).href);
    await expect(page.locator('html')).toHaveAttribute('lang', 'hr');
    expect(await page.locator('style').count()).toBeGreaterThan(0);
    expect(await page.evaluate(() => [...document.styleSheets].reduce((count, sheet) => count + sheet.cssRules.length, 0))).toBeGreaterThan(10);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    checks.push({ file, offlineLoad: true, cssPresent: true, noHorizontalOverflow: true });
  }
  await page.goto(pathToFileURL(resolve(dir, 'index.html')).href);
  await page.getByRole('button', { name: 'Predstavi se', exact: true }).click();
  await expect(page).toHaveURL(/introduction\.html$/);
  await page.getByRole('navigation').getByRole('link', { name: 'Pretraga', exact: true }).click();
  await expect(page).toHaveURL(/search\.html$/);
  await page.getByRole('button', { name: 'Pomozi mi napisati objavu', exact: true }).click();
  await expect(page).toHaveURL(/post\.html$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(pathToFileURL(resolve(dir, 'index.html')).href);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: resolve(dir, 'offline-mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
  expect(network).toEqual([]);
  await writeFile(resolve(dir, 'export-verification.json'), JSON.stringify({ checks, offlineNavigation: true, offlineMobile: true, errors, networkRequests: network }, null, 2));
  console.log(`PASS ${checks.length} offline HTML screens, navigation, mobile layout, no external requests or runtime errors`);
} finally { await browser.close(); }
