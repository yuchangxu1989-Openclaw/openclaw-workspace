/**
 * Gate 1 — Data Source Gate
 * Blocks synthetic/generated data from entering tests/benchmarks/
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function run(options = {}) {
  const errors = [];
  let files;

  if (options.files) {
    files = options.files;
  } else {
    // Get staged JSON files under tests/benchmarks/
    try {
      const out = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf-8' });
      files = out.trim().split('\n').filter(f =>
        f.startsWith('tests/benchmarks/') && f.endsWith('.json')
      );
    } catch {
      files = [];
    }
  }

  for (const file of files) {
    if (!file) continue;
    try {
      const content = JSON.parse(fs.readFileSync(path.resolve(file), 'utf-8'));
      const items = Array.isArray(content) ? content : [content];
      for (const item of items) {
        const src = (item.data_source || '').toLowerCase();
        if (src === 'synthetic' || src === 'generated') {
          errors.push({ file, data_source: item.data_source, message: 'Synthetic/generated data not allowed' });
        }
        if (!item.data_source) {
          errors.push({ file, message: 'Missing data_source field' });
        }
      }
    } catch (e) {
      errors.push({ file, message: `Parse error: ${e.message}` });
    }
  }

  const passed = errors.length === 0;
  return { gate: 1, name: 'Data Source Gate', passed, errors };
}

if (require.main === module) {
  const result = run();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.passed ? 0 : 1);
}

module.exports = { run };
