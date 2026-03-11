#!/usr/bin/env node
/**
 * ISC Handler: Completeness Check
 * Validates that rules, skills, and configs have all required fields.
 */
const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');

const REQUIRED_RULE_FIELDS = ['id', 'description', 'severity', 'tags', 'action'];
const REQUIRED_SKILL_MD_SECTIONS = ['#', '## 触发条件', '## 输出'];

function checkRuleCompleteness() {
  const violations = [];
  const rulesDir = path.join(WORKSPACE, 'skills/isc-core/rules');
  if (!fs.existsSync(rulesDir)) return violations;
  const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.json'));
  for (const f of files) {
    try {
      const rule = JSON.parse(fs.readFileSync(path.join(rulesDir, f), 'utf8'));
      const missing = REQUIRED_RULE_FIELDS.filter(field => !rule[field]);
      if (missing.length > 0) {
        violations.push({ file: f, missing });
      }
    } catch (e) {
      violations.push({ file: f, error: 'Invalid JSON' });
    }
  }
  return violations;
}

function checkSkillMdExists() {
  const violations = [];
  const skillsDir = path.join(WORKSPACE, 'skills');
  if (!fs.existsSync(skillsDir)) return violations;
  const dirs = fs.readdirSync(skillsDir).filter(d =>
    fs.statSync(path.join(skillsDir, d)).isDirectory()
  );
  for (const dir of dirs) {
    const skillMd = path.join(skillsDir, dir, 'SKILL.md');
    if (!fs.existsSync(skillMd)) {
      violations.push({ skill: dir, issue: 'Missing SKILL.md' });
    }
  }
  return violations;
}

function main() {
  const results = {
    handler: 'completeness-check',
    timestamp: new Date().toISOString(),
    checks: []
  };

  const ruleViolations = checkRuleCompleteness();
  results.checks.push({ check: 'rule-field-completeness', violations: ruleViolations, passed: ruleViolations.length === 0 });

  const skillViolations = checkSkillMdExists();
  results.checks.push({ check: 'skill-md-exists', violations: skillViolations, passed: skillViolations.length === 0 });

  const allPassed = results.checks.every(c => c.passed);
  results.status = allPassed ? 'PASS' : 'FAIL';
  console.log(JSON.stringify(results, null, 2));
  process.exit(allPassed ? 0 : 1);
}

main();
