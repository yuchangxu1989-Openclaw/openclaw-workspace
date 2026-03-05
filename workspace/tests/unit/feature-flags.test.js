const fs = require('fs');
const path = require('path');
const os = require('os');

// Test helper
let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

// Use a temp copy so tests don't mutate the real flags
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-'));
const tmpFlags = path.join(tmpDir, 'flags.json');
fs.copyFileSync(path.join(__dirname, '../../infrastructure/feature-flags/flags.json'), tmpFlags);

const { FeatureFlags } = require('../../infrastructure/feature-flags/index');

console.log('Feature Flags Tests:');

// 1. constructor loads flags
const ff = new FeatureFlags(tmpFlags);
assert(Object.keys(ff.flags).length === 4, '1. constructor loads 4 flags');

// 2. isEnabled returns true for enabled flag
assert(ff.isEnabled('llm_intent_classification') === true, '2. isEnabled returns true');

// 3. isEnabled returns false for disabled flag
ff.flags['llm_intent_classification'] = false;
assert(ff.isEnabled('llm_intent_classification') === false, '3. isEnabled returns false');
ff.flags['llm_intent_classification'] = true;

// 4. disable sets flag to false
ff.disable('deep_dedup_check', 'LLM unavailable');
assert(ff.isEnabled('deep_dedup_check') === false, '4. disable sets flag false');

// 5. disable persists to file
const raw = JSON.parse(fs.readFileSync(tmpFlags, 'utf-8'));
assert(raw.deep_dedup_check === false, '5. disable persists to file');

// 6. disable records reason
assert(ff.disableReasons['deep_dedup_check'] === 'LLM unavailable', '6. disable records reason');

// 7. enable restores flag
ff.enable('deep_dedup_check');
assert(ff.isEnabled('deep_dedup_check') === true, '7. enable restores flag');

// 8. enable clears reason
assert(!ff.disableReasons['deep_dedup_check'], '8. enable clears reason');

// 9. getAll returns all flags with status
const all = ff.getAll();
assert(Object.keys(all).length === 4 && all.event_dispatcher.enabled === true, '9. getAll returns structured data');

// 10. disable/enable unknown flag throws
let threw = false;
try { ff.disable('nonexistent'); } catch(e) { threw = true; }
assert(threw, '10. unknown flag throws error');

// Cleanup
fs.rmSync(tmpDir, { recursive: true });

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
