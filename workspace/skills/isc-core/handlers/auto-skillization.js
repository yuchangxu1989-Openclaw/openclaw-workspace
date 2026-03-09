#!/usr/bin/env node
/**
 * ISC Handler: Auto Skillization Trigger
 * Rule: rule.auto-skillization-trigger-001
 *
 * When a skill's quality score >= 50, triggers the skillization pipeline.
 * Scans skill directories for quality indicators and determines readiness.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { scanFiles, writeReport, gateResult, checkFileExists } = require('../lib/handler-utils');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');
const QUALITY_THRESHOLD = 50;

/**
 * Compute a simple quality score for a skill directory based on:
 * - Has SKILL.md (+15)
 * - Has tests (+15)
 * - Has package.json or index.js (+10)
 * - Has README or docs (+10)
 * - File count > 3 (+10)
 * - No TODO/FIXME density > 5% (-10 per excess)
 */
function computeQualityScore(skillDir) {
  let score = 0;
  const details = [];

  if (checkFileExists(path.join(skillDir, 'SKILL.md'))) {
    score += 15;
    details.push('has SKILL.md (+15)');
  }

  const hasTests = checkFileExists(path.join(skillDir, 'tests')) ||
    checkFileExists(path.join(skillDir, '__tests__')) ||
    checkFileExists(path.join(skillDir, 'test'));
  if (hasTests) {
    score += 15;
    details.push('has tests (+15)');
  }

  if (checkFileExists(path.join(skillDir, 'package.json')) ||
      checkFileExists(path.join(skillDir, 'index.js'))) {
    score += 10;
    details.push('has entry point (+10)');
  }

  if (checkFileExists(path.join(skillDir, 'README.md')) ||
      checkFileExists(path.join(skillDir, 'docs'))) {
    score += 10;
    details.push('has docs (+10)');
  }

  const allFiles = scanFiles(skillDir, /\.(js|ts|py|sh|md|json)$/, null, { maxDepth: 3 });
  if (allFiles.length > 3) {
    score += 10;
    details.push(`file count ${allFiles.length} > 3 (+10)`);
  }

  // Check TODO/FIXME density
  let totalLines = 0;
  let todoCount = 0;
  for (const fp of allFiles.slice(0, 20)) {
    try {
      const content = fs.readFileSync(fp, 'utf8');
      const lines = content.split('\n');
      totalLines += lines.length;
      todoCount += lines.filter(l => /TODO|FIXME|HACK|XXX/i.test(l)).length;
    } catch { /* skip */ }
  }
  if (totalLines > 0 && (todoCount / totalLines) > 0.05) {
    score -= 10;
    details.push(`high TODO density ${todoCount}/${totalLines} (-10)`);
  }

  return { score: Math.max(0, Math.min(100, score)), details };
}

function main() {
  const results = {
    handler: 'auto-skillization',
    ruleId: 'rule.auto-skillization-trigger-001',
    timestamp: new Date().toISOString(),
    threshold: QUALITY_THRESHOLD,
    skills: [],
  };

  const skillsDir = path.join(WORKSPACE, 'skills');
  if (!checkFileExists(skillsDir)) {
    const gate = gateResult('auto-skillization', [{
      name: 'skills-dir-exists',
      ok: false,
      message: 'Skills directory not found',
    }]);
    console.log(JSON.stringify(gate, null, 2));
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

  const checks = [];
  for (const dir of dirs) {
    const skillPath = path.join(skillsDir, dir);
    const { score, details } = computeQualityScore(skillPath);
    const ready = score >= QUALITY_THRESHOLD;

    results.skills.push({ skill: dir, score, ready, details });
    checks.push({
      name: `skillization-${dir}`,
      ok: true,
      message: `${dir}: score=${score} ${ready ? '→ READY' : '→ not ready'}`,
    });
  }

  const reportDir = path.join(WORKSPACE, 'reports', 'isc');
  writeReport(path.join(reportDir, 'auto-skillization.json'), results);

  const gate = gateResult('auto-skillization', checks);
  console.log(JSON.stringify(gate, null, 2));
  process.exit(gate.exitCode);
}

main();
