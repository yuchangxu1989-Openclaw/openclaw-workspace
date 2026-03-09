#!/usr/bin/env node
/**
 * ISC Handler: Pipeline Benchmark — Skill Created Alignment
 * 对 skill.created 做通用对齐检查，覆盖能力锚点、分层架构、命名一致性与公开技能分类。
 */
'use strict';
const path = require('path');
const { scanFiles, checkFileExists, gateResult, writeReport } = require('../lib/handler-utils');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');
const SKILLS_DIR = path.join(WORKSPACE, 'skills');

function checkSkillCreatedAlignment() {
  const checks = [];
  const skillName = process.env.ISC_SKILL_NAME || '';

  // 1. SKILL.md 存在性
  if (skillName) {
    const skillDir = path.join(SKILLS_DIR, skillName);
    const skillMd = path.join(skillDir, 'SKILL.md');
    checks.push({
      name: 'skill-md-exists',
      ok: checkFileExists(skillMd),
      message: checkFileExists(skillMd) ? 'SKILL.md exists' : `Missing SKILL.md for ${skillName}`,
    });

    // 2. 命名一致性 (kebab-case)
    const isKebab = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(skillName);
    checks.push({
      name: 'naming-kebab-case',
      ok: isKebab,
      message: isKebab ? 'Skill name is kebab-case' : `Skill name "${skillName}" is not kebab-case`,
    });

    // 3. 分层架构检查 — 不应有顶层散落的 .js 文件（应在 lib/ 或 handlers/）
    const topJs = scanFiles(skillDir, /\.js$/, null, { maxDepth: 1 });
    const hasLooseJs = topJs.length > 0;
    checks.push({
      name: 'no-loose-top-level-js',
      ok: !hasLooseJs,
      message: hasLooseJs ? `Found ${topJs.length} loose .js files at skill root` : 'No loose top-level JS files',
    });

    // 4. 分类标签检查 — SKILL.md 应包含 domain/type/category 等分类信息
    if (checkFileExists(skillMd)) {
      const fs = require('fs');
      const content = fs.readFileSync(skillMd, 'utf8');
      const hasCategory = /domain|type|categor|分类|领域/i.test(content);
      checks.push({
        name: 'classification-present',
        ok: hasCategory,
        message: hasCategory ? 'Classification info found in SKILL.md' : 'SKILL.md lacks classification/domain info',
      });
    }
  } else {
    checks.push({
      name: 'skill-name-provided',
      ok: false,
      message: 'ISC_SKILL_NAME env not set — cannot run alignment checks',
    });
  }

  return checks;
}

function main() {
  const checks = checkSkillCreatedAlignment();
  const result = gateResult('pipeline-benchmark-skill-created-alignment', checks);

  const reportPath = path.join(WORKSPACE, 'reports', 'isc', `skill-created-alignment-${Date.now()}.json`);
  writeReport(reportPath, result);

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.exitCode);
}

main();
