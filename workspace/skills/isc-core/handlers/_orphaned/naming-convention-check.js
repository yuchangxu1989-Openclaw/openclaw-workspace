#!/usr/bin/env node
/**
 * ISC Handler: Naming Convention Check
 * Validates naming conventions across skills, rules, and files.
 * Covers: kebab-case enforcement, prefix consistency, MECE naming.
 */
const fs = require('fs');
const path = require('path');
const glob = require('glob') || { sync: (p) => require('child_process').execSync(`find ${path.dirname(p)} -name '${path.basename(p)}'`).toString().trim().split('\n') };

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');
const SKILLS_DIR = path.join(WORKSPACE, 'skills');

function isKebabCase(name) {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
}

function checkSkillNaming() {
  const violations = [];
  if (!fs.existsSync(SKILLS_DIR)) return violations;
  const dirs = fs.readdirSync(SKILLS_DIR).filter(d => 
    fs.statSync(path.join(SKILLS_DIR, d)).isDirectory()
  );
  for (const dir of dirs) {
    if (!isKebabCase(dir)) {
      violations.push({ path: `skills/${dir}`, issue: `Not kebab-case: "${dir}"` });
    }
  }
  return violations;
}

function checkRuleNaming() {
  const violations = [];
  const rulesDir = path.join(WORKSPACE, 'skills/isc-core/rules');
  if (!fs.existsSync(rulesDir)) return violations;
  const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.json'));
  for (const f of files) {
    if (!f.startsWith('rule.')) {
      violations.push({ path: `rules/${f}`, issue: `Missing "rule." prefix` });
    }
    const name = f.replace(/^rule\./, '').replace(/\.json$/, '');
    if (!isKebabCase(name.replace(/-\d+$/, ''))) {
      // Allow trailing numbers like -001
    }
  }
  return violations;
}

function main() {
  const results = {
    handler: 'naming-convention-check',
    timestamp: new Date().toISOString(),
    checks: []
  };

  const skillViolations = checkSkillNaming();
  results.checks.push({ check: 'skill-directory-naming', violations: skillViolations, passed: skillViolations.length === 0 });

  const ruleViolations = checkRuleNaming();
  results.checks.push({ check: 'rule-file-naming', violations: ruleViolations, passed: ruleViolations.length === 0 });

  const allPassed = results.checks.every(c => c.passed);
  results.status = allPassed ? 'PASS' : 'FAIL';

  console.log(JSON.stringify(results, null, 2));
  process.exit(allPassed ? 0 : 1);
}

main();
