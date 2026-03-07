'use strict';

/**
 * L3 Observability Dashboard
 * 
 * Generates markdown reports from:
 *   - Runtime metrics (metrics.js)
 *   - Health checks (health.js)
 *   - Alert state (alerts.js)
 *   - Pipeline run logs
 *   - DecisionLog summaries
 *   - Global five-layer autonomous decision dashboard
 * 
 * Can be called by heartbeat for periodic system status output.
 * 
 * @module infrastructure/observability/dashboard
 */

const fs = require('fs');
const path = require('path');

// ─── Dependencies (lazy-loaded to avoid circular) ────────────────

function _loadMetrics() {
  try { return require('./metrics'); } catch (_) { return null; }
}

function _loadHealth() {
  try { return require('./health'); } catch (_) { return null; }
}

function _loadAlerts() {
  try { return require('./alerts'); } catch (_) { return null; }
}

function _loadDecisionLog() {
  try { return require('../decision-log/decision-logger'); } catch (_) { return null; }
}

function _loadGlobalDecisionDashboard() {
  try { return require('./global-decision-dashboard'); } catch (_) { return null; }
}

// ─── Constants ───────────────────────────────────────────────────

const PIPELINE_RUN_LOG = path.join(__dirname, '..', 'pipeline', 'run-log.jsonl');

// ─── Report Generation ──────────────────────────────────────────

/**
 * Generate a comprehensive L3 system status report in Markdown.
 * 
 * @param {object} [options]
 * @param {boolean} [options.includeHistory=false] - Include metrics history
 * @param {number} [options.historyLimit=10] - Max history entries
 * @returns {string} Markdown report
 */
