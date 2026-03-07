#!/usr/bin/env node
'use strict';

/**
 * Autonomous Pipeline Monitor — 全局自主决策流水线监控
 * 
 * Day2 Gap2 集成改造：
 *   从"监控代码流水线"升级为"监控认知-决策-执行闭环"
 *   报告不再是Dev视角的changelog，而是Agent运营视角的效果仪表盘
 * 
 * 功能:
 *   1. 采集五层闭环数据 (via pipeline-dashboard-collector)
 *   2. 生成 Markdown 运营仪表盘
 *   3. 生成飞书 Interactive Card
 *   4. 与现有 cron 系统集成
 *   5. 支持趋势分析 (与上次快照对比)
 * 
 * 运行模式:
 *   node autonomous-pipeline-monitor.js               # 生成报告
 *   node autonomous-pipeline-monitor.js --card         # 同时生成飞书卡片JSON
 *   node autonomous-pipeline-monitor.js --send <id>    # 发送卡片到飞书
 *   node autonomous-pipeline-monitor.js --json         # JSON输出
 *   node autonomous-pipeline-monitor.js --1h           # 1小时窗口（用于hourly check）
 * 
 * @module infrastructure/observability/autonomous-pipeline-monitor
 */

const fs = require('fs');
const path = require('path');

const REPORTS_DIR = '/root/.openclaw/workspace/reports';
const INFRA_DIR = path.resolve(__dirname, '..');

// ─── Lazy Dependencies ──────────────────────────────────

function _loadCollector() {
  return require('./pipeline-dashboard-collector');
}

// ─── Sparkline / Visualization ──────────────────────────

function sparkBar(v, mx, w = 12) {
  if (!mx || mx === 0) return '░'.repeat(w);
  const f = Math.round((v / mx) * w);
  return '█'.repeat(Math.min(f, w)) + '░'.repeat(Math.max(w - f, 0));
}

function statusIcon(s) {
  return { healthy: '🟢', warning: '🟡', critical: '🔴', no_data: '⚪', unknown: '⚪' }[s] || '⚪';
}

function alertIcon(level) {
  return { critical: '🔴', warn: '🟡', info: 'ℹ️' }[level] || '📌';
}

function pct(n, d) { return d > 0 ? +(n / d * 100).toFixed(1) : 'N/A'; }

// ─── Delta Analysis ─────────────────────────────────────

function computeDelta(current, previous) {
  if (!previous) return null;
  const delta = {};

  // Score change
  if (current.overall.composite_score != null && previous.overall?.composite_score != null) {
    delta.score_change = current.overall.composite_score - previous.overall.composite_score;
  }

  // Alert count change
  delta.alert_change = (current.all_alerts?.length || 0) - (previous.all_alerts?.length || 0);

  // Layer status changes
  delta.layer_changes = {};
  for (const key of ['L1', 'L2', 'L3', 'L4', 'L5']) {
    const curStatus = current.layers?.[key]?.status;
    const prevStatus = previous.layers?.[key]?.status;
    if (curStatus !== prevStatus) {
      delta.layer_changes[key] = { from: prevStatus, to: curStatus };
    }
  }

  return delta;
}

// ─── Markdown Report Generator ──────────────────────────

