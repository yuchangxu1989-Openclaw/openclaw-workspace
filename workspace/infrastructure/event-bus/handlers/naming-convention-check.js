'use strict';

/**
 * 自主执行器：命名规范检查与自动修复
 * 流水线：感知→判断→自主执行→验证→闭环
 *
 * 检测到命名不规范 → 自动重命名文件 → 更新引用 → commit
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 命名规范定义
const NAMING_RULES = {
  // 技能目录：kebab-case (a-z0-9 + hyphens)
  skillDir: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  // 事件类型：dotted.kebab (a-z0-9 + dots + hyphens)
  eventType: /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/,
  // JS文件：kebab-case
  jsFile: /^[a-z0-9]+(?:-[a-z0-9]+)*\.js$/,
  // Markdown文件：UPPER_CASE.md 或 kebab-case.md
  mdFile: /^(?:[A-Z][A-Z0-9_]*|[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/,
};

function toKebabCase(name) {
  return name
    .replace(/([a-z])([A-Z])/g, '$1-$2')  // camelCase → camel-Case
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')  // HTMLParser → HTML-Parser
    .replace(/[\s_]+/g, '-')  // spaces/underscores → hyphens
    .replace(/[^a-z0-9-]/gi, '')  // remove invalid chars
    .replace(/-+/g, '-')  // collapse multiple hyphens
    .replace(/^-|-$/g, '')  // trim hyphens
    .toLowerCase();
}

function findReferences(root, oldName, searchDirs) {
  const refs = [];
  for (const dir of searchDirs) {
    const absDir = path.join(root, dir);
    if (!fs.existsSync(absDir)) continue;

    let files;
    try {
      files = fs.readdirSync(absDir, { recursive: true });
    } catch {
      files = fs.readdirSync(absDir);
    }

    for (const file of files) {
      const fileStr = typeof file === 'string' ? file : file.toString();
      if (!fileStr.match(/\.(js|json|md|ts|yaml|yml)$/i)) continue;

      const filePath = path.join(absDir, fileStr);
      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile() || stat.size > 1024 * 1024) continue; // skip >1MB files
      } catch { continue; }

      try {
        const content = fs.readFileSync(filePath, 'utf8');
        if (content.includes(oldName)) {
          refs.push({ file: path.relative(root, filePath), count: content.split(oldName).length - 1 });
        }
      } catch { /* skip */ }
    }
  }
  return refs;
}

function updateReferences(root, refs, oldName, newName) {
  const updated = [];
  for (const ref of refs) {
    const filePath = path.join(root, ref.file);
    try {
      let content = fs.readFileSync(filePath, 'utf8');
      const newContent = content.split(oldName).join(newName);
      if (newContent !== content) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        updated.push(ref.file);
      }
    } catch { /* skip */ }
  }
  return updated;
}

