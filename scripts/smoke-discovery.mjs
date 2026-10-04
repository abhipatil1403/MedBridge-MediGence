import assert from 'node:assert/strict';
const origin = process.env.MEDBRIDGE_TEST_ORIGIN ?? 'http://localhost:3000';
async function json(path) {
  const response = await fetch(new URL(path, origin));
  return {status: response.status, body: await response.json()};
}
const inventory = await json('/api/discover');
assert.equal(inventory.status, 200);
for (const entries of Object.values(inventory.body.sections)) {
  assert.ok(entries.every(({item}) => ['first_party','external'].includes(item.sourceKind)), 'Only reviewed non-QA sources may be public');
}
for (const query of ['I need knee replacement', 'I want a cardiologist', 'I need a second opinion', 'Find hospitals in India', 'Compare kidney transplant in India and Turkey', 'I need cancer treatment', 'Find a hospital for spine surgery', 'I need physiotherapy after surgery']) {
  const {status, body} = await json(`/api/discover?q=${encodeURIComponent(query)}`);
  assert.equal(status, 200, query);
  assert.ok(body.understanding && body.sections, 'Parser and structured results remain available with an empty catalog');
  for (const entries of Object.values(body.sections)) assert.ok(entries.every(({item}) => item.sourceKind !== 'synthetic'));
}
const empty = await json('/api/discover?q=zyxwv-no-matches-98765');
assert.equal(empty.status, 200);
assert.equal(empty.body.total, 0);
assert.equal((await json('/api/discover?budget=not-a-number')).status, 400);
const suggestions = await json('/api/discover/suggestions?q=knee');
assert.equal(suggestions.status, 200);
assert.ok(Array.isArray(suggestions.body.suggestions));
for (const path of ['/', '/discover', '/hospitals', '/doctors', '/packages', '/treatments', '/compare', '/second-opinion', '/consultation', '/medical-travel', '/recovery', '/treatment-plan', '/assistant', '/provider', '/support', '/admin', '/help', '/auth/success', '/auth/failure']) {
  const response = await fetch(new URL(path, origin));
  assert.equal(response.status, 200, path);
}
for (const path of ['/hospitals/demo-care-delhi', '/doctors/demo-clinician-01', '/packages/sample-knee-replacement-1', '/treatments/knee-replacement']) {
  // Seed slugs must stay hidden when production has no legitimate published data.
  if (inventory.body.total === 0) {
    const response = await fetch(new URL(path, origin));
    const html = await response.text();
    assert.ok(response.status === 404 || (html.includes('PAGE NOT FOUND') && html.includes('noindex')), path);
    assert.ok(!html.includes('QA ONLY') && !html.includes('Demo Care'), 'No fixture content in not-found response');
  }
}
for (const [kind, entries] of Object.entries(inventory.body.sections)) {
  if (!['hospitals','doctors','packages','treatments'].includes(kind)) continue;
  for (const {item} of entries.slice(0, 3)) assert.equal((await fetch(new URL(`/${kind}/${item.slug}`, origin))).status, 200);
}
console.log('Production discovery smoke passed: source exclusion, parser, suggestions, honest empty results, error state, public/auth/portal routes and canonical links.');
