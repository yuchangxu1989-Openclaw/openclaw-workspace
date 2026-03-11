#!/usr/bin/env node
/**
 * ISC Handler: Classify Skill Distribution
 * Rule: rule.skill-distribution-auto-classify-001
 *
 * When a skill is created/modified, scans its content to determine
 * if it's "local" or "publishable" based on:
 *   1. Hardcoded absolute paths
 *   2. Workspace-specific file references
 *   3. Local config/secret dependencies
 *   4. Generic input/output interfaces
 *
 * Result is written to the skill's SKILL.md distribution field.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { scanFiles, writeReport, gateResult, checkFileExists } = require('../lib/handler-utils');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');

// Patterns that indicate "local-only" skill
const LOCAL_PATTERNS = [
  { name: 'hardcoded-absolute-path', regex: /(?:\/root\/|\/home\/\w+\/|\/Users\/\w+\/|C:\\Users\\)/g },
  { name: 'workspace-specific-ref', regex: /workspace-coder|\.openclaw\/workspace/g },
  { name: 'local-secret-dependency', regex: /(?:API_KEY|SECRET|TOKEN)\s*[:=]\s*['"][^'"]+['"]/g },
  { name: 'hardcoded-ip', regex: /(?:192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)/g },
];

// Patterns that indicate good "publishable" interfaces
const PUBLISHABLE_INDICATORS = [
  { name: 'env-var-config', regex: /process\.env\.\w+/g },
  { name: 'parameter-driven', regex: /(?:options|config|params)\s*[=:]/g },
  { name: 'module-exports', regex: /module\.exports/g },
];

function classifySkill(skillDir) {
  const issues = [];
  const positives = [];

  const files = [];
  try {
    const entries = fs.readdirSync(skillDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && /\.(js|ts|md|sh|json)$/.test(e.name)) {
        files.push(path.join(skillDir, e.name));
      }
    }
  } catch {
    return { classification: 'local', issues: ['Cannot read skill directory'], positives: [] };
  }

  // Also scan subdirectories one level deep
  scanFiles(skillDir, /\.(js|ts|md|sh|json)$/, (fp) => {
    if (!files.includes(fp)) files.push(fp);
  }, { maxDepth: 2 });

  for (const fp of files) {
    let content;
    try {
      content = fs.readFileSync(fp, 'utf8');
    } catch {
      continue;
    }
    const rel = path.relative(skillDir, fp);

    for (const pat of LOCAL_PATTERNS) {
      const matches = content.match(pat.regex);
      if (matches) {
        issues.push({
          file: rel,
          pattern: pat.name,
          count: matches.length,
          sample: matches[0].substring(0, 80),
        });
      }
    }

    for (const pat of PUBLISHABLE_INDICATORS) {
      const matches = content.match(pat.regex);
      if (matches) {
        positives.push({
          file: rel,
          indicator: pat.name,
          count: matches.length,
        });
      }
    }
  }

  const classification = issues.length === 0 ? 'publishable' : 'local';
  return { classification, issues, positives };
}

function main() {
  const results = {
    handler: 'classify-skill-distribution',
    ruleId: 'rule.skill-distribution-auto-classify-001',
    timestamp: new Date().toISOString(),
    checks: [],
  };

  const skillsDir = path.join(WORKSPACE, 'skills');
  if (!checkFileExists(skillsDir)) {
    console.log(JSON.stringify(gateResult('skill-distribution-classify', [{
      name: 'skills-dir-exists',
      ok: false,
      message: 'Skills directory not found',
    }])));
    process.exit(1);
  }

  let dirs;
  try {
    dirs = fs.readdirSync(skillsDir).filter(d =>
      fs.statSync(path.join(skillsDir, d)).isDirectory()
    );
  } catch {
    dirs = [];
  }

  for (const dir of dirs) {
    const skillPath = path.join(skillsDir, dir);
    const { classification, issues, positives } = classifySkill(skillPath);

    results.checks.push({
      name: `classify-${dir}`,
      ok: true, // classification itself always succeeds
      skill: dir,
      classification,
      localIssueCount: issues.length,
      issues: issues.slice(0, 5), // cap detail output
      publishableIndicators: positives.length,
    });
  }

  const reportDir = path.join(WORKSPACE, 'reports', 'isc');
  writeReport(path.join(reportDir, 'classify-skill-distribution.json'), results);

  const gate = gateResult('skill-distribution-classify', results.checks.map(c => ({
    name: c.name,
    ok: c.ok,
    message: `${c.skill}: ${c.classification} (${c.localIssueCount} issues)`,
  })));

  console.log(JSON.stringify(gate, null, 2));
  process.exit(gate.exitCode);
}

main();
