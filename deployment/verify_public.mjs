import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.PREVIEW_URL || 'https://kvartnakvadrat.up.railway.app';
const output = process.argv[2];
if (!output) throw new Error('Evidence directory required');
const results = [];
async function check(name, path, init, verify) {
  const response = await fetch(base + path, { ...init, signal: AbortSignal.timeout(15000) });
  const text = await response.text();
  await verify(response, text);
  results.push({ name, status: response.status, passed: true });
  console.log(`PASS ${name} HTTP ${response.status}`);
}
await check('public page without credentials', '/', {}, (r, t) => {
  assert.equal(r.status, 200); assert.match(t, /<html/); assert.equal(r.headers.get('www-authenticate'), null);
});
await check('health', '/api/health', {}, (r, t) => { assert.equal(r.status, 200); assert.equal(JSON.parse(t).status, 'ok'); });
await check('persistent source registry through private backend', '/api/sources', {}, (r, t) => {
  assert.equal(r.status, 200); const body = JSON.parse(t); assert.equal(body.count, 21);
  assert.equal(body.sources.filter(s => s.platform === 'facebook').length, 19);
  assert.equal(body.sources.filter(s => s.platform === 'reddit' && s.scope === 'general').length, 2);
  assert.equal(body.sources.filter(s => s.status === 'missing_url').length, 3);
  assert.equal(body.content_imported_by_this_request, false);
});
await check('Croatian neighbourhood alias', '/api/sources?area=Male%C5%A1nica&include_general=false', {}, (r, t) => {
  assert.equal(r.status, 200); const body = JSON.parse(t); assert.equal(body.count, 1); assert.equal(body.sources[0].id, 'fb-malesnica');
});
await check('two Sesvete sources', '/api/sources?area=Sesvete&include_general=false', {}, (r, t) => { assert.equal(r.status, 200); assert.equal(JSON.parse(t).count, 2); });
await check('typed map selection', '/api/zagreb/neighbourhood', { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ text: 'Maksimir' }) }, (r,t) => {
  assert.equal(r.status, 200); const body = JSON.parse(t); assert.equal(body.status, 'selected'); assert.equal(body.id, 'maksimir');
});
await check('cross-site write denied', '/api/zagreb/neighbourhood', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://example.invalid', 'sec-fetch-site': 'cross-site' }, body: JSON.stringify({ text: 'Maksimir' }) }, r => assert.equal(r.status, 403));
await check('no public import bridge', '/api/import', { method: 'POST' }, r => assert.equal(r.status, 404));
await mkdir(output, { recursive: true });
await writeFile(output + '/live-checks.json', JSON.stringify({ observed_at: new Date().toISOString(), base, results, limits: ['No Facebook content collected', 'Ordered Facebook URL mappings remain unverified', 'Voice and paid-model live regressions not covered here'] }, null, 2) + '\n');
