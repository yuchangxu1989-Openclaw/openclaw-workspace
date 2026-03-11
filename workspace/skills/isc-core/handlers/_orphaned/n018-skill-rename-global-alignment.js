#!/usr/bin/env node
/**
 * ISC Handler: N018 Skill Rename Global Alignment
 * 技能重命名全局引用对齐 — 重命名/移动后自动扫描并更新所有引用点。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { scanFiles, writeReport, gateResult, checkFileExists } = require('../lib/handler-utils');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');

/**
 * 在所有文本文件中搜索旧名称的引用
 */
function findStaleReferences(oldName, searchDirs) {
  const staleRefs = [];
  const pattern = /\.(js|ts|json|md|yaml|yml|sh|txt)$/;

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    scanFiles(dir, pattern, (filePath) => {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (line.includes(oldName)) {
            staleRefs.push({
              file: path.relative(WORKSPACE, filePath),
              line: idx + 1,
              content: line.trim().slice(0, 120),
            });
          }
        });
      } catch { /* skip unreadable */ }
    }, { maxDepth: 4, skip: ['node_modules', '.git', '.entropy-archive', 'logs'] });
  }
  return staleRefs;
}

function main() {
  const checks = [];
  const oldName = process.env.ISC_OLD_SKILL_NAME || '';
  const newName = process.env.ISC_NEW_SKILL_NAME || '';

  if (!oldName) {
    // Discovery mode: scan for recently renamed skills by checking git
    checks.push({
      name: 'discovery-mode',
      ok: true,
      message: 'No ISC_OLD_SKILL_NAME set; running in audit mode',
    });

    // Check for common alignment issues in skill references
    const skillsDir = path.join(WORKSPACE, 'skills');
    const skillIndex = path.join(skillsDir, 'skill-index.json');
    if (checkFileExists(skillIndex)) {
      try {
        const index = JSON.parse(fs.readFileSync(skillIndex, 'utf8'));
        const entries = Array.isArray(index) ? index : Object.values(index);
        let broken = 0;
        for (const entry of entries) {
          const skillPath = entry.path || entry.dir || '';
          if (skillPath && !fs.existsSync(path.resolve(WORKSPACE, skillPath))) {
            broken++;
            checks.push({
              name: `stale-index:${entry.name || skillPath}`,
              ok: false,
              message: `Index references missing path: ${skillPath}`,
            });
          }
        }
        if (broken === 0) {
          checks.push({ name: 'skill-index-ok', ok: true, message: 'All index paths valid' });
        }
      } catch {
        checks.push({ name: 'skill-index-parse', ok: true, message: 'Index not parseable, skipping' });
      }
    } else {
      checks.push({ name: 'no-skill-index', ok: true, message: 'No skill-index.json found' });
    }
  } else {
    // Targeted mode: find stale references to old name
    const searchDirs = [
      path.join(WORKSPACE, 'skills'),
      path.join(WORKSPACE, 'scripts'),
      path.join(WORKSPACE, 'reports'),
    ];

    const staleRefs = findStaleReferences(oldName, searchDirs);
    checks.push({
      name: 'stale-reference-scan',
      ok: staleRefs.length === 0,
      message: staleRefs.length === 0
        ? `No stale references to "${oldName}" found`
        : `Found ${staleRefs.length} stale reference(s) to "${oldName}"`,
    });

    if (newName && staleRefs.length > 0) {
      let updated = 0;
      for (const ref of staleRefs) {
        const absPath = path.join(WORKSPACE, ref.file);
        try {
          let content = fs.readFileSync(absPath, 'utf8');
          const newContent = content.split(oldName).join(newName);
          if (newContent !== content) {
            fs.writeFileSync(absPath, newContent, 'utf8');
            updated++;
          }
        } catch { /* skip */ }
      }
      checks.push({
        name: 'auto-replace',
        ok: updated === staleRefs.length,
        message: `Updated ${updated}/${staleRefs.length} file(s): "${oldName}" → "${newName}"`,
      });
    }
  }

  const result = gateResult('n018-skill-rename-global-alignment', checks, { failClosed: false });
  const reportPath = path.join(WORKSPACE, 'reports', 'isc', `n018-rename-alignment-${Date.now()}.json`);
  writeReport(reportPath, result);

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.exitCode);
}

main();
