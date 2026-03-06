'use strict';

/**
 * 自主执行器：技能禁止直接调用LLM API
 * 流水线：感知→判断→自主执行→验证→闭环
 *
 * 技能创建/修改 → 扫描代码中的LLM API直接调用 → 发现则阻断 → 建议正确方式
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = '/root/.openclaw/workspace';

const FORBIDDEN_PATTERNS = [
  { pattern: /fetch\s*\(\s*['"][^'"]*chat\/completions/gi, desc: 'fetch调用chat/completions' },
  { pattern: /axios\s*\.\s*(get|post|put)\s*\(\s*['"][^'"]*chat\/completions/gi, desc: 'axios调用chat/completions' },
  { pattern: /https?\.request\s*\(\s*['"][^'"]*bigmodel/gi, desc: 'https.request调用bigmodel' },
  { pattern: /https?\.request\s*\(\s*['"][^'"]*anthropic/gi, desc: 'https.request调用anthropic' },
  { pattern: /https?\.request\s*\(\s*['"][^'"]*openai/gi, desc: 'https.request调用openai' },
  { pattern: /new\s+OpenAI\s*\(/gi, desc: 'OpenAI SDK实例化' },
  { pattern: /new\s+Anthropic\s*\(/gi, desc: 'Anthropic SDK实例化' },
  { pattern: /require\s*\(\s*['"]openai['"]\s*\)/gi, desc: 'require openai包' },
  { pattern: /require\s*\(\s*['"]@anthropic-ai/gi, desc: 'require anthropic包' },
  { pattern: /from\s+['"]openai['"]/gi, desc: 'import openai' },
  { pattern: /from\s+['"]@anthropic-ai/gi, desc: 'import anthropic' },
];

function scanSkillFiles(skillDir) {
  const files = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|ts|mjs|cjs)$/.test(e.name)) files.push(p);
    }
  }
  walk(skillDir);
  return files;
}

module.exports = async function(event, rule, context) {
  const payload = event.payload || event.data || {};
  const skillPath = payload.skill_path || payload.path || '';

  if (!skillPath) return { status: 'skip', reason: '无技能路径' };

  const fullPath = path.isAbsolute(skillPath) ? skillPath : path.join(WORKSPACE, skillPath);
  if (!fs.existsSync(fullPath)) return { status: 'skip', reason: '技能目录不存在' };

  const violations = [];
  const files = scanSkillFiles(fullPath);

  for (const f of files) {
    const content = fs.readFileSync(f, 'utf8');
    const rel = path.relative(fullPath, f);

    for (const { pattern, desc } of FORBIDDEN_PATTERNS) {
      // Reset regex lastIndex for global patterns
      pattern.lastIndex = 0;
      const match = pattern.exec(content);
      if (match) {
        const lineNum = content.slice(0, match.index).split('\n').length;
        violations.push({
          file: rel,
          line: lineNum,
          pattern: desc,
          snippet: match[0].slice(0, 80),
        });
      }
    }
  }

  if (violations.length > 0) {
    const msg = [
      `🚫 **技能禁止直接调用LLM API**: \`${path.basename(skillPath)}\``,
      '',
      ...violations.map(v => `- \`${v.file}:${v.line}\` — ${v.pattern}`),
      '',
      '**正确方式**:',
      '1. 默认用当前Agent的模型直接执行',
      '2. 需要多次独立LLM调用时通过 sessions_spawn 派子Agent',
      '3. 模型选择是运行时配置层的职责，不是技能的职责',
    ].join('\n');
    if (context?.notify) context.notify('feishu', msg, { severity: 'high' });
    return { status: 'blocked', violations, message: '检测到LLM API直接调用，阻断' };
  }

  return { status: 'pass', files_scanned: files.length, message: '无LLM API直接调用' };
};
