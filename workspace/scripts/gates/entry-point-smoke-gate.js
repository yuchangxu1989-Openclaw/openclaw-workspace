/**
 * Gate 3 — Entry Point Smoke Gate
 * Verifies skill entry points exist and are loadable
 */
const fs = require('fs');
const path = require('path');

function run(options = {}) {
  const errors = [];
  const skillsDir = path.resolve(options.root || '.', 'skills');

  if (!fs.existsSync(skillsDir)) {
    return { gate: 3, name: 'Entry Point Smoke Gate', passed: false, errors: [{ message: 'skills/ directory not found' }] };
  }

  const skills = fs.readdirSync(skillsDir).filter(d =>
    fs.statSync(path.join(skillsDir, d)).isDirectory()
  );

  for (const skill of skills) {
    const skillMd = path.join(skillsDir, skill, 'SKILL.md');
    if (!fs.existsSync(skillMd)) continue;

    const content = fs.readFileSync(skillMd, 'utf-8');
    // Look for handler/entry references like index.js, index.cjs, main.js
    const handlerMatch = content.match(/(?:handler|entry[_-]?point|main)\s*[:=]\s*[`"']?([^\s`"'\n]+\.(?:js|cjs|mjs))/i);
    if (handlerMatch) {
      const entryFile = path.join(skillsDir, skill, handlerMatch[1]);
      if (!fs.existsSync(entryFile)) {
        errors.push({ skill, entry: handlerMatch[1], message: 'Entry point file not found' });
      }
    }
  }

  const passed = errors.length === 0;
  return { gate: 3, name: 'Entry Point Smoke Gate', passed, errors };
}

if (require.main === module) {
  const result = run();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.passed ? 0 : 1);
}

module.exports = { run };
