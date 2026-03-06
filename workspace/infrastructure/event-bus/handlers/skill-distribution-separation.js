'use strict';

/**
 * 自主执行器：技能分发分离检查
 * 流水线：感知→判断→自主执行→验证→闭环
 *
 * 发布到EvoMap前 → 检查distribution标记/权限声明/密钥泄露/沙箱兼容 → 阻断不合规
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = '/root/.openclaw/workspace';

const SECRETS_PATTERNS = [
  /\.secrets\//,
  /require\(['"].*\.secrets/,
  /readFileSync\(['"].*\.secrets/,
];

const INTERNAL_PATH_PATTERNS = [
  /\/root\/.openclaw/,
  /\/home\/\w+\/.openclaw/,
];

const SENSITIVE_ENV_PATTERNS = [
  /process\.env\.(FEISHU_APP_SECRET|GITHUB_TOKEN|OPENAI_API_KEY|ZHIPU_API_KEY)/,
];

function readSkillMeta(skillDir) {
  // Try SKILL.md frontmatter, manifest.json, or package.json
  const candidates = ['manifest.json', 'skill.json', 'package.json'];
  for (const f of candidates) {
    const fp = path.join(skillDir, f);
    if (fs.existsSync(fp)) {
      try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { /* continue */ }
    }
  }
  // Parse SKILL.md for metadata
  const skillMd = path.join(skillDir, 'SKILL.md');
  if (fs.existsSync(skillMd)) {
    const content = fs.readFileSync(skillMd, 'utf8');
    const meta = {};
    const distMatch = content.match(/distribution\s*[:=]\s*(\w+)/i);
    if (distMatch) meta.distribution = distMatch[1];
    return meta;
  }
  return {};
}

function scanFiles(dir) {
  const files = [];
  function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|ts|json|sh|py)$/.test(e.name)) files.push(p);
    }
  }
  walk(dir);
  return files;
}

module.exports = async function(event, rule, context) {
  const payload = event.payload || event.data || {};
  const skillPath = payload.skill_path || payload.path || '';

  if (!skillPath) return { status: 'skip', reason: '无技能路径' };

  const fullPath = path.isAbsolute(skillPath) ? skillPath : path.join(WORKSPACE, skillPath);
  if (!fs.existsSync(fullPath)) return { status: 'skip', reason: '技能目录不存在' };

  const meta = readSkillMeta(fullPath);
  const distribution = meta.distribution || payload.distribution || '';
  const violations = [];

  // CHK-001: distribution字段必须存在
  if (!['internal', 'external', 'both'].includes(distribution)) {
    violations.push({ id: 'CHK-001', message: `缺少有效distribution字段: "${distribution}"` });
  }

  // 如果是internal，后续检查跳过
  if (distribution === 'internal') {
    return { status: 'pass', reason: 'internal技能不触发分发分离检查', distribution };
  }

  // CHK-002: 外销技能权限声明
  if (['external', 'both'].includes(distribution)) {
    const perms = meta.permissions || {};
    if (!perms.filesystem) violations.push({ id: 'CHK-002a', message: '缺少permissions.filesystem声明' });
    if (!perms.network) violations.push({ id: 'CHK-002b', message: '缺少permissions.network声明' });
    if (!perms.shell) violations.push({ id: 'CHK-002c', message: '缺少permissions.shell声明' });
    if (perms.credential !== 0 && perms.credential !== undefined) {
      violations.push({ id: 'CHK-002d', message: `credential权限必须为0，当前: ${perms.credential}` });
    }
  }

  // 扫描源文件
  const files = scanFiles(fullPath);
  for (const f of files) {
    const content = fs.readFileSync(f, 'utf8');
    const rel = path.relative(fullPath, f);

    // CHK-003: .secrets引用
    for (const pat of SECRETS_PATTERNS) {
      if (pat.test(content)) {
        violations.push({ id: 'CHK-003', file: rel, message: '检测到.secrets引用' });
        break;
      }
    }

    // CHK-004: 内部绝对路径
    for (const pat of INTERNAL_PATH_PATTERNS) {
      if (pat.test(content)) {
        violations.push({ id: 'CHK-004', file: rel, message: '检测到内部绝对路径' });
        break;
      }
    }

    // CHK-005: 敏感环境变量
    for (const pat of SENSITIVE_ENV_PATTERNS) {
      if (pat.test(content)) {
        violations.push({ id: 'CHK-005', file: rel, message: '检测到敏感环境变量引用' });
        break;
      }
    }
  }

  // CHK-006: 沙箱兼容性
  if (meta.sandbox_compatible === false) {
    violations.push({ id: 'CHK-006', message: '技能标记为不兼容沙箱' });
  }

  if (violations.length > 0) {
    const msg = [
      `🚫 **分发分离检查未通过**: \`${path.basename(skillPath)}\``,
      '',
      ...violations.map(v => `- [${v.id}] ${v.message}${v.file ? ` (${v.file})` : ''}`),
    ].join('\n');
    if (context?.notify) context.notify('feishu', msg, { severity: 'critical' });
    return { status: 'blocked', violations, message: '分发分离检查未通过，阻断发布' };
  }

  return { status: 'pass', distribution, message: '分发分离检查通过' };
};
