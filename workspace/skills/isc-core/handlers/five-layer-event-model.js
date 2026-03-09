'use strict';

/**
 * five-layer-event-model.js
 * Handler for rule.five-layer-event-model-001
 *
 * 校验事件是否按5层模型正确分类：
 * L1 对象生命周期、L2 量化阈值、L3 语义意图、L4 知识发现、L5 系统性模式。
 */

const path = require('path');
const fs = require('fs');
const { scanFiles, writeReport, gateResult } = require('../lib/handler-utils');

const VALID_LAYERS = ['L1', 'L2', 'L3', 'L4', 'L5'];

const LAYER_HEURISTICS = [
  { layer: 'L1', patterns: [/\.created$/, /\.modified$/, /\.deleted$/, /lifecycle/i] },
  { layer: 'L2', patterns: [/threshold/i, /counter/i, /exceeded/i, /量化|阈值|计数/] },
  { layer: 'L3', patterns: [/intent/i, /semantic/i, /意图|语义|cras/i] },
  { layer: 'L4', patterns: [/discovery/i, /knowledge/i, /学术|知识|发现/] },
  { layer: 'L5', patterns: [/pattern/i, /systemic/i, /root.?cause/i, /系统性|根因|反复失败/] },
];

/**
 * @param {object} context - ISC 运行时上下文
 * @param {string} context.repoRoot - 仓库根目录
 * @returns {object} gate result
 */
async function handler(context = {}) {
  const repoRoot = context.repoRoot || process.cwd();
  const checks = [];
  const unclassified = [];
  let totalEvents = 0;

  // 扫描规则文件中的事件定义
  const rulesDir = path.join(repoRoot, 'skills', 'isc-core', 'rules');
  scanFiles(rulesDir, /\.json$/, (filePath) => {
    let rule;
    try {
      rule = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return;
    }

    const trigger = rule.trigger || {};
    const events = trigger.events || (trigger.event ? [trigger.event] : []);

    for (const event of events) {
      totalEvents++;
      // 尝试启发式分类
      const inferredLayer = LAYER_HEURISTICS.find(h =>
        h.patterns.some(p => p.test(event))
      );

      if (!inferredLayer && !rule.event_layer) {
        unclassified.push({
          rule: rule.id || path.basename(filePath),
          event,
          suggestion: '建议在规则中添加 event_layer 字段',
        });
      }
    }
  }, { maxDepth: 1 });

  checks.push({
    name: 'event-layer-classification',
    ok: unclassified.length === 0,
    message: unclassified.length === 0
      ? `全部 ${totalEvents} 个事件已可分类`
      : `${unclassified.length}/${totalEvents} 个事件无法分类到5层模型`,
  });

  const result = gateResult('five-layer-event-model-001', checks, { failClosed: false });

  writeReport(path.join(repoRoot, 'reports', 'five-layer-event-model.json'), {
    rule: 'rule.five-layer-event-model-001',
    timestamp: new Date().toISOString(),
    summary: { totalEvents, unclassified: unclassified.length, status: result.status },
    unclassified: unclassified.slice(0, 50),
  });

  return result;
}

module.exports = handler;
