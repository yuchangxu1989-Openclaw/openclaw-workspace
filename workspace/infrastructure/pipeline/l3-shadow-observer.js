'use strict';

/**
 * L3 Shadow Observer（旁路监听器）
 * 
 * 消费EventBus事件，运行L3 Pipeline的dry-run模式，
 * 记录L3"如果做了路由决策"会得到什么结果，与实际Dispatcher结果对比。
 * 
 * 运行方式：
 *   node l3-shadow-observer.js          # 单次执行（适合cron）
 *   node l3-shadow-observer.js --watch  # 持续监听（适合后台进程）
 * 
 * 环境变量：
 *   L3_SHADOW_MODE=false  禁用shadow观测
 *   L3_SHADOW_WINDOW_MS   观测窗口（默认5分钟）
 *   L3_SHADOW_LOG_DIR     日志目录
 * 
 * 输出：
 *   infrastructure/event-bus/data/l3-shadow-log.jsonl — 逐事件shadow结果
 *   infrastructure/event-bus/data/l3-shadow-summary.json — 最新摘要
 * 
 * @module infrastructure/pipeline/l3-shadow-observer
 */

const fs = require('fs');
const path = require('path');

// ─── 配置 ───
const ENABLED = process.env.L3_SHADOW_MODE !== 'false';
const WINDOW_MS = parseInt(process.env.L3_SHADOW_WINDOW_MS || '300000', 10); // 5min
const LOG_DIR = process.env.L3_SHADOW_LOG_DIR || 
  path.join(__dirname, '..', 'event-bus', 'data');
const SHADOW_LOG_FILE = path.join(LOG_DIR, 'l3-shadow-log.jsonl');
const SHADOW_SUMMARY_FILE = path.join(LOG_DIR, 'l3-shadow-summary.json');
const CURSOR_FILE = path.join(LOG_DIR, 'l3-shadow-cursor.json');

// Consumer ID for shadow mode (separate cursor from real L3 pipeline)
const CONSUMER_ID = 'l3-shadow-observer';

// ─── 依赖加载（容错） ───
let busAdapter = null;
let l3Pipeline = null;
let dispatcher = null;

try {
  busAdapter = require('../event-bus/bus-adapter');
} catch (e) {
  console.error(`[L3Shadow] Cannot load bus-adapter: ${e.message}`);
}

try {
  // 尝试加载L3 Pipeline的各个组件（不加载完整pipeline避免副作用）
  const { ISCRuleMatcher, getDefaultMatcher } = require('../rule-engine/isc-rule-matcher');
  const ruleMatcherInstance = getDefaultMatcher ? getDefaultMatcher() : null;
  l3Pipeline = { ruleMatcher: ruleMatcherInstance, ISCRuleMatcher };
} catch (e) {
  console.log(`[L3Shadow] RuleMatcher not available: ${e.message}`);
}

try {
  dispatcher = require('../dispatcher/dispatcher');
} catch (e) {
  console.log(`[L3Shadow] Dispatcher not available: ${e.message}`);
}

// ─── 工具函数 ───

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadCursor() {
  try {
    if (fs.existsSync(CURSOR_FILE)) {
      return JSON.parse(fs.readFileSync(CURSOR_FILE, 'utf8'));
    }
  } catch (_) {}
  return { lastTimestamp: 0, lastEventId: null };
}

function saveCursor(cursor) {
  try {
    fs.writeFileSync(CURSOR_FILE, JSON.stringify(cursor, null, 2));
  } catch (e) {
    console.error(`[L3Shadow] Cannot save cursor: ${e.message}`);
  }
}

function appendShadowLog(entry) {
  ensureDir(LOG_DIR);
  try {
    fs.appendFileSync(SHADOW_LOG_FILE, JSON.stringify(entry) + '\n');
  } catch (e) {
    console.error(`[L3Shadow] Cannot write shadow log: ${e.message}`);
  }
}

function writeSummary(summary) {
  ensureDir(LOG_DIR);
  try {
    fs.writeFileSync(SHADOW_SUMMARY_FILE, JSON.stringify(summary, null, 2));
  } catch (e) {
    console.error(`[L3Shadow] Cannot write summary: ${e.message}`);
  }
}

// ─── Shadow 分析逻辑 ───

