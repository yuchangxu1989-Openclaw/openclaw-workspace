#!/usr/bin/env node
/**
 * rework-analyzer.js
 * ==================
 * 触发器：子Agent被steer/重启时（检测 subagent 日志 / session 历史）
 * 行为：分析返工根因，自动追加到ISC规则或编排规则
 * 输出：
 *   - 追加到 infrastructure/aeo/golden-testset/self-awareness-cases.json
 *   - 更新相关 ISC 规则（或生成草案）
 *   - reports/rework-analysis-YYYY-MM-DD.md
 *
 * 使用说明：
 *   # 手动运行（分析过去24小时）
 *   node infrastructure/self-check/rework-analyzer.js
 *
 *   # 指定时间窗口（分钟）
 *   node infrastructure/self-check/rework-analyzer.js --window 60
 *
 *   # 由cron每5分钟调用
 *   node infrastructure/self-check/rework-analyzer.js --auto
 *
 *   # 分析特定日志文件
 *   node infrastructure/self-check/rework-analyzer.js --log path/to/subagent.log
 *
 * 依赖：Node.js 18+ (无外部依赖)
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.WORKSPACE_ROOT || '/root/.openclaw/workspace';
const REPORTS_DIR = path.join(WORKSPACE, 'reports');
const GOLDEN_TESTSET = path.join(WORKSPACE, 'infrastructure/aeo/golden-testset/self-awareness-cases.json');
const ISC_RULES_DIR = path.join(WORKSPACE, 'skills/isc-core/rules');
const STATE_FILE = path.join(WORKSPACE, 'infrastructure/self-check/.rework-state.json');
const LOGS_DIR = path.join(WORKSPACE, 'infrastructure/logs');

// ─────────────────────────────────────────────────────────────────────────────
// 返工信号模式（steer / restart 触发词）
// ─────────────────────────────────────────────────────────────────────────────
const REWORK_SIGNALS = [
  // 直接重启信号
  { pattern: /steer.*subagent/i, category: 'steer', weight: 1.0 },
  { pattern: /subagent.*restart/i, category: 'restart', weight: 1.0 },
  { pattern: /kill.*subagent/i, category: 'kill', weight: 0.9 },
  { pattern: /重新.*执行/i, category: 'retry', weight: 0.8 },
  { pattern: /重启.*子.*[Aa]gent/i, category: 'restart', weight: 0.9 },

  // 质量问题导致的返工
  { pattern: /方向.*错了/i, category: 'wrong_direction', weight: 0.9 },
  { pattern: /完全.*不对/i, category: 'wrong_approach', weight: 0.9 },
  { pattern: /重新.*来.*过/i, category: 'restart', weight: 0.85 },
  { pattern: /推倒.*重.*做/i, category: 'full_rework', weight: 1.0 },
  { pattern: /不是.*我.*要的/i, category: 'misaligned', weight: 0.8 },
  { pattern: /理解.*错.*了/i, category: 'misunderstanding', weight: 0.75 },

  // 次优方案触发的返工
  { pattern: /为什么.*不用.*LLM/i, category: 'suboptimal_approach', weight: 0.85 },
  { pattern: /用弱.*方案/i, category: 'suboptimal_approach', weight: 0.85 },
  { pattern: /更好.*的.*方式/i, category: 'suboptimal_approach', weight: 0.7 },
  { pattern: /应该.*并行/i, category: 'orchestration_issue', weight: 0.75 },
  { pattern: /串行.*改.*并行/i, category: 'orchestration_issue', weight: 0.8 },
];

// ─────────────────────────────────────────────────────────────────────────────
// 根因分类映射 → ISC规则草案模板
// ─────────────────────────────────────────────────────────────────────────────
const ROOT_CAUSE_TEMPLATES = {
  'wrong_direction': {
    ruleType: 'gate',
    domain: 'orchestration',
    description: '执行前需确认方向对齐',
    action: '在子Agent任务开始前，输出任务理解摘要，等待隐式校验后再执行',
  },
  'misaligned': {
    ruleType: 'validation',
    domain: 'intent',
    description: '交付物与需求对齐校验',
    action: '交付前对照原始需求做自检，列出"你要的X，我实现的是Y"矩阵',
  },
  'misunderstanding': {
    ruleType: 'gate',
    domain: 'intent',
    description: '需求理解确认门',
    action: '复杂任务必须先输出理解摘要，不直接执行',
  },
  'suboptimal_approach': {
    ruleType: 'selection',
    domain: 'implementation',
    description: '方案选择质量门',
    action: '重要决策必须评估3个方案，选择最优而非最快',
  },
  'orchestration_issue': {
    ruleType: 'constraint',
    domain: 'orchestration',
    description: '并行化强制规则',
    action: '无依赖关系的任务必须并行执行，串行等待需要显式声明原因',
  },
  'full_rework': {
    ruleType: 'gate',
    domain: 'delivery',
    description: '交付前质量自检门',
    action: '交付前必须运行自检脚本，通过后才能上报完成',
  },
  'steer': {
    ruleType: 'monitoring',
    domain: 'subagent',
    description: 'Steer事件根因记录',
    action: '每次steer事件必须触发根因分析并追加到golden-testset',
  },
  'restart': {
    ruleType: 'constraint',
    domain: 'subagent',
    description: '重启事件根因分析',
    action: '子Agent重启前保存状态，重启后自动分析失败原因',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 状态管理
// ─────────────────────────────────────────────────────────────────────────────
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { lastProcessedTimestamp: null, analyzedEvents: [] };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// 扫描日志文件寻找返工信号
// ─────────────────────────────────────────────────────────────────────────────
function scanLogFiles(windowMinutes, lastTimestamp) {
  const events = [];
  const cutoffTime = lastTimestamp
    ? new Date(lastTimestamp)
    : new Date(Date.now() - windowMinutes * 60 * 1000);

  // 扫描多个可能的日志位置
  const logLocations = [
    LOGS_DIR,
    path.join(WORKSPACE, 'infrastructure/observability'),
    path.join(WORKSPACE, 'memory'),
  ];

  for (const logDir of logLocations) {
    if (!fs.existsSync(logDir)) continue;

    const files = fs.readdirSync(logDir).filter(f =>
      f.endsWith('.log') || f.endsWith('.json') || f.endsWith('.md')
    );

    for (const file of files) {
      const filePath = path.join(logDir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.mtime < cutoffTime) continue;

        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          for (const signal of REWORK_SIGNALS) {
            if (signal.pattern.test(line)) {
              // Get context (surrounding lines)
              const contextStart = Math.max(0, i - 3);
              const contextEnd = Math.min(lines.length, i + 5);
              const context = lines.slice(contextStart, contextEnd).join('\n');

              events.push({
                timestamp: stat.mtime.toISOString(),
                file: file,
                lineNum: i + 1,
                signal: line.trim(),
                category: signal.category,
                weight: signal.weight,
                context: context.substring(0, 300),
                source: filePath.replace(WORKSPACE + '/', ''),
              });
              break; // One signal per line
            }
          }
        }
      } catch (e) {
        // skip unreadable files
      }
    }
  }

  // Also check for steer/kill patterns in subagent-related files
  const memoryFiles = fs.readdirSync(path.join(WORKSPACE, 'memory')).filter(f => f.endsWith('.md'));
  for (const file of memoryFiles) {
    const filePath = path.join(WORKSPACE, 'memory', file);
    try {
      const stat = fs.statSync(filePath);
      if (stat.mtime < cutoffTime) continue;

      const content = fs.readFileSync(filePath, 'utf8');
      for (const signal of REWORK_SIGNALS) {
        const matches = [...content.matchAll(new RegExp(signal.pattern.source, 'gi'))];
        for (const match of matches.slice(0, 3)) {
          const idx = match.index;
          const context = content.substring(Math.max(0, idx - 100), idx + 200);
          events.push({
            timestamp: stat.mtime.toISOString(),
            file: file,
            signal: match[0],
            category: signal.category,
            weight: signal.weight,
            context: context.substring(0, 300),
            source: `memory/${file}`,
          });
        }
      }
    } catch (e) {}
  }

  return events;
}

// ─────────────────────────────────────────────────────────────────────────────
// 根因分析：从事件集群推断根因
// ─────────────────────────────────────────────────────────────────────────────
function analyzeRootCauses(events) {
  const categoryCounts = {};
  for (const event of events) {
    categoryCounts[event.category] = (categoryCounts[event.category] || 0) + event.weight;
  }

  return Object.entries(categoryCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([category, score]) => ({
      category,
      score: Math.round(score * 10) / 10,
      events: events.filter(e => e.category === category),
      template: ROOT_CAUSE_TEMPLATES[category] || null,
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 追加到 golden-testset
// ─────────────────────────────────────────────────────────────────────────────
function appendToGoldenTestset(rootCauses, events) {
  let testset;
  try {
    testset = JSON.parse(fs.readFileSync(GOLDEN_TESTSET, 'utf8'));
  } catch {
    testset = {
      dataset: 'self-awareness-golden-testset',
      description: '用户纠偏自动沉淀的评测case，测试AI自主觉察能力',
      source: 'real_user_correction',
      cases: []
    };
  }

  const existingIds = new Set(testset.cases.map(c => c.id));
  const now = new Date().toISOString().split('T')[0];
  const newCases = [];

  for (const rc of rootCauses) {
    if (!rc.template) continue;

    // Generate unique ID
    const prefix = 'RW'; // ReworkAnalyzer prefix
    const suffix = `${rc.category.toUpperCase().replace(/_/g, '-').substring(0, 8)}-${Date.now().toString(36).toUpperCase()}`;
    const id = `${prefix}-${suffix}`;

    if (existingIds.has(id)) continue;

    const representativeEvent = rc.events[0];
    const newCase = {
      id,
      category: mapCategoryToTestsetCategory(rc.category),
      input: `返工事件: ${rc.category} (触发 ${rc.events.length} 次, score: ${rc.score})`,
      expected_behavior: rc.template.action,
      failure_mode: `Agent未能自主避免 "${rc.category}" 类型的返工`,
      source_date: now,
      auto_generated: true,
      source_signal: representativeEvent ? representativeEvent.signal : '',
      context_sample: representativeEvent ? representativeEvent.context.substring(0, 200) : '',
    };

    testset.cases.push(newCase);
    newCases.push(newCase);
    existingIds.add(id);
  }

  if (newCases.length > 0) {
    fs.mkdirSync(path.dirname(GOLDEN_TESTSET), { recursive: true });
    fs.writeFileSync(GOLDEN_TESTSET, JSON.stringify(testset, null, 2));
    console.log(`✅ 追加 ${newCases.length} 个新case到 golden-testset`);
  }

  return newCases;
}

function mapCategoryToTestsetCategory(cat) {
  const mapping = {
    'wrong_direction': 'self_initiative',
    'misaligned': 'delivery_quality',
    'misunderstanding': 'intent_alignment',
    'suboptimal_approach': 'selection_quality',
    'orchestration_issue': 'orchestration_efficiency',
    'full_rework': 'delivery_quality',
    'steer': 'self_initiative',
    'restart': 'resilience',
    'retry': 'resilience',
    'kill': 'resilience',
  };
  return mapping[cat] || 'self_awareness';
}

// ─────────────────────────────────────────────────────────────────────────────
// 生成/更新 ISC 规则草案
// ─────────────────────────────────────────────────────────────────────────────
function generateISCRuleDrafts(rootCauses) {
  const draftsDir = path.join(ISC_RULES_DIR, '_drafts');
  fs.mkdirSync(draftsDir, { recursive: true });

  const generatedDrafts = [];

  for (const rc of rootCauses) {
    if (!rc.template || rc.score < 0.7) continue; // Only high-confidence root causes

    const ruleId = `rework-auto-${rc.category.replace(/_/g, '-')}-${Date.now()}`;
    const draftPath = path.join(draftsDir, `draft.${ruleId}.json`);

    // Skip if similar draft already exists
    const existingDrafts = fs.existsSync(draftsDir)
      ? fs.readdirSync(draftsDir).filter(f => f.includes(rc.category.replace(/_/g, '-')))
      : [];
    if (existingDrafts.length > 0) continue;

    const draft = {
      id: ruleId,
      name: `auto_rework_prevention_${rc.category}`,
      domain: rc.template.domain,
      type: rc.template.ruleType,
      status: 'draft_pending_review',
      auto_generated: true,
      generation_source: 'rework-analyzer',
      generation_date: new Date().toISOString(),
      confidence: rc.score,
      evidence: {
        event_count: rc.events.length,
        category: rc.category,
        sample_signals: rc.events.slice(0, 3).map(e => e.signal),
      },
      description: rc.template.description,
      trigger: {
        type: 'pattern',
        patterns: [rc.category],
      },
      action: {
        type: 'enforce',
        description: rc.template.action,
      },
      review_required: true,
      review_notes: '由 rework-analyzer 自动生成，需人工审核后激活',
    };

    fs.writeFileSync(draftPath, JSON.stringify(draft, null, 2));
    generatedDrafts.push({ id: ruleId, category: rc.category, path: draftPath.replace(WORKSPACE + '/', '') });
    console.log(`📝 生成ISC规则草案: ${draftPath.replace(WORKSPACE + '/', '')}`);
  }

  return generatedDrafts;
}

// ─────────────────────────────────────────────────────────────────────────────
// 生成分析报告
// ─────────────────────────────────────────────────────────────────────────────
function generateReport(events, rootCauses, newCases, newDrafts, windowMinutes) {
  const now = new Date().toISOString();
  const dateStr = now.split('T')[0];

  let report = `# 返工根因分析报告 - ${dateStr}

> 自动生成于: ${now}
> 分析窗口: 过去 ${windowMinutes} 分钟
> 检测到返工事件: **${events.length} 个**

---

## 📊 返工事件统计

`;

  if (events.length === 0) {
    report += `✅ 分析窗口内未检测到返工信号\n\n`;
  } else {
    report += `| 根因类别 | 得分 | 事件数 | ISC规则状态 |\n`;
    report += `|----------|------|--------|-------------|\n`;
    for (const rc of rootCauses) {
      const hasDraft = newDrafts.some(d => d.category === rc.category);
      const ruleStatus = hasDraft ? '📝 草案已生成' : (rc.score >= 0.7 ? '⚠️ 待规则化' : '📋 已记录');
      report += `| ${rc.category} | ${rc.score} | ${rc.events.length} | ${ruleStatus} |\n`;
    }
    report += '\n';
  }

  // Root cause details
  if (rootCauses.length > 0) {
    report += `## 🔍 根因详情\n\n`;
    for (const rc of rootCauses.slice(0, 5)) {
      report += `### ${rc.category} (score: ${rc.score})\n\n`;
      if (rc.template) {
        report += `**规则类型**: ${rc.template.ruleType}\n`;
        report += `**建议行动**: ${rc.template.action}\n\n`;
      }
      if (rc.events.length > 0) {
        report += `**触发信号样本**:\n`;
        for (const evt of rc.events.slice(0, 2)) {
          report += `\`\`\`\n${evt.context.substring(0, 200)}\n\`\`\`\n`;
        }
      }
      report += '\n';
    }
  }

  // Golden testset updates
  report += `## 📚 Golden Testset 更新\n\n`;
  if (newCases.length === 0) {
    report += `无新case追加（类似case可能已存在）\n\n`;
  } else {
    for (const c of newCases) {
      report += `- **${c.id}**: ${c.input}\n`;
      report += `  → 期望行为: ${c.expected_behavior}\n`;
    }
    report += '\n';
  }

  // ISC rule drafts
  report += `## 📝 ISC 规则草案\n\n`;
  if (newDrafts.length === 0) {
    report += `无新草案生成（置信度不足或草案已存在）\n\n`;
  } else {
    for (const d of newDrafts) {
      report += `- \`${d.path}\`: 规则 "${d.id}" (类别: ${d.category})\n`;
    }
    report += `\n> 草案位于 \`skills/isc-core/rules/_drafts/\`，需人工审核后激活\n\n`;
  }

  report += `---
*由 infrastructure/self-check/rework-analyzer.js 自动生成*
`;

  return { report, dateStr };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const isAuto = args.includes('--auto');
  const windowArg = args.find(a => a.startsWith('--window=') || a === '--window');
  let windowMinutes = 1440; // Default: 24 hours

  if (windowArg) {
    const winIdx = args.indexOf('--window');
    windowMinutes = windowArg.includes('=')
      ? parseInt(windowArg.split('=')[1])
      : parseInt(args[winIdx + 1]);
    if (isNaN(windowMinutes)) windowMinutes = 1440;
  } else if (isAuto) {
    windowMinutes = 10; // Auto mode: last 10 minutes (cron runs every 5min)
  }

  const state = loadState();

  console.log(`[${new Date().toISOString()}] 返工分析器启动 (窗口: ${windowMinutes}分钟)`);

  // Scan for rework events
  const events = scanLogFiles(windowMinutes, isAuto ? state.lastProcessedTimestamp : null);
  console.log(`检测到 ${events.length} 个返工信号`);

  if (events.length === 0 && isAuto) {
    console.log('无新返工事件，退出');
    state.lastProcessedTimestamp = new Date().toISOString();
    saveState(state);
    return;
  }

  // Analyze root causes
  const rootCauses = analyzeRootCauses(events);

  // Append to golden testset
  const newCases = appendToGoldenTestset(rootCauses, events);

  // Generate ISC rule drafts
  const newDrafts = generateISCRuleDrafts(rootCauses);

  // Generate report
  const { report, dateStr } = generateReport(events, rootCauses, newCases, newDrafts, windowMinutes);

  const reportPath = path.join(REPORTS_DIR, `rework-analysis-${dateStr}.md`);
  fs.writeFileSync(reportPath, report);
  console.log(`✅ 分析报告: ${reportPath}`);

  state.lastProcessedTimestamp = new Date().toISOString();
  saveState(state);
}

main().catch(err => {
  console.error('返工分析器错误:', err);
  process.exit(1);
});
