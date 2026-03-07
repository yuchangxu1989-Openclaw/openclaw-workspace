#!/usr/bin/env node
'use strict';

/**
 * Pipeline Dashboard Collector — 五层闭环数据采集器
 * 
 * Day2 Gap2 核心产物：从 "监控代码流水线" → "监控认知-决策-执行闭环"
 * 
 * 采集五层真实数据:
 *   L1 意图层 — intent-registry + intent-scanner 运行时指标
 *   L2 决策层 — decision-log + rule-matcher + 熔断器
 *   L3 执行层 — dispatcher + pipeline run-log + cron stats
 *   L4 效果层 — AEO评估 + 纠偏信号 + 能力覆盖
 *   L5 系统层 — 组件健康 + EventBus + 内存/磁盘
 * 
 * 输出: 结构化 JSON snapshot，供 dashboard 渲染和卡片生成使用
 * 
 * @module infrastructure/observability/pipeline-dashboard-collector
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const WORKSPACE = '/root/.openclaw/workspace';
const INFRA = path.join(WORKSPACE, 'infrastructure');
const OPENCLAW_ROOT = '/root/.openclaw';
const SNAPSHOT_FILE = path.join(INFRA, 'observability', '.dashboard-snapshot.json');
const HISTORY_FILE = path.join(INFRA, 'observability', '.dashboard-history.jsonl');

// ─── Helpers ─────────────────────────────────────────────

function readJsonl(fp, opts = {}) {
  if (!fs.existsSync(fp)) return [];
  try {
    const c = fs.readFileSync(fp, 'utf8').trim();
    if (!c) return [];
    let entries = c.split('\n').filter(Boolean).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
    if (opts.since) {
      const cutoff = typeof opts.since === 'number' ? opts.since : new Date(opts.since).getTime();
      entries = entries.filter(e => {
        const ts = e.timestamp
          ? (typeof e.timestamp === 'number' ? e.timestamp : new Date(e.timestamp).getTime())
          : (e.ts || 0);
        return ts >= cutoff;
      });
    }
    return entries;
  } catch { return []; }
}

function readJson(fp) {
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { return null; }
}

function run(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', timeout: 10000 }).trim(); }
  catch { return ''; }
}

function pct(n, d) { return d > 0 ? +(n / d * 100).toFixed(1) : 0; }

// ─── L1: Intent Layer ────────────────────────────────────

function collectL1Intent(since24h) {
  const result = {
    layer: 'L1_INTENT',
    status: 'unknown',
    data: {},
    alerts: [],
  };

  // 1. Runtime metrics
  let metrics = null;
  try { metrics = require('./metrics').getMetrics(); } catch {}

  if (metrics) {
    result.data.requests_total = metrics.intent_requests_total || 0;
    result.data.no_match_total = metrics.intent_no_match_total || 0;
    result.data.no_match_rate = +(metrics.intent_no_match_rate || 0).toFixed(1);
    result.data.hit_rate = result.data.requests_total > 0
      ? pct(result.data.requests_total - result.data.no_match_total, result.data.requests_total)
      : 0;
    result.data.latency_avg_ms = metrics.intent_latency_avg_ms || 0;
    result.data.latency_p95_ms = metrics.intent_latency_p95_ms || 0;
    result.data.hits_by_category = metrics.intent_hits_by_category || {};
  }

  // 2. Intent registry stats
  const registry = readJson(path.join(INFRA, 'intent-engine', 'intent-registry.json'));
  if (registry) {
    result.data.registered_intents = (registry.intents || []).length;
    result.data.categories = Object.keys(registry.categories || {});
    const activeIntents = (registry.intents || []).filter(i => i.status === 'active').length;
    result.data.active_intents = activeIntents;
  }

  // 3. Intent events from EventBus
  const events = readJsonl(path.join(INFRA, 'event-bus', 'events.jsonl'), { since: since24h });
  const intentEvents = events.filter(e => e.type && (
    e.type.includes('intent') || e.type === 'user.message.received'
  ));
  result.data.intent_events_24h = intentEvents.length;

  // Category distribution from events
  const catDist = {};
  for (const e of intentEvents) {
    const cat = e.payload?.category || e.type || 'unknown';
    catDist[cat] = (catDist[cat] || 0) + 1;
  }
  result.data.event_category_dist = catDist;

  // 4. Status determination
  if (!metrics || result.data.requests_total === 0) {
    result.status = 'no_data';
    result.alerts.push({ level: 'info', msg: '意图识别模块无运行时数据' });
  } else if (result.data.no_match_rate > 40) {
    result.status = 'warning';
    result.alerts.push({ level: 'warn', msg: `意图未识别率 ${result.data.no_match_rate}% 偏高` });
  } else {
    result.status = 'healthy';
  }

  return result;
}

// ─── L2: Decision Layer ──────────────────────────────────

function collectL2Decision(since24h) {
  const result = {
    layer: 'L2_DECISION',
    status: 'unknown',
    data: {},
    alerts: [],
  };

  // 1. Decision log
  let decLogger = null;
  try { decLogger = require('../decision-log/decision-logger'); } catch {}

  if (decLogger && typeof decLogger.summarize === 'function') {
    const summary = decLogger.summarize({ since: new Date(since24h).toISOString() });
    result.data.decisions_total = summary.total;
    result.data.avg_confidence = summary.avg_confidence;
    result.data.degradation_count = summary.degradation_count;
    result.data.by_phase = summary.by_phase || {};
    result.data.by_component = summary.by_component || {};
    result.data.by_method = summary.by_method || {};

    if (summary.degradation_count > 0 && summary.total > 0) {
      const degRate = pct(summary.degradation_count, summary.total);
      if (degRate > 30) {
        result.alerts.push({ level: 'critical', msg: `决策降级率 ${degRate}%，置信度<0.5` });
      } else if (degRate > 10) {
        result.alerts.push({ level: 'warn', msg: `决策降级率 ${degRate}%` });
      }
    }
  }

  // 2. Rule matching metrics
  let metrics = null;
  try { metrics = require('./metrics').getMetrics(); } catch {}

  if (metrics) {
    result.data.rules_evaluated = metrics.rules_evaluated_total || 0;
    result.data.rules_matched = metrics.rules_matched_total || 0;
    result.data.rules_no_match = metrics.rules_no_match_total || 0;
    result.data.rules_match_rate = +(metrics.rules_match_rate || 0).toFixed(1);

    if (metrics.rules_no_match_total > 0 && metrics.rules_evaluated_total > 0) {
      const nmRate = pct(metrics.rules_no_match_total, metrics.rules_evaluated_total);
      if (nmRate > 50) {
        result.alerts.push({ level: 'warn', msg: `规则未覆盖率 ${nmRate}%，存在裸奔场景` });
      }
    }
  }

  // 3. Circuit breaker
  if (metrics) {
    result.data.breaker_trips = metrics.pipeline_breaker_trips || 0;
    if (result.data.breaker_trips > 0) {
      result.alerts.push({ level: 'warn', msg: `熔断器触发 ${result.data.breaker_trips} 次` });
    }
  }

  // 4. Status
  const hasData = (result.data.decisions_total || 0) > 0 || (result.data.rules_evaluated || 0) > 0;
  if (!hasData) {
    result.status = 'no_data';
  } else if (result.alerts.some(a => a.level === 'critical')) {
    result.status = 'critical';
  } else if (result.alerts.some(a => a.level === 'warn')) {
    result.status = 'warning';
  } else {
    result.status = 'healthy';
  }

  return result;
}

// ─── L3: Execution Layer ─────────────────────────────────

function collectL3Execution(since24h) {
  const result = {
    layer: 'L3_EXECUTION',
    status: 'unknown',
    data: {},
    alerts: [],
  };

  // 1. Dispatch metrics
  let metrics = null;
  try { metrics = require('./metrics').getMetrics(); } catch {}

  if (metrics) {
    result.data.dispatch_total = metrics.dispatch_total || 0;
    result.data.dispatch_success = metrics.dispatch_success || 0;
    result.data.dispatch_failed = metrics.dispatch_failed || 0;
    result.data.dispatch_timeout = metrics.dispatch_timeout || 0;
    result.data.dispatch_retry = metrics.dispatch_retry || 0;
    result.data.dispatch_success_rate = metrics.dispatch_total > 0
      ? pct(metrics.dispatch_success, metrics.dispatch_total) : 0;
    result.data.dispatch_latency_avg = metrics.dispatch_latency_avg_ms || 0;
    result.data.dispatch_latency_p95 = metrics.dispatch_latency_p95_ms || 0;
    result.data.pipeline_latency_avg = metrics.pipeline_avg_latency_ms || 0;
    result.data.pipeline_latency_p95 = metrics.pipeline_p95_latency_ms || 0;

    if (metrics.dispatch_timeout > 0) {
      result.alerts.push({ level: 'warn', msg: `分发超时 ${metrics.dispatch_timeout} 次` });
    }
    if ((metrics.dispatch_failed || 0) > 0) {
      result.alerts.push({ level: 'critical', msg: `分发失败 ${metrics.dispatch_failed} 次` });
    }
  }

  // 2. Pipeline runs
  const pipelineRuns = readJsonl(path.join(INFRA, 'pipeline', 'run-log.jsonl'));
  result.data.pipeline_total_runs = pipelineRuns.length;
  if (pipelineRuns.length > 0) {
    const last = pipelineRuns[pipelineRuns.length - 1];
    result.data.last_run = {
      id: last.run_id,
      timestamp: last.timestamp,
      events: last.consumed_events,
      rules: last.matched_rules,
      intents: last.intents_detected,
      dispatched: last.dispatched_actions,
      errors: (last.errors || []).length,
      duration_ms: last.duration_ms,
    };

    // Recent error rate
    const recentRuns = pipelineRuns.slice(-20);
    const errorRuns = recentRuns.filter(r => (r.errors || []).length > 0);
    result.data.recent_error_rate = pct(errorRuns.length, recentRuns.length);
  }

  // 3. Cron stats (from OpenClaw cron system)
  const cronRunsDir = path.join(OPENCLAW_ROOT, 'cron', 'runs');
  try {
    if (fs.existsSync(cronRunsDir)) {
      const files = fs.readdirSync(cronRunsDir).filter(f => f.endsWith('.jsonl'));
      let totalOk = 0, totalFail = 0, totalSkip = 0;
      const problemJobs = [];

      for (const fname of files) {
        const recs = readJsonl(path.join(cronRunsDir, fname), { since: since24h });
        let ok = 0, fail = 0, skip = 0;
        for (const r of recs) {
          if (r.status === 'ok') ok++;
          else if (r.status === 'error') fail++;
          else if (r.status === 'skipped') skip++;
        }
        totalOk += ok; totalFail += fail; totalSkip += skip;
        if (fail > 0) {
          problemJobs.push({ job: fname.replace('.jsonl', ''), fails: fail });
        }
      }

      result.data.cron_24h = { ok: totalOk, fail: totalFail, skip: totalSkip };
      result.data.cron_problems = problemJobs;

      if (totalFail > 0) {
        result.alerts.push({
          level: 'warn',
          msg: `Cron任务24h失败 ${totalFail} 次: ${problemJobs.map(j => j.job).join(', ')}`
        });
      }
    }
  } catch {}

  // Status
  if (result.alerts.some(a => a.level === 'critical')) {
    result.status = 'critical';
  } else if (result.alerts.some(a => a.level === 'warn')) {
    result.status = 'warning';
  } else if ((result.data.dispatch_total || 0) === 0 && pipelineRuns.length === 0) {
    result.status = 'no_data';
  } else {
    result.status = 'healthy';
  }

  return result;
}

// ─── L4: Effect Layer (AEO) ─────────────────────────────

function collectL4Effect(since24h) {
  const result = {
    layer: 'L4_EFFECT',
    status: 'unknown',
    data: {},
    alerts: [],
  };

  // 1. AEO assessments
  const aeoIndex = readJson(path.join(WORKSPACE, 'skills', 'aeo', 'store', 'index.json'));
  if (aeoIndex && aeoIndex.assessments) {
    const recent = aeoIndex.assessments.filter(a => {
      const ts = new Date(a.stored_at).getTime();
      return ts >= since24h;
    });
    result.data.aeo_total_assessments = aeoIndex.assessments.length;
    result.data.aeo_recent_assessments = recent.length;

    // Average scores
    const scored = aeoIndex.assessments.filter(a => typeof a.score === 'number');
    if (scored.length > 0) {
      result.data.aeo_avg_score = +(scored.reduce((s, a) => s + a.score, 0) / scored.length).toFixed(2);
      result.data.aeo_pass_rate = pct(scored.filter(a => a.passed).length, scored.length);
    }

    // By track
    const byTrack = {};
    for (const a of aeoIndex.assessments) {
      const track = a.track || 'unknown';
      if (!byTrack[track]) byTrack[track] = { count: 0, scores: [] };
      byTrack[track].count++;
      if (typeof a.score === 'number') byTrack[track].scores.push(a.score);
    }
    result.data.aeo_by_track = {};
    for (const [t, d] of Object.entries(byTrack)) {
      result.data.aeo_by_track[t] = {
        count: d.count,
        avg_score: d.scores.length > 0 ? +(d.scores.reduce((a, b) => a + b, 0) / d.scores.length).toFixed(2) : null
      };
    }
  }

  // 2. AEO evaluation sets coverage
  const evalSetsDir = path.join(WORKSPACE, 'skills', 'aeo', 'evaluation-sets');
  try {
    if (fs.existsSync(evalSetsDir)) {
      const sets = fs.readdirSync(evalSetsDir).filter(d => {
        return fs.statSync(path.join(evalSetsDir, d)).isDirectory();
      });
      result.data.eval_sets_count = sets.length;
    }
  } catch {}

  // 3. Correction/feedback signals from events
  const events = readJsonl(path.join(INFRA, 'event-bus', 'events.jsonl'), { since: since24h });
  const correctionEvents = events.filter(e => e.type && (
    e.type.includes('correction') || e.type.includes('feedback') ||
    e.type.includes('rework') || e.type.includes('steer')
  ));
  result.data.correction_events_24h = correctionEvents.length;

  // 4. Composite quality score
  let metrics = null;
  try { metrics = require('./metrics').getMetrics(); } catch {}

  const scores = {};
  if (metrics) {
    if (metrics.intent_requests_total > 0) {
      scores.intent_hit = Math.round((1 - (metrics.intent_no_match_rate || 0) / 100) * 100);
    }
    if (metrics.dispatch_total > 0) {
      scores.dispatch_success = Math.round(metrics.dispatch_success / metrics.dispatch_total * 100);
    }
    scores.breaker_safety = (metrics.pipeline_breaker_trips || 0) === 0 ? 100
      : Math.max(0, 100 - (metrics.pipeline_breaker_trips || 0) * 20);
  }
  if (result.data.aeo_avg_score) {
    scores.aeo_quality = Math.round(result.data.aeo_avg_score * 100);
  }

  if (Object.keys(scores).length > 0) {
    const vals = Object.values(scores);
    result.data.composite_score = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    result.data.score_breakdown = scores;
  }

  // Status
  if ((result.data.composite_score || 0) >= 80) {
    result.status = 'healthy';
  } else if ((result.data.composite_score || 0) >= 60) {
    result.status = 'warning';
  } else if (result.data.composite_score) {
    result.status = 'critical';
  } else {
    result.status = 'no_data';
  }

  return result;
}

// ─── L5: System Health ──────────────────────────────────

function collectL5System(since24h) {
  const result = {
    layer: 'L5_SYSTEM',
    status: 'unknown',
    data: {},
    alerts: [],
  };

  // 1. L3 Component health
  try {
    const health = require('./health');
    const check = health.checkHealth();
    result.data.component_health = check.status;
    result.data.components = {};
    for (const [name, c] of Object.entries(check.components)) {
      result.data.components[name] = {
        status: c.status,
        error: c.details?.error || null,
        warning: c.details?.warning || null,
      };
      if (c.status === 'down') {
        result.alerts.push({ level: 'critical', msg: `组件 ${name} 宕机` });
      } else if (c.status === 'degraded') {
        result.alerts.push({ level: 'warn', msg: `组件 ${name} 降级: ${c.details?.warning || ''}` });
      }
    }
  } catch (e) {
    result.data.component_health = 'unknown';
    result.alerts.push({ level: 'warn', msg: `健康检查失败: ${e.message}` });
  }

  // 2. EventBus stats
  let metrics = null;
  try { metrics = require('./metrics').getMetrics(); } catch {}
  if (metrics) {
    const emitted = metrics.events_emitted_total || 0;
    const processed = metrics.events_processed_total || 0;
    const dropped = metrics.events_dropped_total || 0;
    result.data.eventbus = { emitted, processed, dropped, backlog: Math.max(0, emitted - processed - dropped) };
    result.data.uptime = metrics.uptime_human || 'N/A';

    if (dropped > 0) {
      result.alerts.push({ level: 'warn', msg: `EventBus 丢弃 ${dropped} 事件` });
    }
  }

  // 3. Events file stats
  const eventsFile = path.join(INFRA, 'event-bus', 'events.jsonl');
  if (fs.existsSync(eventsFile)) {
    const stat = fs.statSync(eventsFile);
    result.data.events_file_size = stat.size;
    result.data.events_file_size_mb = +(stat.size / 1048576).toFixed(2);
    if (stat.size > 10 * 1048576) {
      result.alerts.push({ level: 'warn', msg: `events.jsonl 超过 10MB (${result.data.events_file_size_mb}MB)` });
    }
  }

  // 4. Event type distribution (24h)
  const events24h = readJsonl(path.join(INFRA, 'event-bus', 'events.jsonl'), { since: since24h });
  result.data.events_24h_count = events24h.length;
  const typeDist = {};
  const sourceDist = {};
  for (const e of events24h) {
    typeDist[e.type || '?'] = (typeDist[e.type || '?'] || 0) + 1;
    sourceDist[e.source || '?'] = (sourceDist[e.source || '?'] || 0) + 1;
  }
  result.data.event_type_dist = typeDist;
  result.data.event_source_dist = sourceDist;

  // 5. System resources
  try {
    const memMatch = run('free -m').match(/Mem:\s+(\d+)\s+(\d+)/);
    const diskMatch = run('df -h /').match(/(\d+)%/);

    if (memMatch) {
      const total = parseInt(memMatch[1]), used = parseInt(memMatch[2]);
      result.data.mem_total_mb = total;
      result.data.mem_used_mb = used;
      result.data.mem_pct = Math.round(used / total * 100);
      if (result.data.mem_pct > 85) {
        result.alerts.push({ level: 'critical', msg: `内存使用率 ${result.data.mem_pct}%` });
      } else if (result.data.mem_pct > 70) {
        result.alerts.push({ level: 'warn', msg: `内存使用率 ${result.data.mem_pct}%` });
      }
    }
    if (diskMatch) {
      result.data.disk_pct = parseInt(diskMatch[1]);
      if (result.data.disk_pct > 90) {
        result.alerts.push({ level: 'critical', msg: `磁盘使用率 ${result.data.disk_pct}%` });
      } else if (result.data.disk_pct > 75) {
        result.alerts.push({ level: 'warn', msg: `磁盘使用率 ${result.data.disk_pct}%` });
      }
    }
  } catch {}

  // 6. Feature flags
  const flags = readJson(path.join(INFRA, 'feature-flags', 'flags.json'));
  if (flags) {
    const entries = Object.entries(flags).filter(([, v]) => typeof v === 'boolean');
    result.data.feature_flags = {};
    for (const [k, v] of entries) result.data.feature_flags[k] = v;
    result.data.flags_on = entries.filter(([, v]) => v).length;
    result.data.flags_off = entries.filter(([, v]) => !v).length;
  }

  // 7. Process health
  const mem = process.memoryUsage();
  result.data.node_rss_mb = +(mem.rss / 1048576).toFixed(1);
  result.data.node_heap_mb = +(mem.heapUsed / 1048576).toFixed(1);
  result.data.load_avg = os.loadavg().map(v => +v.toFixed(2));

  // Status
  if (result.alerts.some(a => a.level === 'critical')) {
    result.status = 'critical';
  } else if (result.alerts.some(a => a.level === 'warn')) {
    result.status = 'warning';
  } else {
    result.status = 'healthy';
  }

  return result;
}

// ─── Aggregate ───────────────────────────────────────────

/**
 * Collect full 5-layer dashboard snapshot.
 * @param {object} [opts]
 * @param {number} [opts.windowHours=24] - Time window in hours
 * @returns {object} Full dashboard snapshot
 */
