#!/usr/bin/env node
/**
 * ISC Pre-Commit Check
 * 检查 git staged files 是否违反 ISC 规则。
 * Exit 1 = 阻止提交, Exit 0 = 放行。
 */
'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const WS = path.resolve(__dirname, '..');
const RULES_DIR = path.join(WS, 'skills/isc-core/rules');

function staged() {
  try {
    return execSync('git diff --cached --name-only --diff-filter=ACM', { cwd: WS, encoding: 'utf8' })
      .trim().split('\n').filter(Boolean);
  } catch { return []; }
}

function main() {
  const files = staged();
  if (!files.length) process.exit(0);

  const errors = [];
  const warnings = [];

  // --- Rule 1: skills/下的目录必须有SKILL.md ---
  const skillDirs = new Set();
  for (const f of files) {
    const m = f.match(/^skills\/([^/]+)\//);
    if (m) skillDirs.add(m[1]);
  }
  for (const dir of skillDirs) {
    const skillMd = path.join(WS, 'skills', dir, 'SKILL.md');
    const stagedSkillMd = files.some(f => f === `skills/${dir}/SKILL.md`);
    if (!fs.existsSync(skillMd) && !stagedSkillMd) {
      errors.push(`[ISC-SKILL-DOC] skills/${dir}/ 缺少 SKILL.md — 技能目录必须包含文档`);
    }
  }

  // --- Rule 2: handlers/或autoload目录中禁止.test.js/.spec.js ---
  const dangerousDirs = ['handlers', 'autoload', 'infrastructure/autoload'];
  for (const f of files) {
    if (/\.(test|spec)\.[jt]s$/.test(f)) {
      for (const d of dangerousDirs) {
        if (f.includes(`${d}/`)) {
          errors.push(`[ISC-NO-TEST-IN-AUTOLOAD] ${f} — 测试文件禁止放入 ${d}/，会被自动加载执行`);
        }
      }
    }
  }

  // --- Rule 3: infrastructure/模块需要CONTRACT或SKILL.md ---
  const infraDirs = new Set();
  for (const f of files) {
    const m = f.match(/^infrastructure\/([^/]+)\//);
    if (m) infraDirs.add(m[1]);
  }
  for (const dir of infraDirs) {
    const base = path.join(WS, 'infrastructure', dir);
    const hasContract = fs.existsSync(path.join(base, 'CONTRACT.md')) ||
                        files.some(f => f === `infrastructure/${dir}/CONTRACT.md`);
    const hasSkill = fs.existsSync(path.join(base, 'SKILL.md')) ||
                     files.some(f => f === `infrastructure/${dir}/SKILL.md`);
    if (!hasContract && !hasSkill) {
      warnings.push(`[ISC-INFRA-DOC] infrastructure/${dir}/ 缺少 CONTRACT.md 或 SKILL.md`);
    }
  }

  // --- Rule 4: ISC规则JSON必须有trigger.actions ---
  for (const f of files) {
    if (/^skills\/isc-core\/rules\/.*\.json$/.test(f)) {
      try {
        const full = path.join(WS, f);
        const content = fs.existsSync(full)
          ? fs.readFileSync(full, 'utf8')
          : execSync(`git show :${f}`, { cwd: WS, encoding: 'utf8' });
        const rule = JSON.parse(content);
        if (!rule.trigger || !rule.trigger.actions || !rule.trigger.actions.length) {
          errors.push(`[ISC-META-RULE] ${f} — 规则缺少 trigger.actions 字段，无法被执行引擎订阅`);
        }
      } catch (e) {
        if (!e.message.includes('trigger.actions')) {
          warnings.push(`[ISC-META-RULE] ${f} — 无法解析: ${e.message}`);
        }
      }
    }
  }

  // --- Rule 5: Dependency Direction Check (DEP-001 ~ DEP-005) ---
  const depCheckPath = path.join(__dirname, 'dependency-check.js');
  if (fs.existsSync(depCheckPath)) {
    try {
      const jsFiles = files.filter(f => /\.[cm]?js$/.test(f));
      if (jsFiles.length > 0) {
        const depCheck = require(depCheckPath);
        const depErrors = [
          ...depCheck.checkDEP001(jsFiles),
          ...depCheck.checkDEP005(jsFiles),
          ...depCheck.checkL3toL1L2(jsFiles),
        ];
        const depWarnings = [
          ...depCheck.checkDEP002(jsFiles),
          ...depCheck.checkDEP004(jsFiles),
        ];
        // DEP-003 (cycle check) scans all L3 files, only relevant if infra files staged
        if (jsFiles.some(f => f.startsWith('infrastructure/'))) {
          depErrors.push(...depCheck.checkDEP003(jsFiles));
        }
        for (const v of depErrors) {
          errors.push(`[${v.rule}] ${v.file}:${v.line} — ${v.message}`);
        }
        for (const v of depWarnings) {
          warnings.push(`[${v.rule}] ${v.file}:${v.line} — ${v.message}`);
        }
      }
    } catch (e) {
      warnings.push(`[DEP-CHECK] 依赖检查加载失败: ${e.message}`);
    }
  }

  // --- Output ---
  if (warnings.length) {
    console.log('⚠️  ISC Pre-Commit 警告:');
    warnings.forEach(w => console.log(`  ${w}`));
  }
  if (errors.length) {
    console.log('🚫 ISC Pre-Commit 拦截 — 以下规则被违反:');
    errors.forEach(e => console.log(`  ${e}`));
    console.log(`\n共 ${errors.length} 个错误，提交被阻止。修复后重试。`);
    process.exit(1);
  }

  if (warnings.length) {
    console.log('✅ ISC Pre-Commit 通过（有警告）');
  }
  process.exit(0);
}

main();