function generateReport(options = {}) {
  const lines = [];
  const now = new Date();

  lines.push(`# 🔭 L3 系统运行报告`);
  lines.push(`> 生成时间: ${now.toISOString()}`);
  lines.push('');

  // ─── Health Status ───
  const health = _loadHealth();
  if (health) {
    try {
      const check = health.checkHealth();
      const statusIcon = check.status === 'healthy' ? '🟢'
        : check.status === 'degraded' ? '🟡' : '🔴';

      lines.push(`## ${statusIcon} 系统健康状态: ${check.status.toUpperCase()}`);
      lines.push('');

      for (const [name, comp] of Object.entries(check.components)) {
        const icon = comp.status === 'up' ? '✅'
          : comp.status === 'degraded' ? '⚠️' : '❌';
        lines.push(`- ${icon} **${name}**: ${comp.status}`);
        if (comp.details.error) lines.push(`  - 错误: ${comp.details.error}`);
        if (comp.details.warning) lines.push(`  - 警告: ${comp.details.warning}`);
        // Key details
        if (comp.details.total_events !== undefined) lines.push(`  - 总事件数: ${comp.details.total_events}`);
        if (comp.details.rules_loaded !== undefined) lines.push(`  - 加载规则: ${comp.details.rules_loaded}`);
        if (comp.details.route_count !== undefined) lines.push(`  - 路由数: ${comp.details.route_count}`);
      }
      lines.push('');
    } catch (err) {
      lines.push(`## ❌ 健康检查失败: ${err.message}`);
      lines.push('');
    }
  }

  // ─── Runtime Metrics ───
  const metricsModule = _loadMetrics();
  if (metricsModule) {
    try {
      const m = metricsModule.getMetrics();
      lines.push(`## 📊 运行时指标`);
      lines.push('');
      lines.push(`运行时长: ${m.uptime_human || 'N/A'}`);
      lines.push('');

      // Event Bus
      lines.push('### 📨 事件总线');
      lines.push(`- 发射总数: ${m.events_emitted_total}`);
      lines.push(`- 处理总数: ${m.events_processed_total}`);
      lines.push(`- 丢弃总数: ${m.events_dropped_total}`);
      lines.push('');

      // Intent Scanner
      lines.push('### 🧠 意图识别');
      lines.push(`- 请求总数: ${m.intent_requests_total}`);
      lines.push(`- 无匹配总数: ${m.intent_no_match_total}`);
      lines.push(`- 无匹配率: ${(m.intent_no_match_rate || 0).toFixed(1)}%`);
      lines.push(`- 平均延迟: ${m.intent_latency_avg_ms}ms (P95: ${m.intent_latency_p95_ms}ms)`);
      if (m.intent_hits_by_category && Object.keys(m.intent_hits_by_category).length > 0) {
        lines.push('- 命中分类:');
        for (const [cat, count] of Object.entries(m.intent_hits_by_category)) {
          lines.push(`  - ${cat}: ${count}`);
        }
      }
      lines.push('');

      // Rule Matcher
      lines.push('### 📐 规则匹配');
      lines.push(`- 评估总数: ${m.rules_evaluated_total}`);
      lines.push(`- 匹配总数: ${m.rules_matched_total}`);
      lines.push(`- 无匹配总数: ${m.rules_no_match_total}`);
      lines.push(`- 匹配率: ${(m.rules_match_rate || 0).toFixed(1)}%`);
      lines.push('');

      // Dispatcher
      lines.push('### 🚀 分发器');
      lines.push(`- 分发总数: ${m.dispatch_total}`);
      lines.push(`- 成功: ${m.dispatch_success}`);
      lines.push(`- 超时: ${m.dispatch_timeout}`);
      lines.push(`- 重试: ${m.dispatch_retry}`);
      lines.push(`- 失败: ${m.dispatch_failed || 0}`);
      lines.push(`- 超时率: ${(m.dispatch_timeout_rate || 0).toFixed(1)}%`);
      lines.push(`- 平均延迟: ${m.dispatch_latency_avg_ms}ms`);
      lines.push('');

      // Pipeline
      lines.push('### 🔄 流水线');
      lines.push(`- 运行总数: ${m.pipeline_runs_total}`);
      lines.push(`- 断路器触发: ${m.pipeline_breaker_trips}`);
      lines.push(`- 平均延迟: ${m.pipeline_avg_latency_ms}ms (P95: ${m.pipeline_p95_latency_ms}ms)`);
      lines.push('');
    } catch (err) {
      lines.push(`## ❌ 指标收集失败: ${err.message}`);
      lines.push('');
    }
  }

  // ─── Alerts ───
  const alertsModule = _loadAlerts();
  if (alertsModule) {
    try {
      const recentAlerts = alertsModule.getRecentAlerts({ limit: 10 });
      lines.push(`## 🚨 告警状态`);
      lines.push('');

      if (recentAlerts.length === 0) {
        lines.push('✅ 无活跃告警');
      } else {
        for (const alert of recentAlerts) {
          const icon = alert.severity === 'critical' ? '🔴'
            : alert.severity === 'warning' ? '🟡' : 'ℹ️';
          lines.push(`- ${icon} **[${alert.severity.toUpperCase()}]** ${alert.rule_name}`);
          lines.push(`  - ${alert.message}`);
          lines.push(`  - 时间: ${alert.timestamp}`);
        }
      }
      lines.push('');
    } catch (_) {}
  }

  // ─── Pipeline Run History ───
  try {
    if (fs.existsSync(PIPELINE_RUN_LOG)) {
      const content = fs.readFileSync(PIPELINE_RUN_LOG, 'utf8').trim();
      const allLines = content.split('\n').filter(l => l.trim());
      const recentRuns = allLines.slice(-5).reverse();

      if (recentRuns.length > 0) {
        lines.push(`## 📋 最近流水线运行`);
        lines.push('');

        for (const runLine of recentRuns) {
          try {
            const run = JSON.parse(runLine);
            const icon = (run.errors || []).length > 0 ? '⚠️' : '✅';
            lines.push(`- ${icon} \`${run.run_id || 'N/A'}\``);
            lines.push(`  - 时间: ${run.timestamp}`);
            lines.push(`  - 事件: ${run.consumed_events} | 规则: ${run.matched_rules} | 意图: ${run.intents_detected} | 分发: ${run.dispatched_actions}`);
            lines.push(`  - 耗时: ${run.duration_ms}ms | 断路: ${run.circuit_breaks} | 错误: ${(run.errors || []).length}`);
          } catch (_) {}
        }
        lines.push('');
      }
    }
  } catch (_) {}

  // ─── DecisionLog Summary ───
  const decisionLog = _loadDecisionLog();
  if (decisionLog && typeof decisionLog.summarize === 'function') {
    try {
      const last24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      const summary = decisionLog.summarize({ since: last24h });

      lines.push(`## 📝 决策日志摘要 (24h)`);
      lines.push('');
      lines.push(`- 总记录: ${summary.total}`);
      lines.push(`- 平均置信度: ${summary.avg_confidence !== null ? summary.avg_confidence.toFixed(3) : 'N/A'}`);
      lines.push(`- 降级次数: ${summary.degradation_count}`);

      if (summary.by_phase && Object.keys(summary.by_phase).length > 0) {
        lines.push('- 按阶段:');
        for (const [phase, stats] of Object.entries(summary.by_phase)) {
          lines.push(`  - ${phase}: ${stats.count} (avg confidence: ${stats.avg_confidence !== null ? stats.avg_confidence.toFixed(3) : 'N/A'})`);
        }
      }

      if (summary.by_component && Object.keys(summary.by_component).length > 0) {
        lines.push('- 按组件:');
        const sorted = Object.entries(summary.by_component).sort((a, b) => b[1] - a[1]);
        for (const [comp, count] of sorted.slice(0, 10)) {
          lines.push(`  - ${comp}: ${count}`);
        }
      }
      lines.push('');
    } catch (_) {}
  }

  // ─── Global Five-Layer Dashboard ───
  const globalDashboard = _loadGlobalDecisionDashboard();
  if (globalDashboard && typeof globalDashboard.buildDashboard === 'function') {
    try {
      const dashboard = globalDashboard.buildDashboard({ hours: 24 });
      lines.push(`## 🧭 全局自主决策五层总览 (24h)`);
      lines.push('');
      lines.push(`- 总状态: ${dashboard.overall_status}`);
      for (const [layerName, layer] of Object.entries(dashboard.layers || {})) {
        lines.push(`- ${layerName}: ${layer.status}`);
      }
      lines.push('');
    } catch (_) {}
  }

  // ─── Footer ───
  lines.push('---');
  lines.push(`*Generated by L3 Observability Dashboard at ${now.toISOString()}*`);

  return lines.join('\n');
}

