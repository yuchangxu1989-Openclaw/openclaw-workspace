/**
 * Gate 6 — Independent QA Gate
 * Runs P0 unit tests
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function run(options = {}) {
  const errors = [];
  const root = path.resolve(options.root || '.');
  const testsDir = path.join(root, 'tests/unit');

  if (!fs.existsSync(testsDir)) {
    return { gate: 6, name: 'Independent QA Gate', passed: true, errors: [], note: 'No unit tests directory' };
  }

  // Find test files marked as P0 (convention: filename contains "p0" or file has @priority P0 comment)
  const testFiles = fs.readdirSync(testsDir).filter(f => f.endsWith('.test.js'));

  const p0Files = testFiles.filter(f => {
    const content = fs.readFileSync(path.join(testsDir, f), 'utf-8');
    return f.includes('p0') || content.includes('@priority P0') || content.includes('priority: "P0"');
  });

  if (p0Files.length === 0) {
    return { gate: 6, name: 'Independent QA Gate', passed: true, errors: [], note: 'No P0 tests found' };
  }

  for (const testFile of p0Files) {
    try {
      execSync(`node ${path.join(testsDir, testFile)}`, { encoding: 'utf-8', cwd: root, timeout: 30000 });
    } catch (e) {
      errors.push({ test: testFile, message: `Test failed: ${(e.stderr || e.message).slice(0, 200)}` });
    }
  }

  const passed = errors.length === 0;
  return { gate: 6, name: 'Independent QA Gate', passed, errors, testsRun: p0Files.length };
}

if (require.main === module) {
  const result = run();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.passed ? 0 : 1);
}

module.exports = { run };