/**
 * 对单个事件执行L3 shadow分析
 * @param {object} event - EventBus事件
 * @returns {object} shadow分析结果
 */
function shadowAnalyzeEvent(event) {
  const result = {
    event_id: event.id,
    event_type: event.type,
    event_source: event.source,
    event_timestamp: event.timestamp,
    analyzed_at: new Date().toISOString(),
    shadow_decisions: [],
  };

  // 1. RuleMatcher shadow：尝试匹配ISC规则
  if (l3Pipeline && l3Pipeline.ruleMatcher) {
    try {
      const matched = l3Pipeline.ruleMatcher.match 
        ? l3Pipeline.ruleMatcher.match(event)
        : null;
      result.shadow_decisions.push({
        component: 'RuleMatcher',
        matched: !!matched,
        rules: matched ? (Array.isArray(matched) ? matched.map(r => r.id || r) : [matched]) : [],
      });
    } catch (e) {
      result.shadow_decisions.push({
        component: 'RuleMatcher',
        error: e.message,
      });
    }
  }

  // 2. Dispatcher shadow：检查routes.json是否有匹配路由
  try {
    const routesFile = path.join(__dirname, '..', 'dispatcher', 'routes.json');
    if (fs.existsSync(routesFile)) {
      const routes = JSON.parse(fs.readFileSync(routesFile, 'utf8'));
      const matchedRoutes = [];
      
      for (const [pattern, config] of Object.entries(routes)) {
        if (matchEventType(event.type, pattern)) {
          matchedRoutes.push({
            pattern,
            handler: config.handler,
            priority: config.priority || 'normal',
          });
        }
      }
      
      result.shadow_decisions.push({
        component: 'Dispatcher',
        matched_routes: matchedRoutes,
        would_dispatch: matchedRoutes.length > 0,
      });
    }
  } catch (e) {
    result.shadow_decisions.push({
      component: 'Dispatcher',
      error: e.message,
    });
  }

  // 3. L3 分类：事件属于哪个层级
  result.l3_classification = classifyEvent(event);

  return result;
}

/**
 * 简单的事件类型通配符匹配
 */
function matchEventType(eventType, pattern) {
  if (pattern === '*') return true;
  if (pattern === eventType) return true;
  
  // 通配符匹配: isc.rule.* 匹配 isc.rule.created
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2);
    return eventType.startsWith(prefix + '.');
  }
  
  // 前缀通配符: *.failed 匹配 aeo.assessment.failed
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2);
    return eventType.endsWith('.' + suffix) || eventType === suffix;
  }
  
  return false;
}

/**
 * L3事件分类
 */
function classifyEvent(event) {
  const type = event.type || '';
  
  // Cron生命周期事件
  if (type.startsWith('cron.')) {
    return { layer: 'META', category: 'cron_lifecycle', migrateable: true };
  }
  
  // ISC规则事件
  if (type.startsWith('isc.rule.')) {
    return { layer: 'L1', category: 'isc_rule_change', migrateable: true };
  }
  
  // DTO事件
  if (type.startsWith('dto.')) {
    return { layer: 'L2', category: 'dto_orchestration', migrateable: true };
  }
  
  // SEEF事件
  if (type.startsWith('seef.')) {
    return { layer: 'L2', category: 'seef_skill_lifecycle', migrateable: true };
  }
  
  // AEO事件
  if (type.startsWith('aeo.')) {
    return { layer: 'L2', category: 'aeo_assessment', migrateable: true };
  }
  
  // CRAS事件
  if (type.startsWith('cras.')) {
    return { layer: 'L2', category: 'cras_insight', migrateable: true };
  }
  
  // 用户消息（L3入口）
  if (type.startsWith('user.message.')) {
    return { layer: 'L3', category: 'user_message', migrateable: false };
  }
  
  // 用户意图（L3原生）
  if (type.startsWith('user.intent.') || type.startsWith('user.sentiment.')) {
    return { layer: 'L3', category: 'user_intent', migrateable: false };
  }
  
  // 意图检测（L3原生）
  if (type.startsWith('intent.')) {
    return { layer: 'L3', category: 'intent_detection', migrateable: false };
  }
  
  // 会话事件（L3原生）
  if (type.startsWith('conversation.')) {
    return { layer: 'L3', category: 'conversation', migrateable: false };
  }
  
  // Heartbeat事件
  if (type.startsWith('heartbeat.')) {
    return { layer: 'META', category: 'heartbeat', migrateable: true };
  }
  
  // 系统事件
  if (type.startsWith('system.')) {
    return { layer: 'L1', category: 'system', migrateable: false };
  }
  
  // 测试事件
  if (type.startsWith('test.')) {
    return { layer: 'META', category: 'test', migrateable: false };
  }
  
  return { layer: 'UNKNOWN', category: 'unclassified', migrateable: false };
}