/**
 * Generate a compact one-line status string (for heartbeat/log).
 * @returns {string}
 */
function statusLine() {
  const health = _loadHealth();
  const metricsModule = _loadMetrics();

  let status = 'unknown';
  let metrics = '';

  if (health) {
    try {
      const check = health.checkHealth();
      status = check.status;
    } catch (_) {}
  }

  if (metricsModule) {
    try {
      const m = metricsModule.getMetrics();
      metrics = `events=${m.events_emitted_total} rules=${m.rules_matched_total}/${m.rules_evaluated_total} dispatch=${m.dispatch_success}/${m.dispatch_total} pipeline=${m.pipeline_runs_total}`;
    } catch (_) {}
  }

  return `[L3] status=${status} ${metrics} at=${new Date().toISOString()}`;
}

/**
 * Run alerts evaluation and return triggered alerts.
 * Convenience wrapper for heartbeat integration.
 * @returns {Array<object>}
 */
function checkAlerts() {
  const alertsModule = _loadAlerts();
  if (!alertsModule) return [];
  return alertsModule.evaluate();
}

// ─── CLI ─────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--status')) {
    console.log(statusLine());
  } else if (args.includes('--json')) {
    const metricsModule = _loadMetrics();
    const health = _loadHealth();
    const alertsModule = _loadAlerts();

    const data = {
      generated_at: new Date().toISOString(),
      health: health ? health.checkHealth() : null,
      metrics: metricsModule ? metricsModule.getMetrics() : null,
      alerts: alertsModule ? alertsModule.getRecentAlerts() : [],
    };
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(generateReport());
  }
}

// ─── Exports ─────────────────────────────────────────────────────

module.exports = {
  generateReport,
  statusLine,
  checkAlerts,
};
