#!/usr/bin/env node
/**
 * ISC Handler: N019 Auto SKILL.md Generation
 * 自动SKILL.md生成 — 代码存在但SKILL.md缺失/质量低时自动生成。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { scanFiles, writeReport, gateResult, checkFileExists } = require('../lib/handler-utils');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');
const MIN_QUALITY_SCORE = parseInt(process.env.ISC_SKILLMD_MIN_QUALITY || '50', 10);

/**
 * 评估 SKILL.md 质量 (0-100)
 */
function scoreSkillMd(content) {
  let score = 0;
  if (!content || content.trim().length < 50) return 0;

  // Has title
  if (/^#\s+.+/m.test(content)) score += 15;
  // Has description section
  if (/描述|description|overview|概述/i.test(content)) score += 10;
  // Has usage/example
  if (/用法|usage|example|示例/i.test(content)) score += 15;
  // Has parameters/config
  if (/参数|parameter|config|配置/i.test(content)) score += 10;
  // Has trigger/event info
  if (/触发|trigger|event|事件/i.test(content)) score += 10;
  // Decent length (>200 chars)
  if (content.length > 200) score += 10;
  // Has code block
  if (/```/.test(content)) score += 10;
  // Multiple sections (>=3 headers)
  const headers = (content.match(/^#{1,3}\s+.+/gm) || []).length;
  if (headers >= 3) score += 10;
  // Has Chinese content (context-appropriate)
  if (/[\u4e00-\u9fff]/.test(content)) score += 10;

  return Math.min(score, 100);
}

/**
 * 生成基础 SKILL.md 模板
 */
function generateSkillMdTemplate(skillDir, skillName) {
  const files = [];
  try {
    const entries = fs.readdirSync(skillDir);
    for (const e of entries) {
      if (/\.(js|ts|py|sh)$/.test(e)) files.push(e);
    }
  } catch { /* skip */ }

  return `# ${skillName}

## 概述

> 自动生成的 SKILL.md — 请补充详细描述。

## 文件结构

${files.map(f => `- \`${f}\``).join('\n') || '- (no code files detected)'}

## 用法

\`\`\`bash
# TODO: 补充使用示例
\`\`\`

## 触发条件

- 待补充

## 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| - | - | 待补充 |
`;
}

function main() {
  const checks = [];
  const skillsDir = path.join(WORKSPACE, 'skills');
  const generated = [];
  const lowQuality = [];

  if (!fs.existsSync(skillsDir)) {
    checks.push({ name: 'skills-dir', ok: true, message: 'No skills directory found' });
    const result = gateResult('n019-auto-skill-md-generation', checks);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
    return;
  }

  // Scan each skill directory
  let entries;
  try {
    entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  } catch {
    entries = [];
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (['node_modules', '.git'].includes(entry.name)) continue;

    const skillDir = path.join(skillsDir, entry.name);
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    const hasCode = fs.readdirSync(skillDir).some(f => /\.(js|ts|py|sh)$/.test(f));

    if (!hasCode) continue; // Skip non-code directories

    if (!checkFileExists(skillMdPath)) {
      // Missing SKILL.md — generate
      const template = generateSkillMdTemplate(skillDir, entry.name);
      fs.writeFileSync(skillMdPath, template, 'utf8');
      generated.push(entry.name);
    } else {
      // Exists — check quality
      const content = fs.readFileSync(skillMdPath, 'utf8');
      const score = scoreSkillMd(content);
      if (score < MIN_QUALITY_SCORE) {
        lowQuality.push({ name: entry.name, score });
      }
    }
  }

  checks.push({
    name: 'missing-skillmd-gen',
    ok: true,
    message: generated.length === 0
      ? 'All code skills have SKILL.md'
      : `Generated SKILL.md for ${generated.length} skill(s): ${generated.join(', ')}`,
  });

  checks.push({
    name: 'quality-audit',
    ok: lowQuality.length === 0,
    message: lowQuality.length === 0
      ? 'All SKILL.md files meet quality threshold'
      : `${lowQuality.length} below threshold: ${lowQuality.map(q => `${q.name}(${q.score})`).join(', ')}`,
  });

  const result = gateResult('n019-auto-skill-md-generation', checks, { failClosed: false });
  const reportPath = path.join(WORKSPACE, 'reports', 'isc', `n019-skillmd-gen-${Date.now()}.json`);
  writeReport(reportPath, { ...result, generated, lowQuality });

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.exitCode);
}

main();
