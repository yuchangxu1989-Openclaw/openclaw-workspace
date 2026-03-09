#!/usr/bin/env node
/**
 * Public Skill Pre-Commit Gate
 * 仅检查本次 staged 且位于 skills/public/ 下的文件。
 * Exit 1 = 阻止提交, Exit 0 = 放行。
 */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WS = path.resolve(__dirname, '..');

function stagedFiles() {
  try {
    const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
    return execSync('git diff --cached --name-only --diff-filter=ACM', { cwd: repoRoot, encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

function loadFromWorkingTreeOrIndex(relPath) {
  // relPath may have workspace/ prefix from git, resolve against repo root
  const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  const full = path.join(repoRoot, relPath);
  if (fs.existsSync(full)) return fs.readFileSync(full, 'utf8');
  return execSync(`git show :${relPath}`, { cwd: repoRoot, encoding: 'utf8' });
}

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
    .replace(/(^|\s)\/\/.*$/gm, '');
}

function hasFrontmatterNameDescription(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return { ok: false, reason: '缺少frontmatter(--- ... ---)' };
  const fm = m[1];
  const hasName = /^name\s*:\s*.+$/m.test(fm);
  const hasDesc = /^description\s*:\s*.+$/m.test(fm);
  if (!hasName || !hasDesc) {
    return { ok: false, reason: `frontmatter缺少${!hasName ? ' name' : ''}${!hasName && !hasDesc ? ' 和' : ''}${!hasDesc ? ' description' : ''}` };
  }
  return { ok: true };
}

function scanLines(relPath, content, regexes, codeOnly = false) {
  const out = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = codeOnly ? stripComments(raw) : raw;
    for (const { re, code, msg } of regexes) {
      if (re.test(line)) {
        out.push({ file: relPath, line: i + 1, code, msg, text: raw.trim() });
      }
    }
  }
  return out;
}

function main() {
  const staged = stagedFiles();
  if (!staged.length) process.exit(0);

  // git root is /root/.openclaw, staged paths start with workspace/
  const publicStaged = staged.filter(f => f.startsWith('workspace/skills/public/') || f.startsWith('skills/public/'));
  if (!publicStaged.length) process.exit(0);

  const errors = [];

  // A) SKILL.md + frontmatter name/description
  const touchedSkillDirs = new Set();
  for (const f of publicStaged) {
    const m = f.match(/(?:workspace\/)?skills\/public\/([^/]+)\//);
    if (m) touchedSkillDirs.add(m[1]);
  }

  for (const dir of touchedSkillDirs) {
    const rel = publicStaged.find(f => f.endsWith(`${dir}/SKILL.md`)) 
      ? publicStaged.find(f => f.endsWith(`${dir}/SKILL.md`))
      : `workspace/skills/public/${dir}/SKILL.md`;
    try {
      const md = loadFromWorkingTreeOrIndex(rel);
      const r = hasFrontmatterNameDescription(md);
      if (!r.ok) {
        errors.push({ file: rel, line: 1, code: 'PUBLIC-SKILL-META', msg: r.reason, text: '' });
      }
    } catch {
      errors.push({ file: rel, line: 1, code: 'PUBLIC-SKILL-META', msg: '缺少SKILL.md', text: '' });
    }
  }

  // B/C/D/E 扫描 .js/.json
  const targets = publicStaged.filter(f => /\.(js|json)$/.test(f));

  const absolutePathRules = [
    { re: /(?:^|["'`\s])\/(?:root|home|Users|opt|var|tmp|etc)\//, code: 'PUBLIC-NO-ABS-PATH', msg: '疑似硬编码绝对路径' },
  ];

  const apiKeyRules = [
    { re: /\bsk-[A-Za-z0-9_-]{10,}\b/, code: 'PUBLIC-NO-PLAINTEXT-KEY', msg: '疑似明文API Key (sk-*)' },
    { re: /\btvly-[A-Za-z0-9_-]{8,}\b/, code: 'PUBLIC-NO-PLAINTEXT-KEY', msg: '疑似明文API Key (tvly-*)' },
  ];

  const hardDepRules = [
    { re: /require\(\s*['"]\.\.\/\.\.\/[^'"\n]+['"]\s*\)/, code: 'PUBLIC-NO-CROSS-SKILL-HARD-DEP', msg: '疑似跨技能硬依赖 require("../../...")' },
  ];

  const userIdRules = [
    { re: /\bou_[A-Za-z0-9]{6,}\b/, code: 'PUBLIC-NO-HARDCODED-USERID', msg: '疑似硬编码飞书用户ID (ou_*)' },
  ];

  for (const rel of targets) {
    let content = '';
    try {
      content = loadFromWorkingTreeOrIndex(rel);
    } catch {
      continue;
    }

    errors.push(...scanLines(rel, content, absolutePathRules, true));

    const keyHits = scanLines(rel, content, apiKeyRules, true)
      .filter(hit => !/process\.env|config\.|fromEnv|getenv|ENV\[|\$\{?\w+\}?/i.test(hit.text));
    errors.push(...keyHits);

    errors.push(...scanLines(rel, content, hardDepRules, true));
    errors.push(...scanLines(rel, content, userIdRules, true));
  }

  if (errors.length) {
    console.log('🚫 Public Skill Pre-Commit 拦截 — 检测到质量门禁违规:');
    for (const e of errors) {
      const extra = e.text ? ` | ${e.text}` : '';
      console.log(`  [${e.code}] ${e.file}:${e.line} — ${e.msg}${extra}`);
    }
    console.log(`\n共 ${errors.length} 个错误，提交被阻止。`);
    process.exit(1);
  }

  process.exit(0);
}

main();
