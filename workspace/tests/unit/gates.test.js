/**
 * Gate Protocol Unit Tests
 * @priority P0
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const gate1 = require('../../scripts/gates/data-source-gate');
const gate2 = require('../../scripts/gates/isc-compliance-gate');
const gate3 = require('../../scripts/gates/entry-point-smoke-gate');
const gate4 = require('../../scripts/gates/feature-flag-audit-gate');
const gate5 = require('../../scripts/gates/report-integrity-gate');
const gate6 = require('../../scripts/gates/independent-qa-gate');

let passed = 0, failed = 0;
function assert(name, condition) {
  if (condition) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
}

function makeTmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-test-'));
  return d;
}

// ── Gate 1: Data Source Gate ──
console.log('\nGate 1 — Data Source Gate');

(() => {
  // Test 1.1: Valid data passes
  const tmp = makeTmp();
  const f = path.join(tmp, 'bench.json');
  fs.writeFileSync(f, JSON.stringify({ data_source: 'real_user_data', score: 0.9 }));
  const r = gate1.run({ files: [f] });
  assert('Valid data_source passes', r.passed === true);
})();

(() => {
  // Test 1.2: Synthetic data blocked
  const tmp = makeTmp();
  const f = path.join(tmp, 'bench.json');
  fs.writeFileSync(f, JSON.stringify({ data_source: 'synthetic', score: 0.9 }));
  const r = gate1.run({ files: [f] });
  assert('Synthetic data blocked', r.passed === false && r.errors.length > 0);
})();

(() => {
  // Test 1.3: Missing data_source blocked
  const tmp = makeTmp();
  const f = path.join(tmp, 'bench.json');
  fs.writeFileSync(f, JSON.stringify({ score: 0.9 }));
  const r = gate1.run({ files: [f] });
  assert('Missing data_source blocked', r.passed === false);
})();

// ── Gate 2: ISC Compliance Gate ──
console.log('\nGate 2 — ISC Compliance Gate');

(() => {
  const r = gate2.run({ root: path.resolve(__dirname, '../..') });
  assert('ISC compliance passes on workspace', r.gate === 2);
})();

(() => {
  const tmp = makeTmp();
  const r = gate2.run({ root: tmp });
  assert('ISC fails when skill dir missing', r.passed === false);
})();

// ── Gate 3: Entry Point Smoke Gate ──
console.log('\nGate 3 — Entry Point Smoke Gate');

(() => {
  const r = gate3.run({ root: path.resolve(__dirname, '../..') });
  assert('Entry point smoke runs on workspace', r.gate === 3);
})();

(() => {
  const tmp = makeTmp();
  const r = gate3.run({ root: tmp });
  assert('Fails when skills dir missing', r.passed === false);
})();

// ── Gate 4: Feature Flag Audit ──
console.log('\nGate 4 — Feature Flag Audit');

(() => {
  // All flags true → pass
  const tmp = makeTmp();
  fs.mkdirSync(path.join(tmp, 'infrastructure/feature-flags'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'infrastructure/feature-flags/flags.json'), JSON.stringify({ a: true, b: true }));
  const r = gate4.run({ root: tmp });
  assert('All true flags pass', r.passed === true);
})();

(() => {
  // Disabled flag without reason → fail
  const tmp = makeTmp();
  fs.mkdirSync(path.join(tmp, 'infrastructure/feature-flags'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'infrastructure/feature-flags/flags.json'), JSON.stringify({ a: false }));
  const r = gate4.run({ root: tmp });
  assert('Disabled flag without reason fails', r.passed === false);
})();

// ── Gate 5: Report Integrity ──
console.log('\nGate 5 — Report Integrity');

(() => {
  // No reports dir → pass
  const tmp = makeTmp();
  const r = gate5.run({ root: tmp });
  assert('No reports dir passes', r.passed === true);
})();

(() => {
  // Reports dir with no snapshots → pass
  const tmp = makeTmp();
  fs.mkdirSync(path.join(tmp, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'reports/test.md'), '# Report');
  const r = gate5.run({ root: tmp });
  assert('Reports without snapshots pass', r.passed === true);
})();

// ── Gate 6: Independent QA Gate ──
console.log('\nGate 6 — Independent QA Gate');

(() => {
  // No tests dir → pass
  const tmp = makeTmp();
  const r = gate6.run({ root: tmp });
  assert('No tests dir passes', r.passed === true);
})();

(() => {
  // Passing P0 test
  const tmp = makeTmp();
  fs.mkdirSync(path.join(tmp, 'tests/unit'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'tests/unit/p0-sample.test.js'), 'console.log("ok"); process.exit(0);');
  const r = gate6.run({ root: tmp });
  assert('Passing P0 test passes gate', r.passed === true);
})();

(() => {
  // Failing P0 test
  const tmp = makeTmp();
  fs.mkdirSync(path.join(tmp, 'tests/unit'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'tests/unit/p0-fail.test.js'), 'process.exit(1);');
  const r = gate6.run({ root: tmp });
  assert('Failing P0 test fails gate', r.passed === false);
})();

// ── Summary ──
console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
