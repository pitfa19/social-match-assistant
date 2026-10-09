// Real localhost acceptance check. One normal profile-extraction request, no collection.
// Source content is neither printed nor saved. Requires the existing local main corpus.
import { chromium, expect } from '@playwright/test';

const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const profile = 'Ja sam student. Volim knjige. Tražim stan za najam. Zanima me Maksimir.';
const errors = [];
let profileCalls = 0;
const requests = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => {
    if (r.url().includes('/api/')) requests.push(new URL(r.url()).pathname);
    if (r.url().endsWith('/api/zagreb/profile') && r.method() === 'POST') profileCalls++;
  });
  await page.goto(process.env.APP_URL || 'http://localhost:3000', { waitUntil: 'networkidle' });
  await page.getByRole('textbox').fill(profile);
  const extractionResponse = page.waitForResponse(r => r.url().endsWith('/api/zagreb/profile') && r.request().method() === 'POST', { timeout: 30000 });
  const matchingResponse = page.waitForResponse(r => r.url().endsWith('/api/zagreb/matches') && r.request().method() === 'POST', { timeout: 45000 }).catch(() => null);
  await page.getByRole('button', { name: 'Dalje', exact: true }).click();
  const extraction = await extractionResponse;
  if (extraction.status() !== 200) throw new Error(`Profile extraction failed with ${extraction.status()}`);
  const profileData = await extraction.json();
  await expect(page.getByTestId('onboarding-step')).not.toHaveAttribute('data-step', '0');
  // The model may conservatively leave geography for the explicit, deterministic question.
  if (await page.getByTestId('onboarding-step').getAttribute('data-step') === '3') {
    await page.getByRole('textbox').fill('Maksimir');
    await page.getByRole('button', { name: 'Idemo', exact: true }).click();
  }
  await expect(page.getByTestId('onboarding-step')).toHaveAttribute('data-step', 'done', { timeout: 30000 });
  const response = await matchingResponse;
  if (!response) throw new Error('Matching request did not complete');
  const data = await response.json();
  if (response.status() !== 200 || !data.indexAvailable || !data.results.length) throw new Error('Live local matching returned no available results');
  if (data.results.some(r => r.source !== 'facebook' || r.area !== 'maksimir' || r.areaBasis !== 'explicit_text')) throw new Error('Unexpected source or neighbourhood evidence');
  const section = page.getByTestId('indexed-results');
  await expect(section).toHaveAttribute('aria-busy', 'false');
  await expect(section.getByRole('heading', { name: 'Objave za tebe' })).toBeVisible();
  await expect(section.getByTestId('matched-post')).toHaveCount(data.results.length);
  await expect(section.locator('form, select, input, details')).toHaveCount(0);
  if (requests.some(p => p.includes('/sources') || p.includes('/scrapes'))) throw new Error('Unexpected source directory or collection request');
  const widths = [1440, 375, 320];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByTestId('matched-post').first()).toBeVisible();
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`Horizontal overflow at ${width}`);
  }
  if (errors.length) throw new Error('Browser runtime errors: ' + errors.join('; '));
  console.log(JSON.stringify({ check: 'live-profile-to-local-posts', profile, profileCalls, extractedCoverage: profileData.coverage, resultCount: data.results.length,
    resultIds: data.results.map(r => r.id), areas: [...new Set(data.results.map(r => r.area))], sources: [...new Set(data.results.map(r => r.source))],
    areaBasis: [...new Set(data.results.map(r => r.areaBasis))], postsOnly: true, viewportWidths: widths, errors }, null, 2));
} finally { await browser.close(); }
