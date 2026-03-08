#!/usr/bin/env node
/**
 * CRAS Event Bridge - 真正的学习引擎
 * 
 * 从事件总线消费 AEO 评测结果、本地任务编排 同步事件、系统错误，
 * 生成洞察报告并写入事件总线。
 * 
 * 替代原有模拟数据流程，实现 CRAS 认知闭环。
 */

'use strict';

const path = require('path');
const fs = require('fs');
const bus = require(path.join(__dirname, '..', '..', 'infrastructure', 'event-bus', 'bus-adapter'));

const CONSUMER_ID = 'cras';
const INSIGHTS_DIR = path.join(__dirname, 'insights');
const REPORTS_DIR = path.join(__dirname, 'reports');

// 确保目录存在
[INSIGHTS_DIR, REPORTS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

/**
 * 消费事件总线中的 AEO 评测结果、本地任务编排 同步事件和系统错误，
 * 分析后生成洞察和报告。
 */
function processAssessments() {
  const events = bus.consume({
    consumerId: CONSUMER_ID,
    type_filter: 'aeo.assessment.*'
  }).concat(bus.consume({
    consumerId: CONSUMER_ID,
    type_filter: 'dto.sync.completed'
  })).concat(bus.consume({
    consumerId: CONSUMER_ID,
    type_filter: 'system.error'
  }));

  if (events.length === 0) {
    console.log('[CRAS] 无待处理事件');
    return { processed: 0, insights: 0 };
  }

  console.log(`[CRAS] 发现 ${events.length} 个待处理事件`);

  const insights = [];

  for (const event of events) {
    try {
      const insight = analyzeEvent(event);
      if (insight) {
        insights.push(insight);
        saveInsight(insight);
      }
      // bus-adapter auto-acks via cursor, no explicit ack needed
    } catch (err) {
      console.error(`[CRAS] 分析事件失败: ${event.id}`, err.message);
    }
  }

  // 生成汇总报告
  if (insights.length > 0) {
    const report = generateReport(insights);
    saveReport(report);

    // 发布洞察事件到事件总线
    bus.emit('cras.insight.generated', {
      insight_count: insights.length,
      report_id: report.id,
      summary: report.summary
    }, 'cras');

    console.log(`[CRAS] 已发布洞察事件 (report: ${report.id})`);
  }

  return { processed: events.length, insights: insights.length };
}

/**
 * 根据事件类型分析，生成洞察对象
 */
function analyzeEvent(event) {
  const id = `insight_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // AEO 评测事件
  if (event.type.startsWith('aeo.assessment')) {
    const p = event.payload || {};
    return {
      id,
      type: 'assessment_analysis',
      source_event: event.id,
      skill: p.skill_name || 'unknown',
      finding: p.passed
        ? `技能 ${p.skill_name} 评测通过 (${p.track} 轨道, 得分 ${p.score})`
        : `技能 ${p.skill_name} 评测失败，问题: ${JSON.stringify(p.issues || [])}`,
      severity: p.passed ? 'info' : 'warning',
      recommendation: p.passed
        ? null
        : `建议检查技能 ${p.skill_name} 的 ${p.track} 质量`,
      timestamp: Date.now()
    };
  }

  // 系统错误事件
  if (event.type === 'system.error') {
    const p = event.payload || {};
    return {
      id,
      type: 'error_pattern',
      source_event: event.id,
      skill: p.source || 'unknown',
      finding: `系统错误来自 ${p.source}: ${p.error}`,
      severity: 'error',
      recommendation: `检查 ${p.source} 模块的错误处理`,
      timestamp: Date.now()
    };
  }

  // 本地任务编排 同步事件
  if (event.type === 'dto.sync.completed') {
    const p = event.payload || {};
    return {
      id,
      type: 'sync_tracking',
      source_event: event.id,
      skill: 'dto',
      finding: `DTO完成同步: 规则 ${p.rule_id || 'N/A'}`,
      severity: 'info',
      recommendation: null,
      timestamp: Date.now()
    };
  }

  return null;
}

/**
 * 保存洞察到文件
 */
function saveInsight(insight) {
  const file = path.join(INSIGHTS_DIR, `${insight.id}.json`);
  fs.writeFileSync(file, JSON.stringify(insight, null, 2));
}

/**
 * 根据洞察列表生成汇总报告
 */
function generateReport(insights) {
  const report = {
    id: `report_${Date.now()}`,
    generated_at: new Date().toISOString(),
    insight_count: insights.length,
    by_severity: {
      error: insights.filter(i => i.severity === 'error').length,
      warning: insights.filter(i => i.severity === 'warning').length,
      info: insights.filter(i => i.severity === 'info').length
    },
    summary: insights.map(i => i.finding).join('; '),
    recommendations: insights.filter(i => i.recommendation).map(i => i.recommendation),
    insights: insights.map(i => i.id)
  };

  return report;
}

/**
 * 保存报告到文件
 */
function saveReport(report) {
  const file = path.join(REPORTS_DIR, `${report.id}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`[CRAS] 报告已保存: ${report.id}`);
}

// CLI 入口
if (require.main === module) {
  const result = processAssessments();
  console.log(`[CRAS] 完成: ${JSON.stringify(result)}`);
}

/**
 * 知识学习完成后发布事件
 * 供外部调用：CRAS完成知识学习后调用此函数emit事件
 * @param {object} result - 学习结果
 * @param {string} result.source - 学习来源 (active-learning, passive-learning, etc.)
 * @param {number} result.insight_count - 学习到的洞察数量
 * @param {string} [result.topic] - 学习主题
 * @returns {object} 发布的事件
 */
function emitKnowledgeLearned(result) {
  const event = bus.emit('cras.knowledge.learned', {
    source: result.source || 'unknown',
    insight_count: result.insight_count || 0,
    topic: result.topic || null,
    timestamp: Date.now()
  }, 'cras');
  console.log(`[CRAS-Bridge] 发布事件: cras.knowledge.learned (source=${result.source}, insights=${result.insight_count})`);
  return event;
}

/**
 * 分析请求接口 — 供 Dispatcher 反向调用
 * 接收事件，触发CRAS分析流程，返回分析结果
 * @param {object} event - 触发事件
 * @returns {object} 分析结果
 */
function analyzeRequest(event) {
  const payload = event.payload || event;
  const result = analyzeEvent({
    id: event.id || `req_${Date.now()}`,
    type: payload.type || 'analysis_request',
    payload: payload,
    timestamp: Date.now()
  });

  if (result) {
    saveInsight(result);
    // 发布洞察事件
    bus.emit('cras.insight.generated', {
      insight_count: 1,
      report_id: result.id,
      summary: result.finding,
      trigger: 'dispatcher_request'
    }, 'cras');
  }

  return {
    status: 'ok',
    handler: 'cras-analysis',
    insight: result,
    timestamp: new Date().toISOString()
  };
}

module.exports = { processAssessments, analyzeEvent, generateReport, emitKnowledgeLearned, analyzeRequest };
