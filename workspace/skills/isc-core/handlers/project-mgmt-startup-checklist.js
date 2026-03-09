#!/usr/bin/env node
/**
 * ISC Handler: Project Management — Startup Checklist Gate
 * 启动项目/Sprint时，检查自检清单和历史经验是否已阅读。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { checkFileExists, gateResult, writeReport } = require('../lib/handler-utils');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');

function checkStartupChecklist() {
  const checks = [];

  // 1. project-mgmt SKILL.md 存在
  const skillMd = path.join(WORKSPACE, 'skills', 'project-mgmt', 'SKILL.md');
  checks.push({
    name: 'project-mgmt-skill-md',
    ok: checkFileExists(skillMd),
    message: checkFileExists(skillMd) ? 'project-mgmt/SKILL.md exists' : 'Missing project-mgmt/SKILL.md',
  });

  // 2. anti-patterns.md 存在
  const antiPatterns = path.join(WORKSPACE, 'skills', 'project-mgmt', 'lessons', 'anti-patterns.md');
  checks.push({
    name: 'anti-patterns-readable',
    ok: checkFileExists(antiPatterns),
    message: checkFileExists(antiPatterns) ? 'anti-patterns.md exists and readable' : 'Missing anti-patterns.md',
  });

  // 3. SKILL.md 包含关键清单项
  if (checkFileExists(skillMd)) {
    const content = fs.readFileSync(skillMd, 'utf8');
    const checklistItems = ['目标', '验收', '并行', '拆分'];
    const found = checklistItems.filter(item => content.includes(item));
    checks.push({
      name: 'skill-md-has-checklist-keywords',
      ok: found.length >= 2,
      message: `Found ${found.length}/${checklistItems.length} checklist keywords in SKILL.md`,
    });
  }

  // 4. 历史 lessons 目录有内容可供参考
  const lessonsDir = path.join(WORKSPACE, 'skills', 'project-mgmt', 'lessons');
  if (checkFileExists(lessonsDir)) {
    const files = fs.readdirSync(lessonsDir).filter(f => f.endsWith('.md'));
    checks.push({
      name: 'historical-lessons-available',
      ok: files.length > 0,
      message: `${files.length} historical lesson files available`,
    });
  } else {
    checks.push({
      name: 'historical-lessons-available',
      ok: false,
      message: 'No lessons directory found',
    });
  }

  return checks;
}

function main() {
  const checks = checkStartupChecklist();
  const result = gateResult('project-mgmt-startup-checklist', checks);

  const reportPath = path.join(WORKSPACE, 'reports', 'isc', `startup-checklist-${Date.now()}.json`);
  writeReport(reportPath, result);

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.exitCode);
}

main();
