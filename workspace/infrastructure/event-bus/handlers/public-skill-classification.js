'use strict';

/**
 * 自主执行器：可销售技能分类门禁
 * 流水线：感知→判断→自主执行→验证→闭环
 *
 * 新建/修改技能 → 检查4个通用性条件 → 符合则提示放入public/ → 不符合标注原因
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = '/root/.openclaw/workspace';
const PUBLIC_DIR = path.join(WORKSPACE, 'skills/public');

const HARDCODED_PATH_PATTERNS = [
  /\/root\//,
  /\/home\/\w+\//,
  /\/Users\/\w+\//,
  /C:\\/i,
  /ou_[a-zA-Z0-9]{20,}/,  // Feishu user IDs
];

const INTERNAL_DEPS = [
  /require\(['"].*isc-core/,
  /require\(['"].*lto-core/,
  /require\(['"].*cras/,
  /from\s+['"].*isc-core/,
  /from\s+['"].*lto-core/,
  /from\s+['"].*cras/,
];

const HARDCODED_CREDS = [
  /['"][A-Za-z0-9]{32,}['"]/,
  /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i,
  /password\s*[:=]\s*['"][^'"]+['"]/i,
];

function checkSkillPublicEligibility(skillDir) {
  const issues = [];
  const files = [];

  // Collect all source files
  function collect(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) collect(p);
      else files.push(p);
    }
  }
  collect(skillDir);

  const sourceFiles = files.filter(f => /\.(js|ts|md|json|sh)$/.test(f));

  // Check 1: 无硬编码路径
  for (const f of sourceFiles) {
    const content = fs.readFileSync(f, 'utf8');
    for (const pat of HARDCODED_PATH_PATTERNS) {
      if (pat.test(content)) {
        issues.push({ check: 'hardcoded_path', file: path.relative(skillDir, f), pattern: pat.toString() });
        break;
      }
    }
  }

  // Check 2: 零外部业务依赖
  for (const f of sourceFiles.filter(f => /\.(js|ts)$/.test(f))) {
    const content = fs.readFileSync(f, 'utf8');
    for (const pat of INTERNAL_DEPS) {
      if (pat.test(content)) {
        issues.push({ check: 'internal_dependency', file: path.relative(skillDir, f), pattern: pat.toString() });
        break;
      }
    }
  }

  // Check 3: 有标准 SKILL.md
  const skillMd = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMd)) {
    issues.push({ check: 'missing_skill_md', detail: '缺少SKILL.md' });
  } else {
    const content = fs.readFileSync(skillMd, 'utf8');
    if (!/^#\s+.+/m.test(content)) {
      issues.push({ check: 'skill_md_no_name', detail: 'SKILL.md缺少name标题' });
    }
  }

  // Check 4: 无硬编码凭据
  for (const f of sourceFiles.filter(f => /\.(js|ts|json)$/.test(f))) {
    const content = fs.readFileSync(f, 'utf8');
    for (const pat of HARDCODED_CREDS) {
      if (pat.test(content)) {
        issues.push({ check: 'hardcoded_credentials', file: path.relative(skillDir, f) });
        break;
      }
    }
  }

  return issues;
}

module.exports = async function(event, rule, context) {
  const payload = event.payload || event.data || {};
  const skillPath = payload.skill_path || payload.path || '';

  if (!skillPath) {
    return { status: 'skip', reason: '无技能路径信息' };
  }

  const fullPath = path.isAbsolute(skillPath) ? skillPath : path.join(WORKSPACE, skillPath);
  if (!fs.existsSync(fullPath)) {
    return { status: 'skip', reason: `技能目录不存在: ${skillPath}` };
  }

  const isInPublic = fullPath.startsWith(PUBLIC_DIR);
  const issues = checkSkillPublicEligibility(fullPath);
  const isEligible = issues.length === 0;

  const logDir = path.resolve(__dirname, '../../logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  try {
    fs.appendFileSync(
      path.join(logDir, 'skill-classification.jsonl'),
      JSON.stringify({ timestamp: new Date().toISOString(), skill: skillPath, eligible: isEligible, issues: issues.length, inPublic: isInPublic }) + '\n'
    );
  } catch { /* best effort */ }

  if (isEligible && !isInPublic) {
    const msg = `💡 技能 \`${path.basename(skillPath)}\` 满足通用性条件，建议移入 skills/public/`;
    if (context?.notify) context.notify('feishu', msg, { severity: 'info' });
    return { status: 'recommend_public', skill: skillPath, message: msg };
  }

  if (!isEligible && isInPublic) {
    const msg = `⚠️ 技能 \`${path.basename(skillPath)}\` 在 public/ 中但不满足通用性条件:\n${issues.map(i => `- ${i.check}: ${i.detail || i.file || ''}`).join('\n')}`;
    if (context?.notify) context.notify('feishu', msg, { severity: 'high' });
    return { status: 'public_but_ineligible', skill: skillPath, issues, message: '需修复或移出public/' };
  }

  if (!isEligible) {
    return { status: 'internal', skill: skillPath, issues, reason: '不满足通用性条件，保留为内部技能' };
  }

  return { status: 'pass', skill: skillPath, classification: 'public' };
};
