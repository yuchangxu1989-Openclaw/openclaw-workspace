'use strict';

/**
 * Global Autonomous Decision Pipeline Dashboard
 *
 * Day2 Gap2 主实现：打通认知-决策-执行-效果-系统健康五层监控汇总。
 * 聚合来源：
 *   - infrastructure/decision-log/decisions.jsonl
 *   - infrastructure/observability/metrics.js
 *   - infrastructure/cron/fallback-sweep.js (L3 health)
 *   - infrastructure/logs/auto-response.jsonl
 *   - infrastructure/logs/health.jsonl
 *
 * 输出：
 *   - JSON summary
 *   - Markdown dashboard
 *
 * @module infrastructure/observability/global-decision-dashboard
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..', '..');
const REPORTS_DIR = path.join(WORKSPACE, 'reports', 'autonomy');
const JSON_REPORT = path.join(REPORTS_DIR, 'global-decision-dashboard.json');
const MD_REPORT = path.join(REPORTS_DIR, 'global-decision-dashboard.md');
const AUTO_RESPONSE_LOG = path.join(WORKSPACE, 'infrastructure', 'logs', 'auto-response.jsonl');
const SYSTEM_HEALTH_LOG = path.join(WORKSPACE, 'infrastructure', 'logs', 'health.jsonl');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) return [];
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
}

function withinHours(recordTime, hours) {
  const ts = new Date(recordTime).getTime();
  if (!Number.isFinite(ts)) return false;
  return ts >= Date.now() - hours * 3600_000;
}

function loadDecisionLogger() {
  try {
    return require('../decision-log/decision-logger');
  } catch (_) {
    return null;
  }
}

function loadMetrics() {
  try {
    return require('./metrics');
  } catch (_) {
    return null;
  }
}

function loadFallbackSweep() {
  try {
    return require('../cron/fallback-sweep');
  } catch (_) {
    return null;
  }
}

function rate(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

function phaseStatus({ total = 0, successRate = null, avgConfidence = null, degradationRate = null, unhealthy = 0, warnings = 0 }) {
  if (unhealthy > 0) return 'critical';
  if (successRate !== null && successRate < 70) return 'critical';
  if (avgConfidence !== null && avgConfidence < 0.5) return 'critical';
  if (degradationRate !== null && degradationRate > 20) return 'critical';
  if (warnings > 0) return 'warning';
  if (successRate !== null && successRate < 90) return 'warning';
  if (avgConfidence !== null && avgConfidence < 0.7) return 'warning';
  if (degradationRate !== null && degradationRate > 10) return 'warning';
  if (total === 0) return 'unknown';
  return 'healthy';
}

function buildDashboard(options = {}) {
  const hours = Number(options.hours || 24);
  const since = new Date(Date.now() - hours * 3600_000).toISOString();

  const decisionLogger = loadDecisionLogger();
  const metrics = loadMetrics();
  const fallbackSweep = loadFallbackSweep();

  const decisionSummary = decisionLogger && typeof decisionLogger.summarize === 'function'
    ? decisionLogger.summarize({ since })
    : { total: 0, by_phase: {}, avg_confidence: null, degradation_count: 0, by_component: {}, by_method: {} };

  const runtimeMetrics = metrics && typeof metrics.getMetrics === 'function'
    ? metrics.getMetrics()
    : null;

  const l3Health = fallbackSweep && typeof fallbackSweep.checkSystemHealthL3 === 'function'
    ? fallbackSweep.checkSystemHealthL3()
    : null;

  const autoResponses = readJsonl(AUTO_RESPONSE_LOG).filter(item => withinHours(item.ts || item.timestamp, hours));
  const healthLogs = readJsonl(SYSTEM_HEALTH_LOG).filter(item => withinHours(item.ts || item.timestamp, hours));

  const cognitionCount = decisionSummary.by_phase?.sensing?.count || 0;
  const decisionCount = decisionSummary.by_phase?.cognition?.count || 0;
  const executionCount = decisionSummary.by_phase?.execution?.count || 0;

  const executionSuccess = runtimeMetrics ? runtimeMetrics.dispatch_success : 0;
  const executionTotal = runtimeMetrics ? runtimeMetrics.dispatch_total : 0;
  const executionFailed = runtimeMetrics ? (runtimeMetrics.dispatch_failed || 0) + (runtimeMetrics.dispatch_timeout || 0) : 0;

  const effectEscalations = autoResponses.filter(r => r.action === 'escalate').length;
  const effectAutoFixCandidates = autoResponses.filter(r => r.action === 'auto_fix_candidate').length;
  const effectObserved = autoResponses.length;

  const latestHealth = healthLogs.length ? healthLogs[healthLogs.length - 1] : null;
  const unhealthyHealthLogs = healthLogs.filter(r => String(r.status).toLowerCase() !== 'healthy').length;

  const degradationRate = rate(decisionSummary.degradation_count || 0, decisionSummary.total || 0);
  const executionSuccessRate = rate(executionSuccess, executionTotal);

  const layers = {
    cognition: {
      total: cognitionCount,
      avg_confidence: decisionSummary.by_phase?.sensing?.avg_confidence ?? null,
      degradation_rate: degradationRate,
      top_components: Object.entries(decisionSummary.by_component || {}).sort((a, b) => b[1] - a[1]).slice(0, 5),
    },
    decision: {
      total: decisionCount,
      avg_confidence: decisionSummary.by_phase?.cognition?.avg_confidence ?? decisionSummary.avg_confidence ?? null,
      degradation_rate: degradationRate,
      methods: decisionSummary.by_method || {},
    },
    execution: {
      total: executionTotal,
      success: executionSuccess,
      failed: executionFailed,
      success_rate: executionSuccessRate,
      avg_latency_ms: runtimeMetrics ? runtimeMetrics.dispatch_latency_avg_ms : 0,
      retry: runtimeMetrics ? runtimeMetrics.dispatch_retry : 0,
    },
    effect: {
      observed: effectObserved,
      escalations: effectEscalations,
      auto_fix_candidates: effectAutoFixCandidates,
      log_and_monitor: autoResponses.filter(r => r.action === 'log_and_monitor').length,
      categories: autoResponses.reduce((acc, item) => {
        const key = item.category || 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
    },
    system_health: {
      status: l3Health?.overall || (latestHealth?.status || 'unknown'),
      warnings: l3Health?.warnings || [],
      errors: l3Health?.errors || [],
      latest: latestHealth,
      unhealthy_samples: unhealthyHealthLogs,
      l3: l3Health?.l3 || null,
    },
  };

  layers.cognition.status = phaseStatus({
    total: layers.cognition.total,
    avgConfidence: layers.cognition.avg_confidence,
    degradationRate: layers.cognition.degradation_rate,
  });
  layers.decision.status = phaseStatus({
    total: layers.decision.total,
    avgConfidence: layers.decision.avg_confidence,
    degradationRate: layers.decision.degradation_rate,
  });
  layers.execution.status = phaseStatus({
    total: layers.execution.total,
    successRate: layers.execution.success_rate,
    warnings: layers.execution.retry > 0 ? 1 : 0,
  });
  layers.effect.status = phaseStatus({
    total: layers.effect.observed,
    warnings: layers.effect.escalations > 0 ? 1 : 0,
  });
  layers.system_health.status = String(layers.system_health.status || 'unknown').toLowerCase() === 'critical'
    ? 'critical'
    : (layers.system_health.errors.length > 0
      ? 'critical'
      : (layers.system_health.warnings.length > 0 || layers.system_health.unhealthy_samples > 0 ? 'warning' : (layers.system_health.status || 'unknown')));

  const statusOrder = { critical: 4, unhealthy: 4, warning: 3, degraded: 3, healthy: 2, up: 2, info: 1, unknown: 0 };
  const overallStatus = Object.values(layers)
    .map(layer => layer.status || 'unknown')
    .sort((a, b) => (statusOrder[b] || 0) - (statusOrder[a] || 0))[0] || 'unknown';

  return {
    generated_at: new Date().toISOString(),
    window_hours: hours,
    since,
    overall_status: overallStatus,
    summary: {
      total_decisions: decisionSummary.total || 0,
      total_dispatch: executionTotal,
      total_effect_observations: effectObserved,
      total_health_samples: healthLogs.length,
    },
    layers,
  };
}

function statusEmoji(status) {
  if (['critical', 'unhealthy'].includes(status)) return '🔴';
  if (['warning', 'degraded'].includes(status)) return '🟡';
  if (['healthy', 'up'].includes(status)) return '🟢';
  return '⚪';
}

function toMarkdown(dashboard) {
  const lines = [];
  lines.push('# 全局自主决策流水线监控总仪表盘');
  lines.push(`- 生成时间: ${dashboard.generated_at}`);
  lines.push(`- 观察窗口: 最近 ${dashboard.window_hours} 小时`);
  lines.push(`- 总状态: ${statusEmoji(dashboard.overall_status)} ${String(dashboard.overall_status).toUpperCase()}`);
  lines.push('');
  lines.push('## 总览');
  lines.push(`- 决策记录: ${dashboard.summary.total_decisions}`);
  lines.push(`- 执行分发: ${dashboard.summary.total_dispatch}`);
  lines.push(`- 效果观测: ${dashboard.summary.total_effect_observations}`);
  lines.push(`- 健康样本: ${dashboard.summary.total_health_samples}`);
  lines.push('');

  for (const [name, layer] of Object.entries(dashboard.layers)) {
    lines.push(`## ${statusEmoji(layer.status)} ${name}`);
    lines.push(`- 状态: ${layer.status}`);
    for (const [key, value] of Object.entries(layer)) {
      if (key === 'status') continue;
      if (Array.isArray(value)) {
        lines.push(`- ${key}: ${value.length ? JSON.stringify(value) : '[]'}`);
      } else if (value && typeof value === 'object') {
        lines.push(`- ${key}: ${JSON.stringify(value)}`);
      } else {
        lines.push(`- ${key}: ${value}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

function writeReports(dashboard) {
  ensureDir(REPORTS_DIR);
  fs.writeFileSync(JSON_REPORT, JSON.stringify(dashboard, null, 2));
  fs.writeFileSync(MD_REPORT, toMarkdown(dashboard));
  return { json: JSON_REPORT, markdown: MD_REPORT };
}

function main() {
  const args = process.argv.slice(2);
  const jsonOnly = args.includes('--json');
  const write = args.includes('--write');
  const hoursArg = args.find(arg => arg.startsWith('--hours='));
  const hours = hoursArg ? Number(hoursArg.split('=')[1]) : 24;

  const dashboard = buildDashboard({ hours });
  if (write) writeReports(dashboard);

  if (jsonOnly) {
    console.log(JSON.stringify(dashboard, null, 2));
  } else {
    console.log(toMarkdown(dashboard));
  }

  return dashboard;
}

module.exports = {
  buildDashboard,
  toMarkdown,
  writeReports,
  main,
  JSON_REPORT,
  MD_REPORT,
};

if (require.main === module) {
  main();
}
