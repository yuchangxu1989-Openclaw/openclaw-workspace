/**
 * Gate 2 — ISC Compliance Gate
 * Checks ISC rule compliance
 */
const fs = require('fs');
const path = require('path');

function run(options = {}) {
  const errors = [];
  const iscDir = path.resolve(options.root || '.', 'skills/isc-core');

  // Check ISC core exists
  if (!fs.existsSync(iscDir)) {
    errors.push({ message: 'ISC core skill directory not found' });
    return { gate: 2, name: 'ISC Compliance Gate', passed: false, errors };
  }

  // Check SKILL.md exists
  const skillMd = path.join(iscDir, 'SKILL.md');
  if (!fs.existsSync(skillMd)) {
    errors.push({ message: 'ISC SKILL.md not found' });
  }

  // Check rules directory exists and has rules
  const rulesDir = path.join(iscDir, 'rules');
  if (fs.existsSync(rulesDir)) {
    const ruleFiles = fs.readdirSync(rulesDir).filter(f => f.endsWith('.md') || f.endsWith('.json'));
    if (ruleFiles.length === 0) {
      errors.push({ message: 'No ISC rules found in rules directory' });
    }
  }

  const passed = errors.length === 0;
  return { gate: 2, name: 'ISC Compliance Gate', passed, errors };
}

if (require.main === module) {
  const result = run();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.passed ? 0 : 1);
}

module.exports = { run };
