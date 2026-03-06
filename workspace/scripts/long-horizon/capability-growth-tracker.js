#!/usr/bin/env node
// capability-growth-tracker.js
// 每月1号 09:00 运行：按维度评估系统能力指数变化，追踪长期增长曲线

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKSPACE = '/root/.openclaw/workspace';
const REPORT_DIR = path.join(WORKSPACE, 'reports/trends');
const METRIC_FILE = path.join(REPORT_DIR, 'capability-growth.jsonl');

fs.mkdirSync(REPORT_DIR, { recursive: true });

const now = new Date();
const dateStr = now.toISOString().split('T')[0];
const ts = Math.floor(now.getTime() / 1000);

function count(cmd) {
  try { return parseInt(execSync(cmd, { encoding: 'utf8', cwd: WORKSPACE }).trim()) || 0; }
  catch { return 0; }
}

function countFiles(dir, ext) {
  try {
    return parseInt(execSync(
      `find ${path.join(WORKSPACE, dir)} -name "*.${ext}" 2>/dev/null | wc -l`,
      { encoding: 'utf8' }
    ).trim()) || 0;
  } catch { return 0; }
}

// 维度评估
const metrics = {
  date: dateStr,
  ts,
  dimensions: {
    knowledge: {
      // 知识沉淀维度：规则数、记忆文件大小、MEMORY.md行数
      rule_files: countFiles('skills', 'md') + countFiles('skills', 'json'),
      memory_lines: count(`wc -l < ${WORKSPACE}/MEMORY.md 2>/dev/null || echo 0`),
      design_docs: countFiles('designs', 'md'),
    },
    automation: {
      // 自动化维度：cron任务数、脚本数、基础设施文件数
      cron_jobs: count(`crontab -l 2>/dev/null | grep -v '^#' | grep -v '^$' | wc -l`),
      scripts: countFiles('scripts', 'sh') + countFiles('scripts', 'js'),
      infra_files: count(`find ${WORKSPACE}/infrastructure -name "*.js" -o -name "*.json" 2>/dev/null | wc -l`),
    },
    output: {
      // 输出维度：报告数、飞书发送记录
      reports: countFiles('reports', 'md'),
      sent_cards: count(`ls ${WORKSPACE}/feishu_sent_cards 2>/dev/null | wc -l`),
      sent_reports: count(`ls ${WORKSPACE}/feishu_sent_reports 2>/dev/null | wc -l`),
    },
    evolution: {
      // 演化维度：git提交总数、近30天提交数
      total_commits: count(`git -C ${WORKSPACE} rev-list --count HEAD 2>/dev/null || echo 0`),
      commits_30d: count(`git -C ${WORKSPACE} log --since="30 days ago" --oneline 2>/dev/null | wc -l`),
    }
  }
};

// 计算综合能力指数 (0-100)
const k = metrics.dimensions.knowledge;
const a = metrics.dimensions.automation;
const o = metrics.dimensions.output;
const e = metrics.dimensions.evolution;

const capabilityIndex = Math.min(100, Math.round(
  (k.rule_files * 0.3 + k.memory_lines * 0.1 + k.design_docs * 0.2
  + a.cron_jobs * 1.5 + a.scripts * 0.5 + a.infra_files * 0.2
  + o.reports * 0.1 + o.sent_cards * 0.2
  + e.commits_30d * 0.5 + e.total_commits * 0.01) / 10
));

metrics.capability_index = capabilityIndex;

// 追加到JSONL
fs.appendFileSync(METRIC_FILE, JSON.stringify(metrics) + '\n');

// 生成月度报告
const reportPath = path.join(REPORT_DIR, `capability-growth-${dateStr}.md`);
const report = `# 能力增长追踪报告 ${dateStr}

**综合能力指数：${capabilityIndex}/100**

## 知识沉淀
- 规则/技能文件：${k.rule_files}
- MEMORY.md 行数：${k.memory_lines}
- 设计文档：${k.design_docs}

## 自动化水平
- Cron 任务数：${a.cron_jobs}
- 脚本数量：${a.scripts}
- 基础设施文件：${a.infra_files}

## 输出能力
- 报告总数：${o.reports}
- 飞书发送卡片：${o.sent_cards}
- 飞书报告：${o.sent_reports}

## 演化速度
- Git总提交：${e.total_commits}
- 近30天提交：${e.commits_30d}

---
_由 capability-growth-tracker.js 自动生成_
`;

fs.writeFileSync(reportPath, report);
console.log(`[${new Date().toISOString()}] capability-growth-tracker: index=${capabilityIndex} → ${reportPath}`);