function collectAll(opts = {}) {
  const windowMs = (opts.windowHours || 24) * 3600 * 1000;
  const since = Date.now() - windowMs;
  const now = new Date();

  const snapshot = {
    schema: 'pipeline-dashboard-v1',
    generated_at: now.toISOString(),
    window_hours: opts.windowHours || 24,
    layers: {
      L1: collectL1Intent(since),
      L2: collectL2Decision(since),
      L3: collectL3Execution(since),
      L4: collectL4Effect(since),
      L5: collectL5System(since),
    },
    overall: {},
    all_alerts: [],
  };

  // Overall status
  const layerStatuses = Object.values(snapshot.layers).map(l => l.status);
  if (layerStatuses.includes('critical')) {
    snapshot.overall.status = 'critical';
  } else if (layerStatuses.includes('warning')) {
    snapshot.overall.status = 'warning';
  } else if (layerStatuses.every(s => s === 'no_data')) {
    snapshot.overall.status = 'no_data';
  } else {
    snapshot.overall.status = 'healthy';
  }

  // Aggregate alerts
  for (const [key, layer] of Object.entries(snapshot.layers)) {
    for (const alert of layer.alerts) {
      snapshot.all_alerts.push({ ...alert, layer: key });
    }
  }

  // Overall score
  const l4 = snapshot.layers.L4;
  snapshot.overall.composite_score = l4.data.composite_score || null;
  snapshot.overall.score_breakdown = l4.data.score_breakdown || {};

  // Status icon map
  snapshot.overall.status_icon = {
    healthy: '🟢',
    warning: '🟡',
    critical: '🔴',
    no_data: '⚪',
    unknown: '⚪',
  }[snapshot.overall.status] || '⚪';

  return snapshot;
}

