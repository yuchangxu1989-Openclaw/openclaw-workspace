#!/usr/bin/env node
/**
 * ISC Handler: Document Structure Check
 * Validates document structure standards (SKILL.md, README, design docs).
 */
const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');

const SKILL_MD_REQUIRED = ['description', '触发条件'];

function checkSkillMdStructure() {
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
      continue;
    }
    const content = fs.readFileSync(skillMd, 'utf8');
    if (content.length < 50) {
      violations.push({ skill: dir, issue: 'SKILL.md too short (<50 chars)' });
    }
    if (!content.includes('#')) {
      violations.push({ skill: dir, issue: 'No headers in SKILL.md' });
    }
  }
  return violations;
}

function checkDesignDocs() {
  const violations = [];
  const docsDir = path.join(WORKSPACE, 'docs');
  if (!fs.existsSync(docsDir)) return violations;
  const mdFiles = fs.readdirSync(docsDir).filter(f => f.endsWith('.md'));
  for (const f of mdFiles) {
    const content = fs.readFileSync(path.join(docsDir, f), 'utf8');
    if (!content.match(/^#\s/m)) {
      violations.push({ file: f, issue: 'No top-level header' });
    }
  }
  return violations;
}

function main() {
  const results = {
    handler: 'document-structure-check',
    timestamp: new Date().toISOString(),
    checks: []
  };

  const skillV = checkSkillMdStructure();
  results.checks.push({ check: 'skill-md-structure', violations: skillV, passed: skillV.length === 0 });

  const docV = checkDesignDocs();
  results.checks.push({ check: 'design-doc-structure', violations: docV, passed: docV.length === 0 });

  results.status = results.checks.every(c => c.passed) ? 'PASS' : 'FAIL';
  console.log(JSON.stringify(results, null, 2));
  process.exit(results.status === 'PASS' ? 0 : 1);
}

main();
