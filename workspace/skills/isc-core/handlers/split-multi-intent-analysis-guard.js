'use strict';

/**
 * ISC Handler: split-multi-intent-analysis-guard
 * Rule: rule.split-multi-intent-analysis-001
 *
 * 检测派发任务是否包含多个独立的查询/分析意图，
 * 若检测到多意图打包，记录Badcase并生成告警。
 *
 * 触发时机：审计spawn记录，检查任务描述中的意图数量
 */

const fs = require('fs');
const path = require('path');
const { writeReport, emitEvent, gateResult } = require('../lib/handler-utils');

// 多意图检测：中文序号、数字编号、换行分隔的独立问题
const MULTI_INTENT_PATTERNS = [
  /(?:^|\n)\s*[1-9][0-9]?\s*[、.．)\）]/gm,           // 1、 2、 3、 or 1. 2. 3.
  /(?:^|\n)\s*(?:第[一二三四五六七八九十]+|[①②③④⑤⑥⑦⑧⑨⑩])/gm, // 第一、第二 or ①②③
  /(?:^|\n)\s*[-\-•]\s+(?:查|核查|排查|分析|检查|确认|验证)/gm,  // - 查XX / - 分析XX
];

// 分析类关键词（区分分析任务和普通步骤）
const ANALYSIS_KEYWORDS = /查|核查|排查|分析|检查|确认|验证|审计|扫描|搜索|统计|对比|评估/;

/**
 * 检测任务描述中的独立意图数量
 */
function countIntents(taskText) {
  if (!taskText || typeof taskText !== 'string') return { count: 0, intents: [] };

  const intents = [];
  
  // 方法1：检测编号列表
  for (const pattern of MULTI_INTENT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(taskText)) !== null) {
      const lineStart = match.index;
      const lineEnd = taskText.indexOf('\n', lineStart + match[0].length);
      const line = taskText.substring(lineStart, lineEnd > 0 ? lineEnd : lineStart + 100).trim();
      if (ANALYSIS_KEYWORDS.test(line)) {
        intents.push(line.substring(0, 120));
      }
    }
  }

  // 去重
  const unique = [...new Set(intents)];
  return { count: unique.length, intents: unique };
}

/**
 * 审计spawn记录，检查是否有多意图打包
 */
module.exports = async function handler(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || process.cwd();
  const bus = context?.bus;

  logger.info?.('[split-multi-intent-analysis-guard] 开始审计任务派发记录');

  const checks = [];
  const violations = [];

  // 从event中获取任务描述（实时模式）
  const taskText = event?.payload?.task || event?.payload?.description || '';
  if (taskText) {
    const { count, intents } = countIntents(taskText);
    if (count >= 2) {
      violations.push({
        source: 'realtime',
        intentCount: count,
        intents,
        taskPreview: taskText.substring(0, 300),
        severity: 'high',
        remedy: `应拆分为 ${count} 个独立子Agent并行执行`,
      });
    }
  }

  // 审计模式：扫描最近的spawn日志
  const auditLogPath = path.join(root, 'logs', 'isc-enforce', 'audit-trail.jsonl');
  if (fs.existsSync(auditLogPath)) {
    try {
      const lines = fs.readFileSync(auditLogPath, 'utf8').trim().split('\n').slice(-20);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.event === 'task.dispatch.requested' && entry.task) {
            const { count, intents } = countIntents(entry.task);
            if (count >= 2) {
              violations.push({
                source: 'audit',
                time: entry.time,
                intentCount: count,
                intents,
                severity: 'medium',
                remedy: `历史记录：此任务包含${count}个独立意图，应拆分`,
              });
            }
          }
        } catch { /* skip malformed */ }
      }
    } catch (e) {
      logger.warn?.(`[split-multi-intent-analysis-guard] 读取审计日志失败: ${e.message}`);
    }
  }

  checks.push({
    name: 'no-multi-intent-bundling',
    ok: violations.length === 0,
    message: violations.length === 0
      ? '未发现多意图打包派发'
      : `发现 ${violations.length} 处多意图分析任务打包派发`,
  });

  if (violations.length > 0 && bus) {
    emitEvent(bus, 'isc.violation.detected', {
      rule: 'rule.split-multi-intent-analysis-001',
      severity: 'high',
      count: violations.length,
      violations: violations.slice(0, 3),
    });
  }

  const result = gateResult('split-multi-intent-analysis-guard', checks, { failClosed: false });

  writeReport(
    path.join(root, 'reports', 'split-multi-intent-analysis-audit.json'),
    {
      rule: 'rule.split-multi-intent-analysis-001',
      timestamp: new Date().toISOString(),
      violations,
      ...result,
    }
  );

  logger.info?.(`[split-multi-intent-analysis-guard] 审计完成: ${result.passed ? '✅通过' : '❌发现违规'}`);
  return result;
};
