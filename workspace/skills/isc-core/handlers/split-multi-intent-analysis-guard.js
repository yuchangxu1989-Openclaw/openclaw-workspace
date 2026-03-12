'use strict';

/**
 * ISC Handler: split-multi-intent-analysis-guard
 * Rule: rule.split-multi-intent-analysis-001
 *
 * 检测派发任务是否包含多个独立的查询/分析意图，
 * 若检测到多意图打包，记录Badcase并生成告警。
 *
 * v2.0: 纯LLM语义理解，移除正则/关键词匹配。
 */

const fs = require('fs');
const path = require('path');
const { writeReport, emitEvent, gateResult } = require('../lib/handler-utils');

let _callLLM = null;
try {
  _callLLM = require(path.join(__dirname, '../../../skills/cras/intent-extractor-llm')).callLLM;
} catch (_) {
  try {
    _callLLM = require(path.join(__dirname, '../../../infrastructure/llm-context')).chat;
  } catch (_2) {}
}

const COUNT_INTENTS_PROMPT = `分析以下任务描述，判断其中包含多少个独立的查询/分析/排查意图。

规则：
- 独立意图 = 可以由不同人并行完成、互不依赖的分析/查询任务
- 一个任务的多个步骤不算多意图（有依赖关系的步骤是一个意图）
- 语义理解，不要只看编号格式

只输出JSON：
{"count":数字,"intents":["意图1简述","意图2简述"]}
无独立意图返回 {"count":0,"intents":[]}`;

async function countIntents(taskText) {
  if (!taskText || typeof taskText !== 'string' || !taskText.trim()) {
    return { count: 0, intents: [] };
  }

  if (!_callLLM) {
    return { count: 0, intents: [], reason: 'llm_unavailable' };
  }

  try {
    const response = await _callLLM(
      COUNT_INTENTS_PROMPT,
      `任务描述：\n${taskText.slice(0, 800)}`,
      { timeout: 8000 }
    );

    let jsonStr = String(response || '').trim();
    const start = jsonStr.indexOf('{');
    const end = jsonStr.lastIndexOf('}');
    if (start >= 0 && end > start) jsonStr = jsonStr.slice(start, end + 1);

    const parsed = JSON.parse(jsonStr);
    return {
      count: typeof parsed.count === 'number' ? parsed.count : 0,
      intents: Array.isArray(parsed.intents) ? parsed.intents.map(i => String(i).slice(0, 120)) : [],
    };
  } catch (_) {
    return { count: 0, intents: [] };
  }
}

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
    const { count, intents } = await countIntents(taskText);
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
            const { count, intents } = await countIntents(entry.task);
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