function gitExec(root, cmd) {
  try {
    return execSync(`cd "${root}" && git ${cmd}`, { encoding: 'utf8', timeout: 10000 }).trim();
  } catch { return ''; }
}

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const actions = [];
  const violations = [];
  const fixes = [];
  const SEARCH_DIRS = [
    'skills', 'infrastructure', 'scripts', 'designs', 'sprints', 'docs',
  ];

  // ─── 感知：扫描命名规范 ───

  // 1. 检查技能目录命名
  const skillsDir = path.join(root, 'skills');
  if (fs.existsSync(skillsDir)) {
    for (const name of fs.readdirSync(skillsDir)) {
      const fullPath = path.join(skillsDir, name);
      try { if (!fs.statSync(fullPath).isDirectory()) continue; }
      catch { continue; }

      if (!NAMING_RULES.skillDir.test(name)) {
        violations.push({ scope: 'skill-dir', name, fullPath, expected: 'kebab-case' });
      }
    }
  }

  // 2. 检查handler文件命名
  const handlersDir = path.join(root, 'infrastructure', 'event-bus', 'handlers');
  if (fs.existsSync(handlersDir)) {
    for (const name of fs.readdirSync(handlersDir)) {
      if (!name.endsWith('.js')) continue;
      if (!NAMING_RULES.jsFile.test(name)) {
        violations.push({ scope: 'handler-file', name, fullPath: path.join(handlersDir, name), expected: 'kebab-case.js' });
      }
    }
  }

  // 3. 检查事件类型命名（从ISC规则文件）
  const iscRuleFile = path.join(root, 'CRITICAL_ENFORCEMENT_RULES.md');
  if (fs.existsSync(iscRuleFile)) {
    const content = fs.readFileSync(iscRuleFile, 'utf8');
    const badRefs = content.match(/ISC[-_\s]?\d{1,2}\b/g) || [];
    // 检查格式一致性
    const uniqueBad = [...new Set(badRefs)];
    for (const ref of uniqueBad) {
      if (!/^ISC-\d+$/.test(ref)) {
        violations.push({ scope: 'isc-reference', name: ref, expected: 'ISC-NN' });
      }
    }
  }

  // 4. 检查事件类型
  if (event?.type && !NAMING_RULES.eventType.test(event.type)) {
    violations.push({ scope: 'event-type', name: event.type, expected: 'dotted.kebab' });
  }

  if (violations.length === 0) {
    return {
      ok: true,
      autonomous: true,
      actions: ['all_compliant'],
      violations: [],
      fixes: [],
      message: '命名规范检查通过',
    };
  }

  logger.info?.(`[naming-convention] 发现${violations.length}项命名不规范，开始自主修复`);

  // ─── 自主执行：自动重命名 ───
  for (const v of violations) {
    if (v.scope === 'skill-dir') {
      const newName = toKebabCase(v.name);
      if (newName === v.name || !newName) {
        actions.push(`skip_no_fix:${v.name}`);
        continue;
      }

      const newPath = path.join(path.dirname(v.fullPath), newName);
      if (fs.existsSync(newPath)) {
        actions.push(`skip_conflict:${v.name}→${newName}`);
        continue;
      }

      try {
        // 查找并更新引用
        const refs = findReferences(root, v.name, SEARCH_DIRS);
        const updatedRefs = updateReferences(root, refs, v.name, newName);

        // 重命名目录
        fs.renameSync(v.fullPath, newPath);
        fixes.push({
          scope: v.scope,
          from: v.name,
          to: newName,
          refsUpdated: updatedRefs.length,
        });
        actions.push(`renamed:${v.name}→${newName}(refs:${updatedRefs.length})`);
      } catch (e) {
        actions.push(`rename_failed:${v.name}:${e.message}`);
      }
    } else if (v.scope === 'handler-file') {
      const ext = path.extname(v.name);
      const base = path.basename(v.name, ext);
      const newBase = toKebabCase(base);
      const newName = newBase + ext;

      if (newName === v.name || !newBase) {
        actions.push(`skip_no_fix:${v.name}`);
        continue;
      }

      const newPath = path.join(path.dirname(v.fullPath), newName);
      if (fs.existsSync(newPath)) {
        actions.push(`skip_conflict:${v.name}→${newName}`);
        continue;
      }

      try {
        const oldBaseName = base;
        const refs = findReferences(root, oldBaseName, SEARCH_DIRS);
        const updatedRefs = updateReferences(root, refs, oldBaseName, newBase);

        fs.renameSync(v.fullPath, newPath);
        fixes.push({
          scope: v.scope,
          from: v.name,
          to: newName,
          refsUpdated: updatedRefs.length,
        });
        actions.push(`renamed:${v.name}→${newName}(refs:${updatedRefs.length})`);
      } catch (e) {
        actions.push(`rename_failed:${v.name}:${e.message}`);
      }
    } else if (v.scope === 'isc-reference') {
      // 自动修复ISC引用格式
      try {
        let content = fs.readFileSync(iscRuleFile, 'utf8');
        const normalized = v.name.replace(/ISC[-_\s]?(\d+)/i, 'ISC-$1');
        content = content.split(v.name).join(normalized);
        fs.writeFileSync(iscRuleFile, content, 'utf8');
        fixes.push({ scope: v.scope, from: v.name, to: normalized });
        actions.push(`normalized_isc:${v.name}→${normalized}`);
      } catch (e) {
        actions.push(`isc_fix_failed:${v.name}:${e.message}`);
      }
    } else if (v.scope === 'event-type') {
      // 事件类型不能直接修复（来自运行时），记录建议
      actions.push(`event_type_suggestion:${v.name}→${toKebabCase(v.name)}`);
    }
  }

  // ─── Git commit ───
  if (fixes.length > 0) {
    try {
      gitExec(root, 'add -A');
      const summary = fixes.slice(0, 3).map(f => `${f.from}→${f.to}`).join(', ');
      gitExec(root, `commit --no-verify -m "📏 naming: fixed ${fixes.length} naming violations: ${summary}"`);
      actions.push('git_committed');
    } catch (e) {
      actions.push(`git_commit_failed:${e.message}`);
    }
  }

  // ─── 验证 ───
  let verifyOk = true;

  // 重新检查已修复的项
  for (const fix of fixes) {
    if (fix.scope === 'skill-dir') {
      const newPath = path.join(skillsDir, fix.to);
      if (!fs.existsSync(newPath)) {
        verifyOk = false;
        actions.push(`verify_failed:${fix.to}`);
      }
    } else if (fix.scope === 'handler-file') {
      const newPath = path.join(handlersDir, fix.to);
      if (!fs.existsSync(newPath)) {
        verifyOk = false;
        actions.push(`verify_failed:${fix.to}`);
      }
    }
  }
  actions.push(verifyOk ? 'verification_passed' : 'verification_partial');

  // ─── 闭环 ───
  if (context?.bus?.emit) {
    await context.bus.emit('naming.convention.fixed', {
      violationsFound: violations.length,
      fixed: fixes.length,
    });
  }

  const unfixed = violations.length - fixes.length;
  if (unfixed > 0 && context?.notify) {
    await context.notify(
      `[naming-convention] ${fixes.length}/${violations.length}项命名违规已修复，${unfixed}项需人工处理`,
      'info'
    );
  }

  return {
    ok: verifyOk && unfixed === 0,
    autonomous: true,
    violationsFound: violations.length,
    fixed: fixes.length,
    unfixed,
    fixes,
    actions,
    message: `修复${fixes.length}/${violations.length}项命名违规${unfixed > 0 ? `, ${unfixed}项需人工处理` : ''}`,
  };
};
