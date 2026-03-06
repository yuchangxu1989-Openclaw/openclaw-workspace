#!/usr/bin/env node
'use strict';

/**
 * Condition 2: Runtime Enforcement PoC
 * 
 * Implements a real gate_check for ISC rule:
 *   rule.skill-mandatory-skill-md-001 — 每个技能目录必须有SKILL.md
 * 
 * This is executable enforcement code, not just a JSON field.
 */

const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.resolve(__dirname, '../skills');
const REPORT_PATH = path.resolve(__dirname, '../reports/enforcement-poc-report.json');

// Directories to exclude from the check
const EXCLUDE_DIRS = ['shared', 'node_modules', '.git'];

function gateCheck() {
  console.log('═══ Runtime Enforcement PoC ═══');
  console.log(`Rule: rule.skill-mandatory-skill-md-001`);
  console.log(`Check: Every skill directory must contain SKILL.md`);
  console.log(`Target: ${SKILLS_DIR}\n`);

  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  const violations = [];
  const compliant = [];
  let total = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (EXCLUDE_DIRS.includes(entry.name)) continue;
    if (entry.name.startsWith('.')) continue;

    total++;
    const skillDir = path.join(SKILLS_DIR, entry.name);
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    if (fs.existsSync(skillMdPath)) {
      compliant.push({
        skill: entry.name,
        path: skillMdPath,
        status: 'compliant',
      });
    } else {
      violations.push({
        skill: entry.name,
        path: skillDir,
        expected: skillMdPath,
        status: 'violation',
        rule_id: 'rule.skill-mandatory-skill-md-001',
        severity: 'P0',
        message: `SKILL.md missing in skills/${entry.name}/`,
      });
    }
  }

  // Print results
  console.log(`Scanned: ${total} skill directories`);
  console.log(`Compliant: ${compliant.length}`);
  console.log(`Violations: ${violations.length}\n`);

  if (violations.length > 0) {
    console.log('── Violations ──');
    for (const v of violations) {
      console.log(`  ❌ ${v.skill} — ${v.message}`);
    }
  } else {
    console.log('✅ All skill directories have SKILL.md');
  }

  // Write report
  const report = {
    rule_id: 'rule.skill-mandatory-skill-md-001',
    rule_name: 'Skill Mandatory SKILL.md',
    severity: 'P0',
    check_type: 'gate_check',
    timestamp: new Date().toISOString(),
    target: SKILLS_DIR,
    total_scanned: total,
    compliant_count: compliant.length,
    violation_count: violations.length,
    pass: violations.length === 0,
    violations: violations,
    compliant: compliant.map(c => c.skill),
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\nReport saved to ${REPORT_PATH}`);

  return report;
}

const report = gateCheck();
process.exit(report.pass ? 0 : 1);