function generateMarkdownReport(snapshot, delta) {
  const now = new Date(snapshot.generated_at);
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const lines = [];

  // Title
  lines.push(`# ${snapshot.overall.status_icon} Agent 运营五层仪表盘`);
  lines.push(`> 📅 ${dateStr} ${timeStr} | ⏰ 窗口: ${snapshot.window_hours}h | Schema: ${snapshot.schema}`);
  lines.push('');

  // Delta summary
  if (delta) {
    const changes = [];
    if (delta.score_change != null && delta.score_change !== 0) {
      changes.push(`评分 ${delta.score_change > 0 ? '📈+' : '📉'}${delta.score_change}`);
    }
    if (delta.alert_change !== 0) {
      changes.push(`告警 ${delta.alert_change > 0 ? '⬆️+' : '⬇️'}${delta.alert_change}`);
    }
    const layerChanges = Object.entries(delta.layer_changes || {});
    if (layerChanges.length > 0) {
      for (const [k, v] of layerChanges) {
        changes.push(`${k} ${statusIcon(v.from)}→${statusIcon(v.to)}`);
      }
    }
    if (changes.length > 0) {
      lines.push(`> 🔄 变化: ${changes.join(' | ')}`);
      lines.push('');
    }
  }

  // ─── Overall Summary ───
  lines.push('## 📋 总览\n');
  const score = snapshot.overall.composite_score;
  if (score != null) {
    lines.push(`**${statusIcon(snapshot.overall.status)} 综合评分: ${score}/100**\n`);
    const bd = snapshot.overall.score_breakdown || {};
    if (Object.keys(bd).length > 0) {
      lines.push('| 维度 | 评分 | 可视化 |');
      lines.push('|------|------|--------|');
      for (const [dim, val] of Object.entries(bd)) {
        const si = val >= 80 ? '🟢' : val >= 60 ? '🟡' : '🔴';
        lines.push(`| ${dim} | ${si} ${val} | ${sparkBar(val, 100, 15)} |`);
      }
      lines.push('');
    }
  }

  // Layer status overview
  lines.push('| 层级 | 状态 | 告警 |');
  lines.push('|------|------|------|');
  for (const [key, layer] of Object.entries(snapshot.layers)) {
    const name = { L1: '🧠 意图', L2: '⚖️ 决策', L3: '⚡ 执行', L4: '🎯 效果', L5: '🏥 系统' }[key] || key;
    const alertCount = layer.alerts.length;
    lines.push(`| ${name} | ${statusIcon(layer.status)} ${layer.status} | ${alertCount > 0 ? '⚠️ ' + alertCount : '✅ 0'} |`);
  }
  lines.push('');

  // ─── L1 Intent ───
  const l1 = snapshot.layers.L1;
  lines.push('## 🧠 L1 意图层\n');
  if (l1.data.requests_total != null) {
    lines.push('| 指标 | 值 |');
    lines.push('|------|-----|');
    lines.push(`| 请求总数 | ${l1.data.requests_total} |`);
    lines.push(`| 命中率 | ${l1.data.hit_rate}% |`);
    lines.push(`| 未识别率 | ${l1.data.no_match_rate}% |`);
    lines.push(`| 延迟 avg/P95 | ${l1.data.latency_avg_ms}ms / ${l1.data.latency_p95_ms}ms |`);
    lines.push(`| 注册意图数 | ${l1.data.registered_intents || 'N/A'} (活跃: ${l1.data.active_intents || 'N/A'}) |`);
    lines.push('');
    if (Object.keys(l1.data.hits_by_category || {}).length > 0) {
      lines.push('**IC分布:**');
      for (const [cat, count] of Object.entries(l1.data.hits_by_category)) {
        lines.push(`- ${cat}: ${count}`);
      }
      lines.push('');
    }
  } else {
    lines.push('> ⚪ 意图层无运行时数据\n');
  }

  // ─── L2 Decision ───
  const l2 = snapshot.layers.L2;
  lines.push('## ⚖️ L2 决策层\n');
  if (l2.data.decisions_total != null || l2.data.rules_evaluated != null) {
    lines.push('| 指标 | 值 |');
    lines.push('|------|-----|');
    if (l2.data.decisions_total != null) {
      lines.push(`| 决策记录 | ${l2.data.decisions_total} |`);
      lines.push(`| 平均置信度 | ${l2.data.avg_confidence != null ? l2.data.avg_confidence.toFixed(3) : 'N/A'} |`);
      lines.push(`| 降级次数 | ${l2.data.degradation_count || 0} |`);
    }
    if (l2.data.rules_evaluated != null) {
      lines.push(`| 规则评估 | ${l2.data.rules_evaluated} |`);
      lines.push(`| 规则匹配率 | ${l2.data.rules_match_rate}% |`);
      lines.push(`| 裸奔场景 | ${l2.data.rules_no_match} |`);
    }
    lines.push(`| 熔断触发 | ${l2.data.breaker_trips || 0} |`);
    lines.push('');

    // Phase distribution
    if (l2.data.by_phase && Object.keys(l2.data.by_phase).length > 0) {
      lines.push('**按阶段:**');
      const phaseIcons = { sensing: '👁️', cognition: '🧠', execution: '⚡' };
      for (const [p, s] of Object.entries(l2.data.by_phase)) {
        lines.push(`- ${phaseIcons[p] || '📌'} ${p}: ${s.count} (置信度 ${s.avg_confidence != null ? s.avg_confidence.toFixed(3) : 'N/A'})`);
      }
      lines.push('');
    }

    // Component distribution
    if (l2.data.by_component && Object.keys(l2.data.by_component).length > 0) {
      const sorted = Object.entries(l2.data.by_component).sort((a, b) => b[1] - a[1]);
      lines.push('**Top决策组件:**');
      for (const [c, n] of sorted.slice(0, 5)) {
        lines.push(`- \`${c}\`: ${n}`);
      }
      lines.push('');
    }
  } else {
    lines.push('> ⚪ 决策层无数据\n');
  }

  // ─── L3 Execution ───
  const l3 = snapshot.layers.L3;
  lines.push('## ⚡ L3 执行层\n');
  if (l3.data.dispatch_total != null) {
    const dt = l3.data.dispatch_total;
    lines.push('| 指标 | 数量 | 占比 |');
    lines.push('|------|------|------|');
    lines.push(`| ✅ 成功 | ${l3.data.dispatch_success} | ${pct(l3.data.dispatch_success, dt)}% |`);
    lines.push(`| ❌ 失败 | ${l3.data.dispatch_failed} | ${pct(l3.data.dispatch_failed, dt)}% |`);
    lines.push(`| ⏱️ 超时 | ${l3.data.dispatch_timeout} | ${pct(l3.data.dispatch_timeout, dt)}% |`);
    lines.push(`| 🔄 重试 | ${l3.data.dispatch_retry} | ${pct(l3.data.dispatch_retry, dt)}% |`);
    lines.push(`| **合计** | **${dt}** | **100%** |`);
    lines.push('');
    lines.push(`**延迟:** 分发 avg=${l3.data.dispatch_latency_avg}ms P95=${l3.data.dispatch_latency_p95}ms | 流水线 avg=${l3.data.pipeline_latency_avg}ms P95=${l3.data.pipeline_latency_p95}ms`);
    lines.push('');
  }
  if (l3.data.pipeline_total_runs != null) {
    lines.push(`**流水线:** ${l3.data.pipeline_total_runs} 次运行 | 近期错误率: ${l3.data.recent_error_rate}%`);
    if (l3.data.last_run) {
      const lr = l3.data.last_run;
      lines.push(`- 最近: \`${lr.id}\` | 事件=${lr.events} 规则=${lr.rules} 分发=${lr.dispatched} 错误=${lr.errors} | ${lr.duration_ms}ms`);
    }
    lines.push('');
  }
  if (l3.data.cron_24h) {
    const cr = l3.data.cron_24h;
    lines.push(`**Cron(24h):** ✅${cr.ok} ❌${cr.fail} ⏭️${cr.skip}`);
    if (l3.data.cron_problems && l3.data.cron_problems.length > 0) {
      lines.push('问题任务:');
      for (const p of l3.data.cron_problems) {
        lines.push(`- \`${p.job}\`: ${p.fails} 次失败`);
      }
    }
    lines.push('');
  }

  // ─── L4 Effect ───
  const l4 = snapshot.layers.L4;
  lines.push('## 🎯 L4 效果层 (AEO)\n');
  if (l4.data.aeo_avg_score != null) {
    lines.push('| 指标 | 值 |');
    lines.push('|------|-----|');
    lines.push(`| 总评估数 | ${l4.data.aeo_total_assessments} |`);
    lines.push(`| 近期评估 | ${l4.data.aeo_recent_assessments} |`);
    lines.push(`| 平均分 | ${l4.data.aeo_avg_score} |`);
    lines.push(`| 通过率 | ${l4.data.aeo_pass_rate}% |`);
    lines.push(`| 评估集数 | ${l4.data.eval_sets_count || 'N/A'} |`);
    lines.push('');

    if (l4.data.aeo_by_track && Object.keys(l4.data.aeo_by_track).length > 0) {
      lines.push('**按轨道:**');
      for (const [t, d] of Object.entries(l4.data.aeo_by_track)) {
        lines.push(`- ${t}: ${d.count} 评估 | 均分 ${d.avg_score ?? 'N/A'}`);
      }
      lines.push('');
    }
  }
  lines.push(`**纠偏信号(24h):** ${l4.data.correction_events_24h ?? 'N/A'} 次`);
  lines.push('');

  // ─── L5 System ───
  const l5 = snapshot.layers.L5;
  lines.push('## 🏥 L5 系统健康\n');
  if (l5.data.components) {
    lines.push('| 组件 | 状态 |');
    lines.push('|------|------|');
    for (const [name, c] of Object.entries(l5.data.components)) {
      const ci = { up: '✅', degraded: '⚠️', down: '❌' }[c.status] || '⚪';
      const detail = c.error || c.warning || '';
      lines.push(`| ${name} | ${ci} ${c.status} ${detail ? '— ' + detail : ''} |`);
    }
    lines.push('');
  }

  if (l5.data.eventbus) {
    const eb = l5.data.eventbus;
    lines.push(`**EventBus:** 发射 ${eb.emitted} / 处理 ${eb.processed} / 丢弃 ${eb.dropped} / 积压 ${eb.backlog}`);
    lines.push('');
  }

  if (l5.data.mem_pct != null) {
    lines.push('| 资源 | 使用 | 状态 |');
    lines.push('|------|------|------|');
    lines.push(`| 内存 | ${l5.data.mem_used_mb}MB / ${l5.data.mem_total_mb}MB (${l5.data.mem_pct}%) | ${l5.data.mem_pct > 85 ? '🔴' : l5.data.mem_pct > 70 ? '🟡' : '✅'} |`);
    lines.push(`| 磁盘 | ${l5.data.disk_pct}% | ${l5.data.disk_pct > 90 ? '🔴' : l5.data.disk_pct > 75 ? '🟡' : '✅'} |`);
    lines.push(`| 负载 | ${(l5.data.load_avg || []).join(' / ')} | - |`);
    lines.push(`| Node RSS | ${l5.data.node_rss_mb}MB | - |`);
    lines.push('');
  }

  if (l5.data.events_24h_count != null) {
    lines.push(`**事件(24h):** ${l5.data.events_24h_count} 条`);
    if (l5.data.event_type_dist) {
      const sorted = Object.entries(l5.data.event_type_dist).sort((a, b) => b[1] - a[1]);
      lines.push('Top事件类型:');
      for (const [t, c] of sorted.slice(0, 5)) {
        lines.push(`- \`${t}\`: ${c}`);
      }
    }
    lines.push('');
  }

  if (l5.data.feature_flags) {
    lines.push(`**FeatureFlags:** ${l5.data.flags_on} ON / ${l5.data.flags_off} OFF`);
    lines.push('');
  }

  // ─── Alerts Summary ───
  if (snapshot.all_alerts.length > 0) {
    lines.push('## 🚨 告警汇总\n');
    for (const a of snapshot.all_alerts) {
      const li = { L1: '🧠', L2: '⚖️', L3: '⚡', L4: '🎯', L5: '🏥' }[a.layer] || '📌';
      lines.push(`- ${alertIcon(a.level)} ${li} [${a.layer}] ${a.msg}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(`*Generated by autonomous-pipeline-monitor.js | Day2 Gap2 五层闭环监控*`);

  return lines.join('\n');
}

// ─── Feishu Card Generator ──────────────────────────────

function generateFeishuCard(snapshot, delta) {
  const score = snapshot.overall.composite_score;
  const scoreText = score != null ? `${score}/100` : 'N/A';
  const statusText = snapshot.overall.status.toUpperCase();
  const si = snapshot.overall.status_icon;
  const now = new Date(snapshot.generated_at);
  const timeStr = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  // Delta text
  let deltaLine = '';
  if (delta) {
    const parts = [];
    if (delta.score_change != null && delta.score_change !== 0) {
      parts.push(`评分 ${delta.score_change > 0 ? '📈+' : '📉'}${delta.score_change}`);
    }
    if (delta.alert_change !== 0) {
      parts.push(`告警 ${delta.alert_change > 0 ? '⬆️+' : '⬇️'}${delta.alert_change}`);
    }
    if (parts.length > 0) deltaLine = parts.join(' | ');
  }

  // Build card elements
  const elements = [];

  // Header summary
  let summaryText = `**${si} ${statusText}** | 评分: **${scoreText}**`;
  if (deltaLine) summaryText += ` | ${deltaLine}`;
  elements.push({ tag: 'markdown', content: summaryText });

  elements.push({ tag: 'hr' });

  // Layer status grid
  const layerLines = [];
  for (const [key, layer] of Object.entries(snapshot.layers)) {
    const name = { L1: '🧠意图', L2: '⚖️决策', L3: '⚡执行', L4: '🎯效果', L5: '🏥系统' }[key] || key;
    const li = statusIcon(layer.status);
    const alertN = layer.alerts.length;
    layerLines.push(`${li} **${name}** ${layer.status} ${alertN > 0 ? `⚠️${alertN}` : ''}`);
  }
  elements.push({ tag: 'markdown', content: layerLines.join('\n') });

  // Score breakdown
  if (snapshot.overall.score_breakdown && Object.keys(snapshot.overall.score_breakdown).length > 0) {
    elements.push({ tag: 'hr' });
    const bdLines = ['**评分分解:**'];
    for (const [dim, val] of Object.entries(snapshot.overall.score_breakdown)) {
      const di = val >= 80 ? '🟢' : val >= 60 ? '🟡' : '🔴';
      bdLines.push(`${di} ${dim}: ${val}`);
    }
    elements.push({ tag: 'markdown', content: bdLines.join('\n') });
  }

  // Key metrics
  elements.push({ tag: 'hr' });
  const metricsLines = ['**关键指标:**'];
  const l1 = snapshot.layers.L1.data;
  const l2 = snapshot.layers.L2.data;
  const l3 = snapshot.layers.L3.data;
  const l5 = snapshot.layers.L5.data;

  if (l1.requests_total != null) metricsLines.push(`🧠 意图: ${l1.requests_total}请求 | 命中率${l1.hit_rate}%`);
  if (l2.decisions_total != null) metricsLines.push(`⚖️ 决策: ${l2.decisions_total}条 | 置信度${l2.avg_confidence != null ? l2.avg_confidence.toFixed(2) : 'N/A'}`);
  if (l3.dispatch_total != null) metricsLines.push(`⚡ 分发: ${l3.dispatch_total}次 | 成功率${l3.dispatch_success_rate}%`);
  if (l5.mem_pct != null) metricsLines.push(`🏥 资源: 内存${l5.mem_pct}% | 磁盘${l5.disk_pct}%`);

  elements.push({ tag: 'markdown', content: metricsLines.join('\n') });

  // Alerts
  if (snapshot.all_alerts.length > 0) {
    elements.push({ tag: 'hr' });
    const alertLines = ['**🚨 告警:**'];
    for (const a of snapshot.all_alerts.slice(0, 8)) {
      alertLines.push(`${alertIcon(a.level)} [${a.layer}] ${a.msg}`);
    }
    if (snapshot.all_alerts.length > 8) {
      alertLines.push(`...共 ${snapshot.all_alerts.length} 条告警`);
    }
    elements.push({ tag: 'markdown', content: alertLines.join('\n') });
  }

  // Timestamp
  elements.push({
    tag: 'note',
    elements: [{ tag: 'plain_text', content: `${timeStr} | 窗口${snapshot.window_hours}h | autonomous-pipeline-monitor` }]
  });

  // Assemble card
  const headerColor = {
    healthy: 'green',
    warning: 'orange',
    critical: 'red',
    no_data: 'grey',
  }[snapshot.overall.status] || 'grey';

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: `${si} Agent运营仪表盘 — ${statusText}` },
      template: headerColor,
    },
    elements,
  };
}

// ─── Main ───────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const windowHours = args.includes('--1h') ? 1 : 24;

  // 1. Collect
  const collector = _loadCollector();
  const snapshot = collector.collectAll({ windowHours });

  // 2. Delta
  const previous = collector.loadLastSnapshot();
  const delta = computeDelta(snapshot, previous);

  // 3. Persist
  collector.persist(snapshot);

  // 4. Generate report
  const report = generateMarkdownReport(snapshot, delta);

  // Save report
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const dateTag = new Date().toISOString().slice(0, 10);
  const suffix = windowHours === 1 ? '-hourly' : '';
  const reportFile = path.join(REPORTS_DIR, `pipeline-dashboard-${dateTag}${suffix}.md`);
  fs.writeFileSync(reportFile, report);

  // 5. Output
  if (args.includes('--json')) {
    console.log(JSON.stringify({ snapshot, delta, reportFile }, null, 2));
  } else if (args.includes('--card')) {
    const card = generateFeishuCard(snapshot, delta);
    const cardFile = path.join(REPORTS_DIR, `pipeline-dashboard-card-${dateTag}${suffix}.json`);
    fs.writeFileSync(cardFile, JSON.stringify(card, null, 2));
    console.log(`✅ Card: ${cardFile}`);
    console.log(JSON.stringify(card));
  } else if (args.includes('--send')) {
    const receiveId = args[args.indexOf('--send') + 1];
    if (!receiveId) {
      console.error('Usage: --send <receiveId>');
      process.exit(1);
    }
    sendCardAsync(snapshot, delta, receiveId).then(r => {
      console.log(r.success ? `✅ Sent to ${receiveId}` : `❌ ${r.error}`);
    }).catch(e => console.error(e));
  } else {
    console.log(`✅ Report: ${reportFile}`);
    // Print compact status
    const icon = snapshot.overall.status_icon;
    console.log(`${icon} Status: ${snapshot.overall.status.toUpperCase()} | Score: ${snapshot.overall.composite_score ?? 'N/A'}/100 | Alerts: ${snapshot.all_alerts.length}`);
    for (const [key, layer] of Object.entries(snapshot.layers)) {
      console.log(`  ${statusIcon(layer.status)} ${key}: ${layer.status} (${layer.alerts.length} alerts)`);
    }
  }
}

async function sendCardAsync(snapshot, delta, receiveId) {
  try {
    const { sendCard } = require('../../skills/feishu-card-sender/index.js');
    const card = generateFeishuCard(snapshot, delta);
    return await sendCard({ receiveId, card });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  generateMarkdownReport,
  generateFeishuCard,
  computeDelta,
};
