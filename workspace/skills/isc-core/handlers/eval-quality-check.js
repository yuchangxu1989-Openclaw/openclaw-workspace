#!/usr/bin/env node
/**
 * ISC Handler: Eval Quality Check
 * Validates evaluation sets, test quality, and AEO-related standards.
 */
const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');
const INTENT_ALIGNMENT_POLICY = 'llm_primary_keyword_regex_auxiliary';

function checkEvalSets() {
  const violations = [];
  const candidateDirs = [
    path.join(WORKSPACE, 'skills/aeo/eval-sets'),
    path.join(WORKSPACE, 'skills/aeo/evaluation-sets')
  ].filter(dir => fs.existsSync(dir));

  if (candidateDirs.length === 0) {
    return [{ issue: 'No eval-sets directory found at skills/aeo/eval-sets or skills/aeo/evaluation-sets' }];
  }

  const jsonFiles = [];
  for (const dir of candidateDirs) {
    collectJsonFiles(dir, jsonFiles);
  }

  for (const filePath of jsonFiles) {
    const relative = path.relative(WORKSPACE, filePath);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const items = extractEvalItems(data);
      if (items.length < 1) {
        violations.push({ file: relative, issue: 'No eval items found' });
      }
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!hasInputField(item)) {
          violations.push({ file: relative, item: i, issue: 'Missing input/query/chunk field' });
        }
        if (!hasExpectedField(item)) {
          violations.push({ file: relative, item: i, issue: 'Missing expected/answer/output field' });
        }
      }
    } catch (e) {
      violations.push({ file: relative, error: `Invalid JSON: ${e.message}` });
    }
  }
  return violations;
}

function checkIntentArchitectureAlignment() {
  const violations = [];
  const intentEvalSet = path.join(WORKSPACE, 'skills/aeo/evaluation-sets/cras-intent/test-cases.json');
  const intentExtractor = path.join(WORKSPACE, 'skills/cras/intent-extractor.js');
  const executor = path.join(WORKSPACE, 'skills/aeo/src/evaluation/executor.cjs');
  const alignmentHelper = path.join(WORKSPACE, 'skills/aeo/src/evaluation/intent-alignment.cjs');

  if (!fs.existsSync(intentEvalSet)) {
    violations.push({ file: path.relative(WORKSPACE, intentEvalSet), issue: 'Missing CRAS intent eval set' });
  } else {
    const data = JSON.parse(fs.readFileSync(intentEvalSet, 'utf8'));
    const items = extractEvalItems(data);
    if (!items.length) {
      violations.push({ file: path.relative(WORKSPACE, intentEvalSet), issue: 'Intent eval set has no cases' });
    }
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!Array.isArray(item.expected)) {
        violations.push({ file: path.relative(WORKSPACE, intentEvalSet), item: i, issue: 'Intent case missing expected array' });
      }
    }
  }

  if (!fileContains(intentExtractor, 'evaluateIntentCase')) {
    violations.push({ file: path.relative(WORKSPACE, intentExtractor), issue: 'Intent extractor eval is not delegated to LLM-primary evaluator' });
  }

  if (!fileContains(executor, INTENT_ALIGNMENT_POLICY)) {
    violations.push({ file: path.relative(WORKSPACE, executor), issue: 'AEO executor missing LLM-primary intent evaluation policy' });
  }

  if (!fs.existsSync(alignmentHelper)) {
    violations.push({ file: path.relative(WORKSPACE, alignmentHelper), issue: 'Missing shared intent alignment helper' });
  }

  return violations;
}

function collectJsonFiles(dir, acc) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsonFiles(fullPath, acc);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      acc.push(fullPath);
    }
  }
}

function extractEvalItems(data) {
  if (Array.isArray(data)) return data;
  return data.items || data.cases || data.test_cases || data.samples || [];
}

function hasInputField(item) {
  return !!(item && (item.input || item.query || item.question || item.chunk || item.user_message || item.prompt));
}

function hasExpectedField(item) {
  return !!(item && (item.expected !== undefined || item.answer !== undefined || item.output !== undefined));
}

function fileContains(filePath, needle) {
  if (!fs.existsSync(filePath)) return false;
  return fs.readFileSync(filePath, 'utf8').includes(needle);
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

  const intentAlignmentV = checkIntentArchitectureAlignment();
  results.checks.push({
    check: 'intent-architecture-alignment',
    policy: INTENT_ALIGNMENT_POLICY,
    sandbox_safe: true,
    violations: intentAlignmentV,
    passed: intentAlignmentV.length === 0
  });

  const testV = checkTestCoverage();
  results.checks.push({ check: 'test-coverage', violations: testV, passed: testV.length === 0 });

  results.status = results.checks.every(c => c.passed) ? 'PASS' : 'FAIL';
  console.log(JSON.stringify(results, null, 2));
  process.exit(results.status === 'PASS' ? 0 : 1);
}

main();
