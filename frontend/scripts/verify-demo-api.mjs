// Public localhost matching API checks. No profile-provider, collection, or database writes.
import assert from 'node:assert/strict';
const base = process.env.APP_URL || 'http://localhost:3000';
const request = (text, role = 'request', areaId = 'tresnjevka') => ({ areaId, cityWide: false, facts: text ? [{ text, role }] : [] });
const checks = [];
for (const [name, body, expected] of [
  ['both needs ascii', request('trazim nekoga tko ce mi prosetat psa, i popraviti cijev u stanu'), 2],
  ['dog only', request('Trebam šetača za psa'), 1],
  ['pipe only', request('Treba mi popravak cijevi'), 1],
  ['wrong neighbourhood', request('šetanje psa i popravak cijevi', 'request', 'maksimir'), 0],
  ['music only', request('Zanima me glazba', 'interest'), 0],
  ['offer not request', request('Nudim šetanje pasa i popravak cijevi', 'offer'), 0],
  ['negated', request('Ne trebam šetanje psa ni popravak cijevi'), 0],
  ['empty profile', request(''), 0],
]) {
  const response = await fetch(`${base}/api/zagreb/matches`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify(body) });
  assert.equal(response.status, 200, name);
  const data = await response.json();
  assert.equal(data.indexAvailable, true, name);
  const demo = data.results.filter(r => r.source === 'demo');
  assert.equal(demo.length, expected, name);
  assert.ok(demo.every(r => r.recordKind === 'synthetic' && r.area === 'tresnjevka' && r.url === null));
  if (name === 'dog only') assert.equal(demo[0].id, 'demo-dog-walking-tresnjevka');
  if (name === 'pipe only') assert.equal(demo[0].id, 'demo-pipe-repair-tresnjevka');
  checks.push({ name, status: response.status, demoIds: demo.map(r => r.id) });
}
for (const [name, body, origin, expected] of [
  ['unknown area', request('šetanje psa', 'request', 'not-a-place'), base, 400],
  ['client cannot enable demo', { ...request('šetanje psa'), LOCAL_DEMO_OFFERS: '1' }, base, 400],
  ['cross-origin refused', request('šetanje psa'), 'https://untrusted.invalid', 403],
]) {
  const response = await fetch(`${base}/api/zagreb/matches`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) });
  assert.equal(response.status, expected, name);
  checks.push({ name, status: response.status });
}
console.log(JSON.stringify({ check: 'real-public-demo-api-boundaries', checks }, null, 2));
