'use strict';

/**
 * 自主执行器：子Agent任务检查点门禁
 * 流水线：感知→判断→自主执行→验证→闭环
 *
 * 创建子Agent任务时 → 检查任务复杂度 → 超标则要求拆分 → 确保中间产出
 */

const fs = require('fs');
const path = require('path');

const MAX_ESTIMATED_MINUTES = 5;
const MAX_ESTIMATED_TOKENS = 15000;

// 任务复杂度指标
const COMPLEXITY_MARKERS = {
  high: [
    /读.*分析.*修改.*测试/,
    /read.*analyze.*modify.*test/i,
    /全量.*扫描/,
    /complete.*scan/i,
    /所有.*文件/,
    /all.*files/i,
    /端到端/,
    /end.?to.?end/i,
  ],
  multi_phase: [
    /先.*然后.*最后/,
    /first.*then.*finally/i,
    /step\s*1.*step\s*2/i,
    /阶段\s*1.*阶段\s*2/,
    /phase\s*\d/i,
  ],
};

const ANTI_PATTERNS = [
  '单个子Agent同时做：读代码+分析问题+修改代码+跑测试+写报告',
  '子Agent执行完毕但result只有一句话',
];

function estimateComplexity(task) {
  const taskStr = typeof task === 'string' ? task : JSON.stringify(task);
  const result = {
    estimated_minutes: 0,
    estimated_tokens: 0,
    complexity: 'low',
    issues: [],
    suggestions: [],
  };

  // 基于任务描述长度粗估
  const wordCount = taskStr.split(/\s+/).length;
  result.estimated_tokens = Math.max(wordCount * 100, 3000); // 粗略估计

  // 检查高复杂度标记
  for (const pattern of COMPLEXITY_MARKERS.high) {
    if (pattern.test(taskStr)) {
      result.complexity = 'high';
      result.estimated_minutes = 8;
      result.estimated_tokens = Math.max(result.estimated_tokens, 20000);
      result.issues.push('任务包含多步骤复杂操作');
      break;
    }
  }

  // 检查多阶段标记
  for (const pattern of COMPLEXITY_MARKERS.multi_phase) {
    if (pattern.test(taskStr)) {
      result.complexity = result.complexity === 'high' ? 'very_high' : 'medium';
      result.estimated_minutes = Math.max(result.estimated_minutes, 6);
      result.issues.push('任务包含多个顺序阶段');
      break;
    }
  }

  // 估计时间
  if (result.estimated_minutes === 0) {
    result.estimated_minutes = Math.ceil(result.estimated_tokens / 3000); // ~3k tokens/min
  }

  // 生成拆分建议
  if (result.estimated_minutes > MAX_ESTIMATED_MINUTES || result.estimated_tokens > MAX_ESTIMATED_TOKENS) {
    result.suggestions.push('建议拆分为2+个串行子Agent');
    result.suggestions.push('分析和修改应分离：先分析产出报告，再基于报告修改');
    result.suggestions.push('每个子Agent必须写入文件作为中间产出');
  }

  return result;
}

module.exports = async function(event, rule, context) {
  const payload = event.payload || event.data || {};
  const task = payload.task || payload.description || payload.prompt || '';
  const timeout = payload.timeout || payload.timeoutMs || 0;

  if (!task) {
    return { status: 'skip', reason: '无任务描述' };
  }

  const complexity = estimateComplexity(task);

  // 检查是否需要文件产出
  const hasFileOutput = /写入|输出.*文件|save.*file|write.*file|产出|output/i.test(
    typeof task === 'string' ? task : JSON.stringify(task)
  );

  if (!hasFileOutput && complexity.complexity !== 'low') {
    complexity.issues.push('子Agent任务未指定文件产出，可能仅返回对话结果（容易被截断）');
    complexity.suggestions.push('在任务描述中明确要求写入报告/代码文件');
  }

  // 判断是否阻断
  const shouldBlock =
    complexity.estimated_minutes > MAX_ESTIMATED_MINUTES ||
    complexity.estimated_tokens > MAX_ESTIMATED_TOKENS ||
    complexity.complexity === 'very_high';

  // 记录日志
  const logDir = path.resolve(__dirname, '../../logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  try {
    fs.appendFileSync(
      path.join(logDir, 'subagent-checkpoint.jsonl'),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        complexity: complexity.complexity,
        estimated_min: complexity.estimated_minutes,
        estimated_tokens: complexity.estimated_tokens,
        blocked: shouldBlock,
        issues: complexity.issues.length,
      }) + '\n'
    );
  } catch { /* best effort */ }

  if (shouldBlock) {
    const msg = [
      `🚫 **子Agent任务复杂度过高**`,
      '',
      `预估时间: ${complexity.estimated_minutes}min (上限${MAX_ESTIMATED_MINUTES}min)`,
      `预估tokens: ${complexity.estimated_tokens} (上限${MAX_ESTIMATED_TOKENS})`,
      '',
      '**问题**:',
      ...complexity.issues.map(i => `- ${i}`),
      '',
      '**建议**:',
      ...complexity.suggestions.map(s => `- ${s}`),
    ].join('\n');
    if (context?.notify) context.notify('feishu', msg, { severity: 'high' });

    return {
      status: 'blocked',
      gate: 'subagent_checkpoint',
      complexity,
      message: '任务复杂度超标，请拆分后重试',
    };
  }

  return {
    status: 'pass',
    complexity: complexity.complexity,
    estimated_minutes: complexity.estimated_minutes,
    message: '子Agent任务复杂度检查通过',
  };
};
