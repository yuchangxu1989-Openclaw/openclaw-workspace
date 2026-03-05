#!/usr/bin/env node
/**
 * correction-harvester.js
 * =======================
 * 触发器：用户消息中包含纠偏信号
 *   检测词：「不对」「应该」「为什么不」「你这个有问题」「错了」「重做」等
 * 行为：提取纠偏内容 → 抽象为规则草案 → 写入待review队列
 * 输出：infrastructure/aeo/golden-testset/pending-cases.json
 *
 * 使用说明：
 *   # 从文件读取消息并分析
 *   node infrastructure/self-check/correction-harvester.js --input path/to/messages.json
 *
 *   # 直接分析一条消息（stdin模式）
 *   echo "你这个实现不对，应该用LLM语义判断" | node infrastructure/self-check/correction-harvester.js --stdin
 *
 *   # 扫描记忆文件中的历史纠偏（增量）
 *   node infrastructure/self-check/correction-harvester.js --auto
 *
 *   # 分析指定日期的记忆文件
 *   node infrastructure/self-check/correction-harvester.js --date 2026-03-05
 *
 *   # 由cron每5分钟调用
 *   node infrastructure/self-check/correction-harvester.js --auto --window 10
 *
 * 依赖：Node.js 18+ (无外部依赖)
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const WORKSPACE = process.env.WORKSPACE_ROOT || '/root/.openclaw/workspace';
const MEMORY_DIR = path.join(WORKSPACE, 'memory');
const PENDING_CASES_FILE = path.join(WORKSPACE, 'infrastructure/aeo/golden-testset/pending-cases.json');
const STATE_FILE = path.join(WORKSPACE, 'infrastructure/self-check/.harvester-state.json');
const REPORTS_DIR = path.join(WORKSPACE, 'reports');

// ─────────────────────────────────────────────────────────────────────────────
// 纠偏信号检测器（多层，从强到弱）
// ─────────────────────────────────────────────────────────────────────────────
const CORRECTION_SIGNALS = [
  // 强信号 - 明确否定
  {
    pattern: /你(这个|的实现|做的|给的|写的)?(有问题|不对|错了|不行|不是|不符合)/i,
    strength: 'strong',
    type: 'direct_negation',
    extractContext: true,
  },
  {
    pattern: /(完全|根本|明显)(不对|错了|错误|有问题|没用)/i,
    strength: 'strong',
    type: 'emphatic_negation',
    extractContext: true,
  },
  {
    pattern: /这(不是|根本不是).*要(的|求|实现)/i,
    strength: 'strong',
    type: 'misalignment',
    extractContext: true,
  },
  {
    pattern: /重新.*(做|实现|写|来)/i,
    strength: 'strong',
    type: 'rework_request',
    extractContext: true,
  },

  // 中强信号 - 方向纠正
  {
    pattern: /应该(是|用|做|采用|考虑)/i,
    strength: 'medium',
    type: 'direction_correction',
    extractContext: true,
  },
  {
    pattern: /为什么不(用|做|考虑|采用|直接)/i,
    strength: 'medium',
    type: 'approach_question',
    extractContext: true,
  },
  {
    pattern: /(更好的|正确的|合理的)(方式|方法|做法|实现|选择)/i,
    strength: 'medium',
    type: 'better_approach',
    extractContext: true,
  },
  {
    pattern: /不(需要|应该).*(问|等|请示|确认)/i,
    strength: 'medium',
    type: 'autonomy_correction',
    extractContext: true,
  },
  {
    pattern: /你(应该|本应|本来应该).*自(己|主|动)/i,
    strength: 'medium',
    type: 'autonomy_correction',
    extractContext: true,
  },

  // 弱信号 - 隐式纠偏
  {
    pattern: /(没有|缺少|漏掉|忘了).*(功能|实现|处理|考虑)/i,
    strength: 'weak',
    type: 'missing_feature',
    extractContext: true,
  },
  {
    pattern: /这(种事|类情况|个场景).*(应该|不需要|自动)/i,
    strength: 'weak',
    type: 'expectation_mismatch',
    extractContext: true,
  },
  {
    pattern: /每次都.*才(反应|做|处理|执行)/i,
    strength: 'weak',
    type: 'reactivity_correction',
    extractContext: true,
  },

  // 具体场景信号
  {
    pattern: /不是.*串行.*(是|应该|要|得).*并行/i,
    strength: 'strong',
    type: 'orchestration_correction',
    extractContext: true,
  },
  {
    pattern: /不是.*Jaccard.*(是|应该|要|用).*LLM/i,
    strength: 'strong',
    type: 'algorithm_correction',
    extractContext: true,
  },
  {
    pattern: /(虚假|模拟|假的|捏造).*(数据|结果|输出)/i,
    strength: 'strong',
    type: 'data_integrity_violation',
    extractContext: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 纠偏类型 → 规则草案映射
// ─────────────────────────────────────────────────────────────────────────────
const CORRECTION_TO_RULE = {
  'direct_negation': {
    category: 'delivery_quality',
    ruleHint: '交付前需进行自检对比，确保实现符合需求',
    priority: 'P0',
  },
  'emphatic_negation': {
    category: 'delivery_quality',
    ruleHint: '强烈否定通常意味着方向性错误，需在规划阶段对齐',
    priority: 'P0',
  },
  'misalignment': {
    category: 'intent_alignment',
    ruleHint: '执行前输出需求理解摘要，明确"你要的是X，我理解为Y"',
    priority: 'P1',
  },
  'rework_request': {
    category: 'delivery_quality',
    ruleHint: '交付物需满足验收标准，否则视为未完成',
    priority: 'P0',
  },
  'direction_correction': {
    category: 'approach_selection',
    ruleHint: '方案选择时评估多个选项，选择最符合场景的',
    priority: 'P1',
  },
  'approach_question': {
    category: 'approach_selection',
    ruleHint: '当有更优选项时，主动选择而非默认次优方案',
    priority: 'P1',
  },
  'better_approach': {
    category: 'approach_selection',
    ruleHint: '重要决策必须对比方案优劣，不能仅因"简单"就选择次优',
    priority: 'P1',
  },
  'autonomy_correction': {
    category: 'self_initiative',
    ruleHint: '对于可以自主判断的事情，不应等待用户指令',
    priority: 'P0',
  },
  'missing_feature': {
    category: 'completeness',
    ruleHint: '交付前检查完整性清单，不遗漏关键功能',
    priority: 'P1',
  },
  'expectation_mismatch': {
    category: 'self_initiative',
    ruleHint: '对常见场景的标准处理应主动执行，无需用户提醒',
    priority: 'P0',
  },
  'reactivity_correction': {
    category: 'self_initiative',
    ruleHint: '建立主动觉察机制，不依赖用户指出问题',
    priority: 'P0',
  },
  'orchestration_correction': {
    category: 'orchestration_efficiency',
    ruleHint: '无依赖关系的任务必须并行，不得串行',
    priority: 'P1',
  },
  'algorithm_correction': {
    category: 'selection_quality',
    ruleHint: '重要判断必须选择最优算法，不以"更简单"为由降级',
    priority: 'P0',
  },
  'data_integrity_violation': {
    category: 'data_integrity',
    ruleHint: '严禁使用虚假/模拟数据，必须是真实可验证的结果',
    priority: 'P0',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 状态管理
// ─────────────────────────────────────────────────────────────────────────────
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { lastProcessedTimestamp: null, processedFiles: [], caseCount: 0 };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// 加载pending-cases
// ─────────────────────────────────────────────────────────────────────────────
function loadPendingCases() {
  try {
    return JSON.parse(fs.readFileSync(PENDING_CASES_FILE, 'utf8'));
  } catch {
    return {
      schema: 'pending-correction-cases-v1',
      description: '用户纠偏信号自动提取的待review规则草案',
      generated_at: new Date().toISOString(),
      cases: []
    };
  }
}

function savePendingCases(data) {
  fs.mkdirSync(path.dirname(PENDING_CASES_FILE), { recursive: true });
  data.last_updated = new Date().toISOString();
  fs.writeFileSync(PENDING_CASES_FILE, JSON.stringify(data, null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// 从文本中提取纠偏信息
// ─────────────────────────────────────────────────────────────────────────────
function extractCorrections(text, source = 'unknown') {
  const corrections = [];

  for (const signal of CORRECTION_SIGNALS) {
    const regex = new RegExp(signal.pattern.source, 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      // Extract surrounding context (sentence or paragraph)
      const start = Math.max(0, match.index - 80);
      const end = Math.min(text.length, match.index + match[0].length + 150);
      const context = text.substring(start, end).trim();

      // Try to extract the "correct" thing being suggested
      const correctionText = extractCorrectionContent(text, match.index, signal.type);

      corrections.push({
        raw_signal: match[0],
        signal_type: signal.type,
        strength: signal.strength,
        context: context.substring(0, 300),
        correction_content: correctionText,
        source,
        position: match.index,
      });
    }
  }

  // Deduplicate overlapping matches
  return deduplicateCorrections(corrections);
}

function extractCorrectionContent(text, signalPos, signalType) {
  // Extract the "what should be done" part from context
  const after = text.substring(signalPos, signalPos + 200);

  // Common patterns for extracting the correction
  const patterns = [
    /应该(是|用|做|采用)?\s*(.{10,80})/,
    /正确的(做法|方式|方法)?\s*(?:是|为)?\s*(.{10,80})/,
    /(?:而是|而应该|改用)\s*(.{10,80})/,
    /需要\s*(.{10,80})/,
  ];

  for (const pat of patterns) {
    const m = after.match(pat);
    if (m) return m[m.length - 1].trim().substring(0, 150);
  }

  // Fallback: return the full context truncated
  return after.trim().substring(0, 100);
}

function deduplicateCorrections(corrections) {
  // Remove corrections with position within 50 chars of each other
  const result = [];
  for (const c of corrections) {
    const isDuplicate = result.some(r =>
      Math.abs(r.position - c.position) < 50
    );
    if (!isDuplicate) result.push(c);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 将提取的纠偏转换为规则草案
// ─────────────────────────────────────────────────────────────────────────────
function convertToPendingCase(correction, sourceDate) {
  const ruleInfo = CORRECTION_TO_RULE[correction.signal_type] || {
    category: 'general',
    ruleHint: '需人工分析',
    priority: 'P2',
  };

  const id = `PC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

  return {
    id,
    status: 'pending_review',
    priority: ruleInfo.priority,
    source_date: sourceDate || new Date().toISOString().split('T')[0],
    source: correction.source,
    signal_type: correction.signal_type,
    signal_strength: correction.strength,

    // 原始数据
    raw_signal: correction.raw_signal,
    context: correction.context,

    // 抽象为规则
    extracted_correction: correction.correction_content,
    category: ruleInfo.category,
    rule_hint: ruleInfo.ruleHint,

    // 待填充的规则草案
    draft_rule: {
      description: `[待补充] 基于纠偏信号: "${correction.raw_signal}"`,
      action: ruleInfo.ruleHint,
      domain: mapCategoryToDomain(ruleInfo.category),
      auto_generated: true,
    },

    // 审核工作流
    review_notes: '',
    reviewed_by: null,
    review_date: null,
    promoted_to_isc: false,
  };
}

function mapCategoryToDomain(category) {
  const mapping = {
    'delivery_quality': 'delivery',
    'intent_alignment': 'intent',
    'approach_selection': 'implementation',
    'self_initiative': 'orchestration',
    'completeness': 'delivery',
    'orchestration_efficiency': 'orchestration',
    'selection_quality': 'implementation',
    'data_integrity': 'data',
  };
  return mapping[category] || 'general';
}

// ─────────────────────────────────────────────────────────────────────────────
// 扫描记忆文件
// ─────────────────────────────────────────────────────────────────────────────
function scanMemoryFiles(windowMinutes, processedFiles) {
  if (!fs.existsSync(MEMORY_DIR)) return [];

  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);
  const allCorrections = [];

  const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.md') || f.endsWith('.json'));

  for (const file of files) {
    if (processedFiles.includes(file)) continue;

    const filePath = path.join(MEMORY_DIR, file);
    try {
      const stat = fs.statSync(filePath);
      if (stat.mtime < cutoff) continue;

      const content = fs.readFileSync(filePath, 'utf8');
      const dateStr = file.match(/(\d{4}-\d{2}-\d{2})/) ? file.match(/(\d{4}-\d{2}-\d{2})/)[1] : null;

      const corrections = extractCorrections(content, `memory/${file}`);
      if (corrections.length > 0) {
        console.log(`  📁 ${file}: ${corrections.length} 个纠偏信号`);
      }
      allCorrections.push(...corrections.map(c => ({ ...c, sourceDate: dateStr })));
    } catch (e) {
      // skip
    }
  }

  return allCorrections;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const isAuto = args.includes('--auto');
  const isStdin = args.includes('--stdin');
  const inputArg = args.find(a => a.startsWith('--input=') || a === '--input');
  const dateArg = args.find(a => a.startsWith('--date=') || a === '--date');
  const windowArg = args.find(a => a.startsWith('--window=') || a === '--window');

  let windowMinutes = isAuto ? 10 : 1440; // Auto: 10min, manual: 24h
  if (windowArg) {
    const winIdx = args.indexOf('--window');
    windowMinutes = windowArg.includes('=')
      ? parseInt(windowArg.split('=')[1])
      : parseInt(args[winIdx + 1]);
  }

  const state = loadState();
  const pendingCases = loadPendingCases();
  const existingIds = new Set(pendingCases.cases.map(c => c.id));

  let allCorrections = [];

  // ── Input Source ──────────────────────────────────────────────────────────
  if (isStdin) {
    // Read from stdin
    const rl = readline.createInterface({ input: process.stdin });
    const lines = [];
    for await (const line of rl) lines.push(line);
    const text = lines.join('\n');
    const corrections = extractCorrections(text, 'stdin');
    allCorrections.push(...corrections.map(c => ({ ...c, sourceDate: new Date().toISOString().split('T')[0] })));

  } else if (inputArg) {
    // Read from file
    const inputPath = inputArg.includes('=') ? inputArg.split('=')[1] : args[args.indexOf('--input') + 1];
    try {
      const content = fs.readFileSync(inputPath, 'utf8');
      const corrections = extractCorrections(content, inputPath);
      allCorrections.push(...corrections.map(c => ({ ...c, sourceDate: new Date().toISOString().split('T')[0] })));
      console.log(`📄 从文件读取: ${inputPath} → ${corrections.length} 个纠偏信号`);
    } catch (e) {
      console.error(`错误: 无法读取文件 ${inputPath}: ${e.message}`);
      process.exit(1);
    }

  } else if (dateArg) {
    // Scan specific date's memory file
    const dateStr = dateArg.includes('=') ? dateArg.split('=')[1] : args[args.indexOf('--date') + 1];
    const memFile = path.join(MEMORY_DIR, `${dateStr}.md`);
    if (!fs.existsSync(memFile)) {
      console.log(`未找到记忆文件: ${memFile}`);
      return;
    }
    const content = fs.readFileSync(memFile, 'utf8');
    const corrections = extractCorrections(content, `memory/${dateStr}.md`);
    allCorrections.push(...corrections.map(c => ({ ...c, sourceDate: dateStr })));
    console.log(`📅 扫描 ${dateStr}: ${corrections.length} 个纠偏信号`);

  } else {
    // Default: scan memory files
    console.log(`[${new Date().toISOString()}] 纠偏收割器启动 (窗口: ${windowMinutes}分钟)`);
    console.log('🔍 扫描记忆文件...');
    const processedFiles = isAuto ? (state.processedFiles || []) : [];
    allCorrections = scanMemoryFiles(windowMinutes, processedFiles);
  }

  console.log(`总计: ${allCorrections.length} 个纠偏信号`);

  if (allCorrections.length === 0) {
    if (isAuto) {
      console.log('无新纠偏信号，退出');
      state.lastProcessedTimestamp = new Date().toISOString();
      saveState(state);
      return;
    }
  }

  // ── Convert to pending cases ──────────────────────────────────────────────
  const newCases = [];
  for (const correction of allCorrections) {
    // Deduplicate: skip very similar corrections
    const isSimilar = pendingCases.cases.some(c =>
      c.signal_type === correction.signal_type &&
      c.raw_signal === correction.raw_signal
    );
    if (isSimilar) continue;

    const pendingCase = convertToPendingCase(correction, correction.sourceDate);
    if (!existingIds.has(pendingCase.id)) {
      pendingCases.cases.push(pendingCase);
      newCases.push(pendingCase);
      existingIds.add(pendingCase.id);
    }
  }

  // ── Save pending cases ────────────────────────────────────────────────────
  if (newCases.length > 0) {
    savePendingCases(pendingCases);
    console.log(`✅ 追加 ${newCases.length} 个case到 pending-cases.json`);
    console.log(`   总计 pending cases: ${pendingCases.cases.length}`);
  } else {
    console.log('无新case需要追加（信号已存在或无信号）');
  }

  // ── Generate summary report ───────────────────────────────────────────────
  const dateStr = new Date().toISOString().split('T')[0];
  const reportPath = path.join(REPORTS_DIR, `correction-harvest-${dateStr}.md`);

  // Group by signal type
  const byType = {};
  for (const c of newCases) {
    if (!byType[c.signal_type]) byType[c.signal_type] = [];
    byType[c.signal_type].push(c);
  }

  let report = `# 纠偏收割报告 - ${dateStr}

> 自动生成于: ${new Date().toISOString()}
> 分析窗口: ${windowMinutes} 分钟
> 新增case: **${newCases.length} 个**
> Pending队列总计: **${pendingCases.cases.length} 个**

---

## 📊 信号分布

`;

  if (newCases.length === 0) {
    report += `✅ 本次无新纠偏信号\n\n`;
  } else {
    report += `| 信号类型 | 强度 | 数量 | 类别 |\n`;
    report += `|----------|------|------|------|\n`;
    for (const [type, cases] of Object.entries(byType)) {
      const sample = cases[0];
      report += `| ${type} | ${sample.signal_strength} | ${cases.length} | ${sample.category} |\n`;
    }
    report += '\n';

    report += `## 📝 新增规则草案\n\n`;
    for (const c of newCases.slice(0, 10)) {
      report += `### ${c.id} (${c.priority})\n\n`;
      report += `- **信号**: \`${c.raw_signal}\`\n`;
      report += `- **类别**: ${c.category}\n`;
      report += `- **规则提示**: ${c.rule_hint}\n`;
      report += `- **上下文**: ${c.context.substring(0, 150)}...\n\n`;
    }
    if (newCases.length > 10) {
      report += `... 还有 ${newCases.length - 10} 个case，详见 pending-cases.json\n\n`;
    }
  }

  // Pending queue overview
  const pendingByPriority = { P0: 0, P1: 0, P2: 0 };
  for (const c of pendingCases.cases) {
    if (c.status === 'pending_review') {
      pendingByPriority[c.priority] = (pendingByPriority[c.priority] || 0) + 1;
    }
  }

  report += `## 📋 Pending 队列状态

| 优先级 | 数量 |
|--------|------|
| P0 (紧急) | ${pendingByPriority['P0'] || 0} |
| P1 (重要) | ${pendingByPriority['P1'] || 0} |
| P2 (一般) | ${pendingByPriority['P2'] || 0} |

> 队列文件: \`infrastructure/aeo/golden-testset/pending-cases.json\`

---
*由 infrastructure/self-check/correction-harvester.js 自动生成*
`;

  fs.writeFileSync(reportPath, report);
  console.log(`✅ 报告已写入: ${reportPath}`);

  // Update state
  if (isAuto || !isStdin) {
    state.lastProcessedTimestamp = new Date().toISOString();
    state.caseCount = pendingCases.cases.length;
    saveState(state);
  }
}

main().catch(err => {
  console.error('纠偏收割器错误:', err);
  process.exit(1);
});
