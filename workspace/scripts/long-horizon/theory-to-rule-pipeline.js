#!/usr/bin/env node
// theory-to-rule-pipeline.js
// 每周二 10:00：扫描 research-signals/ 中近7天信号，提取高价值洞见，生成ISC规则草稿
// 这是一个"桥接器"：将外部研究信号转化为内部规则候选

const fs = require('fs');
const path = require('path');

const WORKSPACE = '/root/.openclaw/workspace';
const SIGNAL_DIR = path.join(WORKSPACE, 'reports/research-signals');
const RULE_DRAFTS_DIR = path.join(WORKSPACE, 'reports/weekly');
fs.mkdirSync(RULE_DRAFTS_DIR, { recursive: true });

const dateStr = new Date().toISOString().split('T')[0];
const outFile = path.join(RULE_DRAFTS_DIR, `theory-to-rule-${dateStr}.md`);

// 读取近7天的信号文件
const now = Date.now();
const signals = [];

if (fs.existsSync(SIGNAL_DIR)) {
  fs.readdirSync(SIGNAL_DIR)
    .filter(f => f.startsWith('signals-') && f.endsWith('.md'))
    .forEach(f => {
      const filePath = path.join(SIGNAL_DIR, f);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs < 7 * 86400 * 1000) {
        const content = fs.readFileSync(filePath, 'utf8');
        // 提取标题行
        const titles = content.match(/^### (.+)$/gm) || [];
        titles.forEach(t => {
          signals.push({ date: f.replace('signals-', '').replace('.md', ''), title: t.replace('### ', '') });
        });
      }
    });
}

// 关键词映射 → 规则类别
const KEYWORD_RULES = [
  { keywords: ['agent', 'autonomous', 'agentic', 'multi-agent'], category: 'Agent自治规则', template: 'AGENT_AUTONOMY' },
  { keywords: ['rag', 'retrieval', 'embedding', 'vector'], category: '知识检索规则', template: 'KNOWLEDGE_RETRIEVAL' },
  { keywords: ['reasoning', 'chain-of-thought', 'cot', 'thinking'], category: '推理增强规则', template: 'REASONING' },
  { keywords: ['benchmark', 'eval', 'evaluation', 'metric'], category: '评估体系规则', template: 'EVALUATION' },
  { keywords: ['fine-tun', 'lora', 'rlhf', 'alignment'], category: '对齐与微调规则', template: 'ALIGNMENT' },
  { keywords: ['compress', 'efficient', 'speed', 'latency'], category: '效率优化规则', template: 'EFFICIENCY' },
  { keywords: ['safety', 'guardrail', 'red team', 'robustness'], category: '安全防护规则', template: 'SAFETY' },
  { keywords: ['memory', 'context', 'long-context', 'state'], category: '记忆/上下文规则', template: 'MEMORY' },
];

function classify(title) {
  const lower = title.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some(k => lower.includes(k))) return rule;
  }
  return { category: '通用研究', template: 'GENERAL' };
}

// 分类并生成规则草稿
const byCategory = {};
signals.forEach(s => {
  const cls = classify(s.title);
  if (!byCategory[cls.category]) byCategory[cls.category] = [];
  byCategory[cls.category].push({ ...s, template: cls.template });
});

const lines = [
  `# 理论→规则 转化流水线 ${dateStr}`,
  `_基于近7天研究信号（${signals.length}条）生成ISC规则草稿_`,
  '',
  '> **使用方式**：审核下方规则草稿，将有价值的条目合并入 `skills/` 对应规则文件',
  '',
];

if (Object.keys(byCategory).length === 0) {
  lines.push('_本周无研究信号输入，跳过规则生成_', '');
} else {
  Object.entries(byCategory).forEach(([cat, items]) => {
    lines.push(`## ${cat}`, '');
    items.forEach(item => {
      lines.push(
        `### 草稿规则（来源：${item.date}）`,
        `**触发信号**：${item.title}`,
        '',
        '```yaml',
        `rule_id: DRAFT-${item.template}-${Date.now().toString(36).toUpperCase().slice(-4)}`,
        `category: ${cat}`,
        `priority: medium`,
        `status: draft`,
        `source: research_signal`,
        `trigger: |`,
        `  当处理 ${cat.replace('规则', '').trim()} 相关任务时`,
        `action: |`,
        `  参考以下研究洞见：${item.title}`,
        `  - [ ] 提炼具体可执行的规则条目`,
        `  - [ ] 验证在当前系统中的适用性`,
        `  - [ ] 合并入对应技能文件`,
        '```',
        '',
      );
    });
  });
}

lines.push('---', `_由 theory-to-rule-pipeline.js 自动生成 | ${new Date().toISOString()}_`);

fs.writeFileSync(outFile, lines.join('\n'));
console.log(`[${dateStr}] theory-to-rule-pipeline: ${signals.length} signals → ${Object.keys(byCategory).length} categories → ${outFile}`);
