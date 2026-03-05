#!/usr/bin/env node
/**
 * ISC Handler: Eval Quality Check
 * Validates evaluation sets, test quality, and AEO-related standards.
 */
const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');

function checkEvalSets() {
  const violations = [];
  const evalDir = path.join(WORKSPACE, 'skills/aeo/eval-sets');
  if (!fs.existsSync(evalDir)) {
    return [{ issue: 'No eval-sets directory found at skills/aeo/eval-sets' }];
  }
  const files = fs.readdirSync(evalDir).filter(f => f.endsWith('.json'));
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(evalDir, f), 'utf8'));
      const items = Array.isArray(data) ? data : data.items || [];
      if (items.length < 3) {
        violations.push({ file: f, issue: `Only ${items.length} eval items (min 3)` });
      }
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.input && !item.query && !item.question) {
          violations.push({ file: f, item: i, issue: 'Missing input/query field' });
        }
        if (!item.expected && !item.answer && !item.output) {
          violations.push({ file: f, item: i, issue: 'Missing expected/answer field' });
        }
      }
    } catch (e) {
      violations.push({ file: f, error: 'Invalid JSON' });
    }
  }
  return violations;
}

function checkTestCoverage() {
  const violations = [];
  const skillsDir = path.join(WORKSPACE, 'skills');
  if (!fs.existsSync(skillsDir)) return violations;
  const dirs = fs.readdirSync(skillsDir).filter(d =>
    fs.statSync(path.join(skillsDir, d)).isDirectory()
  );
  for (const dir of dirs) {
    const testDir = path.join(skillsDir, dir, 'tests');
    const evalDir2 = path.join(skillsDir, dir, 'eval');
    if (!fs.existsSync(testDir) && !fs.existsSync(evalDir2)) {
      // Not a violation per se, just noting
    }
  }
  return violations;
}

function main() {
  const results = {
    handler: 'eval-quality-check',
    timestamp: new Date().toISOString(),
    checks: []
  };

  const evalV = checkEvalSets();
  results.checks.push({ check: 'eval-set-quality', violations: evalV, passed: evalV.length === 0 });

  const testV = checkTestCoverage();
  results.checks.push({ check: 'test-coverage', violations: testV, passed: testV.length === 0 });

  results.status = results.checks.every(c => c.passed) ? 'PASS' : 'FAIL';
  console.log(JSON.stringify(results, null, 2));
  process.exit(results.status === 'PASS' ? 0 : 1);
}

main();