// ─── 主执行逻辑 ───

/**
 * 执行一轮shadow观测
 * @returns {object} 本轮观测摘要
 */
function runOnce() {
  if (!ENABLED) {
    console.log('[L3Shadow] Disabled via L3_SHADOW_MODE=false');
    return { skipped: true, reason: 'disabled' };
  }

  if (!busAdapter) {
    console.log('[L3Shadow] No bus adapter available');
    return { skipped: true, reason: 'no_bus_adapter' };
  }

  const cursor = loadCursor();
  const since = cursor.lastTimestamp || (Date.now() - WINDOW_MS);

  // 消费新事件
  let events = [];
  try {
    events = busAdapter.consume({
      since,
      limit: 500,
    });
  } catch (e) {
    // 降级：尝试使用legacy API
    try {
      events = busAdapter.legacy 
        ? busAdapter.legacy.consume(CONSUMER_ID, { limit: 100 })
        : [];
    } catch (_) {
      console.error(`[L3Shadow] Cannot consume events: ${e.message}`);
      return { skipped: true, reason: 'consume_failed', error: e.message };
    }
  }

  if (!events || events.length === 0) {
    console.log('[L3Shadow] No new events');
    return { events_consumed: 0, shadow_results: 0 };
  }

  console.log(`[L3Shadow] Processing ${events.length} events`);

  // Shadow分析每个事件
  const results = [];
  const stats = {
    total: events.length,
    by_layer: {},
    by_category: {},
    would_dispatch: 0,
    rule_matched: 0,
  };

  for (const event of events) {
    const shadowResult = shadowAnalyzeEvent(event);
    results.push(shadowResult);
    appendShadowLog(shadowResult);

    // 统计
    const cls = shadowResult.l3_classification;
    stats.by_layer[cls.layer] = (stats.by_layer[cls.layer] || 0) + 1;
    stats.by_category[cls.category] = (stats.by_category[cls.category] || 0) + 1;
    
    for (const dec of shadowResult.shadow_decisions) {
      if (dec.component === 'Dispatcher' && dec.would_dispatch) stats.would_dispatch++;
      if (dec.component === 'RuleMatcher' && dec.matched) stats.rule_matched++;
    }
  }

  // 更新cursor
  const lastEvent = events[events.length - 1];
  saveCursor({
    lastTimestamp: lastEvent.timestamp || Date.now(),
    lastEventId: lastEvent.id || null,
    updatedAt: new Date().toISOString(),
  });

  // 写摘要
  const summary = {
    run_at: new Date().toISOString(),
    window_ms: WINDOW_MS,
    stats,
    results_sample: results.slice(0, 5), // 最近5条样本
  };
  writeSummary(summary);

  console.log(`[L3Shadow] Processed ${events.length} events:`);
  console.log(`  By layer: ${JSON.stringify(stats.by_layer)}`);
  console.log(`  By category: ${JSON.stringify(stats.by_category)}`);
  console.log(`  Would dispatch: ${stats.would_dispatch}`);
  console.log(`  Rule matched: ${stats.rule_matched}`);

  return summary;
}

// ─── CLI 入口 ───
if (require.main === module) {
  const watchMode = process.argv.includes('--watch');
  
  if (watchMode) {
    console.log(`[L3Shadow] Watch mode, interval: ${WINDOW_MS}ms`);
    const run = () => {
      try { runOnce(); } catch (e) { console.error(`[L3Shadow] Error: ${e.message}`); }
    };
    run();
    setInterval(run, WINDOW_MS);
  } else {
    try {
      const result = runOnce();
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      console.error(`[L3Shadow] Fatal: ${e.message}`);
      process.exit(1);
    }
  }
}

module.exports = { runOnce, shadowAnalyzeEvent, classifyEvent, matchEventType };
