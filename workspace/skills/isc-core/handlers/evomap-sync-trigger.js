#!/usr/bin/env node
/**
 * ISC Handler: EvoMap Sync Trigger
 * Rule: rule.auto-evomap-sync-trigger-001
 *
 * When a skill is published, updated, or its lifecycle status changes,
 * triggers EvoMap synchronization to keep the skill network consistent.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { scanFiles, writeReport, gateResult, checkFileExists, readRuleJson } = require('../lib/handler-utils');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');

/**
 * Scan skills directory and collect metadata for EvoMap sync
 */
function collectSkillMetadata(skillsDir) {
  const metadata = [];
  let dirs;
  try {
    dirs = fs.readdirSync(skillsDir).filter(d =>
      fs.statSync(path.join(skillsDir, d)).isDirectory()
    );
  } catch {
    return metadata;
  }

  for (const dir of dirs) {
    const skillPath = path.join(skillsDir, dir);
    const skillMd = path.join(skillPath, 'SKILL.md');
    const pkgJson = path.join(skillPath, 'package.json');

    const entry = {
      name: dir,
      path: skillPath,
      hasSkillMd: checkFileExists(skillMd),
      hasPackageJson: checkFileExists(pkgJson),
      version: null,
    };

    if (entry.hasPackageJson) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
        entry.version = pkg.version || null;
      } catch { /* skip */ }
    }

    metadata.push(entry);
  }

  return metadata;
}

function main() {
  const checks = [];
  const skillsDir = path.join(WORKSPACE, 'skills');

  // Check skills directory exists
  if (!checkFileExists(skillsDir)) {
    checks.push({
      name: 'skills-dir-exists',
      ok: false,
      message: 'Skills directory not found',
    });
    const gate = gateResult('evomap-sync-trigger', checks);
    console.log(JSON.stringify(gate, null, 2));
    process.exit(gate.exitCode);
  }
  checks.push({ name: 'skills-dir-exists', ok: true, message: 'Skills directory found' });

  // Collect skill metadata
  const metadata = collectSkillMetadata(skillsDir);
  checks.push({
    name: 'collect-metadata',
    ok: metadata.length > 0,
    message: `Collected metadata for ${metadata.length} skills`,
  });

  // Check EvoMap target directory
  const evomapDir = path.join(WORKSPACE, 'evomap');
  const evomapExists = checkFileExists(evomapDir);
  checks.push({
    name: 'evomap-dir-exists',
    ok: true, // non-blocking: evomap dir may not exist yet
    message: evomapExists ? 'EvoMap directory found' : 'EvoMap directory not found (will be created on sync)',
  });

  // Validate skills have minimum metadata for sync
  const syncReady = metadata.filter(m => m.hasSkillMd);
  const notReady = metadata.filter(m => !m.hasSkillMd);
  checks.push({
    name: 'sync-readiness',
    ok: true,
    message: `${syncReady.length} skills ready for sync, ${notReady.length} missing SKILL.md`,
  });

  // Write sync manifest report
  const reportDir = path.join(WORKSPACE, 'reports', 'isc');
  writeReport(path.join(reportDir, 'evomap-sync-trigger.json'), {
    handler: 'evomap-sync-trigger',
    ruleId: 'rule.auto-evomap-sync-trigger-001',
    timestamp: new Date().toISOString(),
    totalSkills: metadata.length,
    syncReady: syncReady.length,
    notReady: notReady.map(m => m.name),
    skills: metadata,
  });

  const gate = gateResult('evomap-sync-trigger', checks);
  console.log(JSON.stringify(gate, null, 2));
  process.exit(gate.exitCode);
}

main();