/**
 * Persist snapshot to disk and append to history.
 */
function persist(snapshot) {
  // Current snapshot
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2));

  // History (compact)
  const compact = {
    ts: Date.now(),
    status: snapshot.overall.status,
    score: snapshot.overall.composite_score,
    alerts: snapshot.all_alerts.length,
    l1: snapshot.layers.L1.status,
    l2: snapshot.layers.L2.status,
    l3: snapshot.layers.L3.status,
    l4: snapshot.layers.L4.status,
    l5: snapshot.layers.L5.status,
  };
  fs.appendFileSync(HISTORY_FILE, JSON.stringify(compact) + '\n');

  // Rotate history (keep last 500 entries)
  try {
    const lines = fs.readFileSync(HISTORY_FILE, 'utf8').trim().split('\n');
    if (lines.length > 500) {
      fs.writeFileSync(HISTORY_FILE, lines.slice(-500).join('\n') + '\n');
    }
  } catch {}
}

/**
 * Load the last persisted snapshot.
 */
function loadLastSnapshot() {
  return readJson(SNAPSHOT_FILE);
}

/**
 * Load history entries.
 */
function loadHistory(limit = 50) {
  const lines = readJsonl(HISTORY_FILE);
  return lines.slice(-limit);
}

// ─── CLI ─────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const snapshot = collectAll({ windowHours: args.includes('--1h') ? 1 : 24 });
  persist(snapshot);

  if (args.includes('--json')) {
    console.log(JSON.stringify(snapshot, null, 2));
  } else {
    const icon = snapshot.overall.status_icon;
    console.log(`${icon} Dashboard: ${snapshot.overall.status.toUpperCase()}`);
    console.log(`  Score: ${snapshot.overall.composite_score ?? 'N/A'}/100`);
    console.log(`  Alerts: ${snapshot.all_alerts.length}`);
    for (const [key, layer] of Object.entries(snapshot.layers)) {
      const li = { healthy: '✅', warning: '⚠️', critical: '🔴', no_data: '⚪', unknown: '⚪' }[layer.status] || '⚪';
      console.log(`  ${li} ${key}: ${layer.status}`);
    }
    if (snapshot.all_alerts.length > 0) {
      console.log('\n  Alerts:');
      for (const a of snapshot.all_alerts) {
        const ai = { critical: '🔴', warn: '🟡', info: 'ℹ️' }[a.level] || '📌';
        console.log(`    ${ai} [${a.layer}] ${a.msg}`);
      }
    }
  }
}

module.exports = { collectAll, persist, loadLastSnapshot, loadHistory };