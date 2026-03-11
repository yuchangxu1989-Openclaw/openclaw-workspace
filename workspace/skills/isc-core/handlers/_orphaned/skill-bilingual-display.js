#!/usr/bin/env node
/**
 * ISC Handler: Skill Bilingual Display (N006)
 * Validates that skill names in reports/outputs include both English and Chinese names.
 * Pattern: english-name(中文名)
 * Uses handler-utils.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { scanFiles, checkFileExists, writeReport, gateResult } = require('../lib/handler-utils');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');
const SKILLS_DIR = path.join(WORKSPACE, 'skills');
const REPORT_PATH = path.join(WORKSPACE, 'reports/skill-bilingual-display-report.json');

const BILINGUAL_PATTERN = /^[a-z0-9-]+\([^\x00-\x7F]+\)$/;

function getSkillDisplayName(skillDir) {
  const skillMd = path.join(SKILLS_DIR, skillDir, 'SKILL.md');
  if (!checkFileExists(skillMd)) return null;
  try {
    const content = fs.readFileSync(skillMd, 'utf8');
    const match = content.match(/^#\s+(.+)/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

function main() {
  const checks = [];

  // 1. Enumerate skills
  let skillDirs = [];
  try {
    skillDirs = fs.readdirSync(SKILLS_DIR).filter(d =>
      fs.statSync(path.join(SKILLS_DIR, d)).isDirectory()
    );
  } catch {
    // no skills dir
  }

  checks.push({
    name: 'skills_enumerated',
    ok: skillDirs.length > 0,
    message: `Found ${skillDirs.length} skill directories`,
  });

  // 2. Check each skill for bilingual display name
  const violations = [];
  const compliant = [];
  for (const dir of skillDirs) {
    const displayName = getSkillDisplayName(dir);
    if (!displayName) {
      violations.push({ skill: dir, issue: 'No SKILL.md or missing title' });
    } else if (!BILINGUAL_PATTERN.test(`${dir}(${displayName})`)) {
      // Check if displayName itself contains Chinese
      const hasChinese = /[\u4e00-\u9fa5]/.test(displayName);
      if (!hasChinese) {
        violations.push({ skill: dir, displayName, issue: 'Missing Chinese name in SKILL.md title' });
      } else {
        compliant.push({ skill: dir, display: `${dir}(${displayName})` });
      }
    } else {
      compliant.push({ skill: dir, display: `${dir}(${displayName})` });
    }
  }

  checks.push({
    name: 'bilingual_display_names',
    ok: violations.length === 0,
    message: violations.length === 0
      ? `All ${skillDirs.length} skills have bilingual display names`
      : `${violations.length} skills missing bilingual names`,
  });

  const result = gateResult('skill-bilingual-display', checks);

  const report = {
    ...result,
    timestamp: new Date().toISOString(),
    total_skills: skillDirs.length,
    compliant: compliant.length,
    violations,
  };

  writeReport(REPORT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(result.exitCode);
}

main();
