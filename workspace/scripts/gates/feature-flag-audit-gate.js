/**
 * Gate 4 — Feature Flag Audit Gate
 * All flags must be true or have a disable_reason
 */
const fs = require('fs');
const path = require('path');

function run(options = {}) {
  const errors = [];
  const flagsPath = path.resolve(options.root || '.', 'infrastructure/feature-flags/flags.json');

  if (!fs.existsSync(flagsPath)) {
    return { gate: 4, name: 'Feature Flag Audit Gate', passed: false, errors: [{ message: 'flags.json not found' }] };
  }

  let flags;
  try {
    flags = JSON.parse(fs.readFileSync(flagsPath, 'utf-8'));
  } catch (e) {
    return { gate: 4, name: 'Feature Flag Audit Gate', passed: false, errors: [{ message: `Parse error: ${e.message}` }] };
  }

  // Check for disable_reasons file
  const reasonsPath = path.resolve(options.root || '.', 'infrastructure/feature-flags/disable-reasons.json');
  let reasons = {};
  if (fs.existsSync(reasonsPath)) {
    try { reasons = JSON.parse(fs.readFileSync(reasonsPath, 'utf-8')); } catch {}
  }

  for (const [flag, value] of Object.entries(flags)) {
    if (value !== true) {
      if (!reasons[flag]) {
        errors.push({ flag, value, message: 'Flag is disabled without a disable_reason' });
      }
    }
  }

  const passed = errors.length === 0;
  return { gate: 4, name: 'Feature Flag Audit Gate', passed, errors };
}

if (require.main === module) {
  const result = run();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.passed ? 0 : 1);
}

module.exports = { run };
