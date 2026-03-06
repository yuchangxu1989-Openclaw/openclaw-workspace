'use strict';

/**
 * 阈值扫描器 - 检查系统指标，emit L2阈值事件
 *
 * 触发方式：cron every 10 minutes
 */

const fs = require('fs');
const path = require('path');
const bus = require('../bus-adapter');

const STATE_FILE = path.join(__dirname, '.threshold-state.json');
const CONFIG_FILE = path.join(__dirname, '../config/threshold-config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error(`threshold config not found: ${CONFIG_FILE}`);
  }
  const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed.thresholds) ? parsed.thresholds : [];
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function evaluate(value, operator, threshold) {
  switch (operator) {
    case 'gt': return value > threshold;
    case 'gte': return value >= threshold;
    case 'lt': return value < threshold;
    case 'lte': return value <= threshold;
    case 'eq': return value === threshold;
    default: throw new Error(`unsupported operator: ${operator}`);
  }
}

function measureYellowLightRatio() {
  const rulesDir = path.resolve(__dirname, '../../../skills/isc-core/rules');
  if (!fs.existsSync(rulesDir)) return { value: 0, context: { total: 0, yellowLight: 0 } };

  const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.json'));
  let total = 0;
  let yellowLight = 0;

  for (const file of files) {
    total += 1;
    try {
      const rule = JSON.parse(fs.readFileSync(path.join(rulesDir, file), 'utf8'));
      const handlerName = rule?.action?.handler;
      if (handlerName) {
        const handlerPath = path.resolve(__dirname, '../handlers', `${handlerName}.js`);
        if (!fs.existsSync(handlerPath)) yellowLight += 1;
      }
    } catch (_) {
      yellowLight += 1;
    }
  }

  return { value: total > 0 ? yellowLight / total : 0, context: { total, yellowLight } };
}

function measureEventBusSize() {
  const eventsFile = path.resolve(__dirname, '../events.jsonl');
  if (!fs.existsSync(eventsFile)) return { value: 0, context: { file: eventsFile, exists: false } };
  const stat = fs.statSync(eventsFile);
  return { value: stat.size, context: { file: eventsFile, exists: true } };
}

function measureHandlerFailureRate() {
  const logFile = path.resolve(__dirname, '../../logs/dispatcher-actions.jsonl');
  if (!fs.existsSync(logFile)) return { value: 0, context: { total: 0, failed: 0 } };

  const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
  const recent = lines.slice(-100);
  let total = 0;
  let failed = 0;

  for (const line of recent) {
    try {
      const record = JSON.parse(line);
      total += 1;
      if (record.status === 'failed') failed += 1;
    } catch (_) {
      // ignore malformed line
    }
  }

  return { value: total > 0 ? failed / total : 0, context: { total, failed } };
}

function measureUnconsumedBacklog() {
  const stats = bus.stats();
  const cursorFile = path.resolve(__dirname, '../cursor.json');
  let maxOffset = 0;

  if (fs.existsSync(cursorFile)) {
    try {
      const cursors = JSON.parse(fs.readFileSync(cursorFile, 'utf8'));
      maxOffset = Math.max(0, ...Object.values(cursors || {}).map(c => Number(c.offset || 0)));
    } catch (_) {
      maxOffset = 0;
    }
  }

  const totalEvents = Number(stats.totalEvents || 0);
  return { value: Math.max(0, totalEvents - maxOffset), context: { totalEvents, maxOffset } };
}

function measureRuleCodePairingRate() {
  const rulesDir = path.resolve(__dirname, '../../../skills/isc-core/rules');
  const handlersDir = path.resolve(__dirname, '../handlers');
  if (!fs.existsSync(rulesDir)) return { value: 1, context: { total: 0, withHandler: 0 } };

  const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.json'));
  const total = files.length;
  let withHandler = 0;

  for (const file of files) {
    try {
      const rule = JSON.parse(fs.readFileSync(path.join(rulesDir, file), 'utf8'));
      const handler = rule?.action?.handler;
      if (handler && fs.existsSync(path.join(handlersDir, `${handler}.js`))) {
        withHandler += 1;
      }
    } catch (_) {
      // ignore malformed rule
    }
  }

  return { value: total > 0 ? withHandler / total : 1, context: { total, withHandler } };
}

const MEASURES = {
  yellow_light_ratio: measureYellowLightRatio,
  event_bus_size: measureEventBusSize,
  handler_failure_rate: measureHandlerFailureRate,
  unconsumed_backlog: measureUnconsumedBacklog,
  rule_code_pairing_rate: measureRuleCodePairingRate,
};

function scan() {
  const defs = loadConfig();
  const state = loadState();
  const now = Date.now();
  const results = [];

  for (const def of defs) {
    try {
      const measureFn = MEASURES[def.measure];
      if (typeof measureFn !== 'function') {
        results.push({ id: def.id, status: 'error', error: `unknown measure: ${def.measure}` });
        continue;
      }

      const measurement = measureFn();
      const crossed = evaluate(Number(measurement.value || 0), def.operator, Number(def.threshold));

      if (crossed) {
        const lastTriggered = Number(state[def.id]?.lastTriggered || 0);
        if (now - lastTriggered > Number(def.cooldownMs || 0)) {
          bus.emit(def.eventType, {
            metric: def.metric,
            value: measurement.value,
            threshold: def.threshold,
            operator: def.operator,
            context: measurement.context,
          }, 'threshold-scanner');

          state[def.id] = { lastTriggered: now, value: measurement.value };
          results.push({ id: def.id, status: 'triggered', value: measurement.value });
        } else {
          results.push({ id: def.id, status: 'cooldown', value: measurement.value });
        }
      } else {
        if (state[def.id]) delete state[def.id];
        results.push({ id: def.id, status: 'ok', value: measurement.value });
      }
    } catch (err) {
      results.push({ id: def.id, status: 'error', error: err.message });
    }
  }

  saveState(state);
  return {
    scanned: defs.length,
    triggered: results.filter(r => r.status === 'triggered').length,
    details: results,
  };
}

if (require.main === module) {
  const summary = scan();
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  scan,
  evaluate,
  loadConfig,
  MEASURES,
};
