import assert from "node:assert/strict";

const origin = process.env.MEDBRIDGE_TEST_ORIGIN ?? "http://localhost:3000";

async function json(path) {
  const response = await fetch(new URL(path, origin));
  return { status: response.status, body: await response.json() };
}

const inventory = await json("/api/discover");
assert.equal(inventory.status, 200);
for (const [kind, minimum] of Object.entries({ treatments: 20, hospitals: 15, doctors: 30, countries: 10, packages: 15, services: 10 })) {
  assert.ok(inventory.body.sections[kind].length >= minimum, `${kind} inventory is too small`);
}

const examples = [
  // Procedure queries require an explicit treatment link. Generic country and
  // recovery-service cards do not establish that relationship.
  ["I need knee replacement", "treatment", "knee-replacement", "treatments"],
  ["I want a cardiologist", "doctor", undefined, "doctors"],
  ["I need a second opinion", "second-opinion", undefined, "services"],
  ["Find hospitals in India", "hospital", undefined, "hospitals"],
  ["Compare kidney transplant in India and Turkey", "comparison", "kidney-transplant", "treatments"],
  ["I need cancer treatment", "treatment", "cancer-treatment", "treatments"],
  ["Find a hospital for spine surgery", "hospital", "brain-and-spine-surgery", "hospitals"],
  ["I need physiotherapy after surgery", "recovery", "physiotherapy-after-surgery", "treatments"],
];

for (const [query, intent, procedure, kind] of examples) {
  const { status, body } = await json(`/api/discover?q=${encodeURIComponent(query)}`);
  assert.equal(status, 200, query);
  assert.equal(body.understanding.intent, intent, query);
  if (procedure) assert.equal(body.understanding.entities.procedure, procedure, query);
  if (intent === 'comparison') assert.deepEqual(body.understanding.entities.countries, ['india', 'turkey']);
  assert.ok(body.sections[kind].length > 0, `${query} has no ${kind} results`);
}

const filtered = await json("/api/discover?q=knee%20replacement&type=hospitals&country=india&city=Mumbai");
assert.equal(filtered.status, 200);
assert.equal(filtered.body.sections.hospitals.length, 1);
assert.equal(filtered.body.sections.hospitals[0].item.city, "Mumbai");

const budget = await json("/api/discover?type=packages&budget=5000&sort=price");
assert.equal(budget.status, 200);
assert.ok(budget.body.sections.packages.every(({ item }) => item.samplePriceUsd <= 5000));
assert.ok(budget.body.sections.packages.every((entry, index, all) => !index || all[index - 1].item.samplePriceUsd <= entry.item.samplePriceUsd));

const empty = await json("/api/discover?q=zyxwv-no-matches-98765");
assert.equal(empty.status, 200);
assert.equal(empty.body.total, 0);

const invalid = await json("/api/discover?budget=not-a-number");
assert.equal(invalid.status, 400);

const suggestions = await json("/api/discover/suggestions?q=knee");
assert.equal(suggestions.status, 200);
assert.ok(suggestions.body.suggestions.some(({ label }) => label.includes("Knee Replacement")));
assert.ok(suggestions.body.suggestions.some(({ label }) => label.startsWith("Hospitals for")));

for (const path of ["/", "/discover", "/treatments/knee-replacement", "/hospitals/demo-care-delhi", "/doctors/demo-clinician-01", "/packages/sample-knee-replacement-1", "/compare?procedure=knee-replacement&countryA=india&countryB=turkey", "/second-opinion", "/consultation", "/medical-travel", "/recovery", "/treatment-plan"]) {
  const response = await fetch(new URL(path, origin));
  assert.equal(response.status, 200, path);
}

console.log("Discovery smoke checks passed: inventory, parser, filters, sort, suggestions, empty/error states and workflow routes.");
