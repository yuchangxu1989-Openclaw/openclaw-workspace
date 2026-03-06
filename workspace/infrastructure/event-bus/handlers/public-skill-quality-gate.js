'use strict';

/**
 * 自主执行器：可销售技能质量门禁
 * 流水线：感知→判断→自主执行→验证→闭环
 *
 * 发布前检查 → 逐项验证质量清单 → 全部通过放行 / 未通过阻断
 */

const fs = require('fs');
const path = require('path');

const SENSITIVE_PATTERNS = [
  /api[_-]?key\s*[:=]\s*['"][^'"]{10,}['"]/i,
  /password\s*[:=]\s*['"][^'"]+['"]/i,
  /secret\s*[:=]\s*['"][^'"]+['"]/i,
  /\/root\//,
  /\/home\/\w+\//,
  /\.secrets\//,
];

function checkQuality(skillDir) {
  const results = [];

  // 1. SKILL.md有完整frontmatter
  const skillMd = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMd)) {
    results.push({ item: 'SKILL.md存在', pass: false, detail: '缺少SKILL.md' });
    return results; // 没有SKILL.md其他检查无意义
  }

  const mdContent = fs.readFileSync(skillMd, 'utf8');
  results.push({ item: 'SKILL.md存在', pass: true });

  // 2. 有name标题
  const hasName = /^#\s+.+/m.test(mdContent);
  results.push({ item: 'SKILL.md有name标题', pass: hasName, detail: hasName ? '' : '缺少顶级标题' });

  // 3. description包含触发词和NOT for
  const hasDescription = /description|触发|use when/i.test(mdContent);
  const hasNotFor = /NOT for|不适用|不用于/i.test(mdContent);
  results.push({ item: 'description含触发词', pass: hasDescription });
  results.push({ item: 'description含NOT for排除项', pass: hasNotFor, detail: hasNotFor ? '' : '建议添加NOT for排除项' });

  // 4. 无敏感信息
  const allFiles = [];
  function collect(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) collect(p);
      else allFiles.push(p);
    }
  }
  collect(skillDir);

  let sensitiveFound = false;
  for (const f of allFiles.filter(f => /\.(js|ts|json|md|sh)$/.test(f))) {
    const content = fs.readFileSync(f, 'utf8');
    for (const pat of SENSITIVE_PATTERNS) {
      if (pat.test(content)) {
        sensitiveFound = true;
        results.push({ item: '无敏感信息', pass: false, detail: `${path.relative(skillDir, f)} 匹配 ${pat}` });
        break;
      }
    }
    if (sensitiveFound) break;
  }
  if (!sensitiveFound) results.push({ item: '无敏感信息', pass: true });

  // 5. 有使用示例
  const hasExample = /example|示例|usage|用法|```/i.test(mdContent);
  results.push({ item: '有使用示例', pass: hasExample });

  // 6. 有前置条件说明
  const hasPrereq = /prerequisite|前置|require|依赖|setup|安装/i.test(mdContent);
  results.push({ item: '有前置条件说明', pass: hasPrereq });

  // 7. 文件结构
  const hasIndex = allFiles.some(f => /index\.(js|ts)$/.test(f)) || allFiles.some(f => /scripts\//.test(f));
  results.push({ item: '文件结构规范', pass: hasIndex || allFiles.length >= 2, detail: hasIndex ? '' : '建议包含入口文件' });

  // Check npm deps
  const pkgJson = path.join(skillDir, 'package.json');
  if (fs.existsSync(pkgJson)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
      const deps = Object.keys(pkg.dependencies || {}).length;
      results.push({ item: '零/已声明npm依赖', pass: true, detail: `${deps}个依赖已声明` });
    } catch {
      results.push({ item: '零/已声明npm依赖', pass: false, detail: 'package.json解析失败' });
    }
  }

  return results;
}

module.exports = async function(event, rule, context) {
  const payload = event.payload || event.data || {};
  const skillPath = payload.skill_path || payload.path || '';

  if (!skillPath) {
    return { status: 'skip', reason: '无技能路径信息' };
  }

  const WORKSPACE = '/root/.openclaw/workspace';
  const fullPath = path.isAbsolute(skillPath) ? skillPath : path.join(WORKSPACE, skillPath);
  if (!fs.existsSync(fullPath)) {
    return { status: 'skip', reason: `技能目录不存在: ${skillPath}` };
  }

  const results = checkQuality(fullPath);
  const failures = results.filter(r => !r.pass);
  const allPass = failures.length === 0;

  if (!allPass) {
    const msg = [
      `🚫 **技能质量门禁未通过**: \`${path.basename(skillPath)}\``,
      '',
      ...failures.map(f => `- ❌ ${f.item}${f.detail ? ': ' + f.detail : ''}`),
    ].join('\n');
    if (context?.notify) context.notify('feishu', msg, { severity: 'high' });
    return { status: 'blocked', failures, message: '质量门禁未通过，阻断发布' };
  }

  return { status: 'pass', checks: results.length, message: '质量门禁全部通过' };
};
