// Default: stub profile extraction to avoid paid calls. LIVE_PROFILE=1 explicitly exercises the existing provider-backed path.
import { chromium, expect } from '@playwright/test';

const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const liveProfile = process.env.LIVE_PROFILE === '1';
const withMicrophone = process.env.WITH_MICROPHONE === '1';
const expectedCount = withMicrophone ? 3 : 2;
const profile = [
  { text: 'Gradski treper', topic: 'none', role: 'description' },
  { text: 'Zanima me glazba', topic: 'glazba', role: 'interest' },
  { text: 'Tražim nekoga tko će mi prošetat psa i popraviti cijev u stanu' + (withMicrophone ? '. Tražim i mikrofon.' : ''), topic: 'none', role: 'request' },
];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let stubbedProfileCalls = 0;
  let realProfileCalls = 0;
  page.on('request', request => {
    if (liveProfile && request.url().endsWith('/api/zagreb/profile') && request.method() === 'POST') realProfileCalls++;
  });
  if (!liveProfile) await page.route('**/api/zagreb/profile', async route => {
    const { step } = route.request().postDataJSON();
    stubbedProfileCalls++;
    await route.fulfill({ json: { status: 'ok', items: [profile[step]], coverage: [step] } });
  });
  await page.goto(process.env.APP_URL || 'http://localhost:3000', { waitUntil: 'networkidle' });
  for (let step = 0; step < 3; step++) {
    await expect(page.getByTestId('onboarding-step')).toHaveAttribute('data-step', String(step), { timeout: 30000 });
    await page.getByRole('textbox').fill(profile[step].text);
    await page.getByRole('button', { name: 'Dalje', exact: true }).click();
  }
  await expect(page.getByTestId('onboarding-step')).toHaveAttribute('data-step', '3', { timeout: 30000 });
  await page.getByRole('textbox').fill('Trešnjevka');
  const matching = page.waitForResponse(r => r.url().endsWith('/api/zagreb/matches') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Idemo', exact: true }).click();
  const response = await matching;
  if (response.status() !== 200) throw new Error(`Matching API status ${response.status()}`);
  const data = await response.json();
  const demos = data.results.filter(r => r.source === 'demo');
  if (demos.length !== expectedCount || demos.some(r => r.recordKind !== 'synthetic' || r.area !== 'tresnjevka' || r.url !== null)) throw new Error(`Expected exactly ${expectedCount} internally synthetic local offers`);
  if (withMicrophone && !demos.some(r => r.id === 'demo-microphone-rental-tresnjevka')) throw new Error('Microphone rental missing');
  const section = page.getByTestId('indexed-results');
  await expect(section).toHaveAttribute('aria-busy', 'false');
  const cards = section.locator('[data-testid="matched-post"][data-source="demo"]');
  await expect(cards).toHaveCount(expectedCount);
  for (const card of await cards.all()) {
    await expect(card).not.toContainText(/demo|izmišljen|sintetičk|nisu stvarne/i);
    await expect(card).toContainText('Oglas · Trešnjevka');
  }
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await cards.first().scrollIntoViewIfNeeded();
    await expect(cards.first()).toBeVisible();
    await expect(cards.last()).toBeVisible();
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`Overflow at ${width}`);
  }
  if (errors.length) throw new Error(errors.join('; '));
  console.log(JSON.stringify({ check: 'local-demo-offers-browser', profileExtraction: liveProfile ? 'real-provider' : 'stubbed', stubbedProfileCalls, realProfileCalls,
    matching: 'real-local-api', backendAvailable: data.indexAvailable, demoIds: demos.map(r => r.id),
    demoTitles: demos.map(r => r.title), widths: [1440, 375, 320], errors }, null, 2));
} finally { await browser.close(); }
