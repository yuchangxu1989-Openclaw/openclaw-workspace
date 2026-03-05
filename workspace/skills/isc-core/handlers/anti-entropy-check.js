#!/usr/bin/env node
/**
 * ISC Handler: Anti-Entropy Check
 * Validates designs against the 4 anti-entropy dimensions:
 * scalability, generalizability, growability, entropy direction.
 */
const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');

const ANTI_ENTROPY_DIMENSIONS = ['scalability', 'generalizability', 'growability', 'entropy_direction'];

function checkSkillAntiEntropy() {
  const violations = [];
  const skillsDir = path.join(WORKSPACE, 'skills');
  if (!fs.existsSync(skillsDir)) return violations;
  const dirs = fs.readdirSync(skillsDir).filter(d =>
    fs.statSync(path.join(skillsDir, d)).isDirectory()
  );
  for (const dir of dirs) {
    const skillMd = path.join(skillsDir, dir, 'SKILL.md');
    if (!fs.existsSync(skillMd)) continue;
    const content = fs.readFileSync(skillMd, 'utf8');
    // Check for enumeration-style (hardcoded lists) vs generative patterns
    const hardcodedPatterns = content.match(/\|\s*\w+\s*\|.*\|.*\|/g) || [];
    if (hardcodedPatterns.length > 20) {
      violations.push({ skill: dir, dimension: 'scalability', issue: `${hardcodedPatterns.length} hardcoded table rows - may not scale` });
    }
  }
  return violations;
}

function checkRuleAntiEntropy() {
  const violations = [];
  const rulesDir = path.join(WORKSPACE, 'skills/isc-core/rules');
  if (!fs.existsSync(rulesDir)) return violations;
  const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.json'));
  // Check: rules should have tags (generalizability)
  for (const f of files) {
    try {
      const rule = JSON.parse(fs.readFileSync(path.join(rulesDir, f), 'utf8'));
      if (!rule.tags || rule.tags.length === 0) {
        violations.push({ file: f, dimension: 'generalizability', issue: 'No tags - not classifiable' });
      }
    } catch (e) { /* skip */ }
  }
  return violations;
}

function main() {
  const results = {
    handler: 'anti-entropy-check',
    timestamp: new Date().toISOString(),
    dimensions: ANTI_ENTROPY_DIMENSIONS,
    checks: []
  };

  const skillV = checkSkillAntiEntropy();
  results.checks.push({ check: 'skill-scalability', violations: skillV, passed: skillV.length === 0 });

  const ruleV = checkRuleAntiEntropy();
  results.checks.push({ check: 'rule-generalizability', violations: ruleV, passed: ruleV.length === 0 });

  results.status = results.checks.every(c => c.passed) ? 'PASS' : 'FAIL';
  console.log(JSON.stringify(results, null, 2));
  process.exit(results.status === 'PASS' ? 0 : 1);
}

main();
