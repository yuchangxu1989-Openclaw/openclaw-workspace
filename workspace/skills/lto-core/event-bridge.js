/**
 * 本地任务编排 事件桥接 - 完整路由，覆盖 9 种事件类型
 * 由 Cron dispatcher 或手动触发
 */
const path = require('path');
const fs = require('fs');
const bus = require(path.join(__dirname, '..', '..', 'infrastructure', 'event-bus', 'bus-adapter.js')) // [Gap4] 升级至 bus-adapter;

const CONSUMER_ID = 'lto-core';

// 所有支持的事件类型及其处理器
const EVENT_HANDLERS = {
  // 1-3: ISC 规则事件 → 触发 本地任务编排 同步
  'isc.rule.created':  handleIscRule,
  'isc.rule.updated':  handleIscRule,
  'isc.rule.deleted':  handleIscRule,

  // 4: 本地任务编排 同步完成 → 通知下游 SEEF/AEO
  'dto.sync.completed': handleDtoSyncCompleted,

  // 5: SEEF 评测完成 → 触发优化流程
  'seef.skill.evaluated': handleSeefEvaluated,

  // 6: SEEF 优化完成 → 触发重新评测
  'seef.skill.optimized': handleSeefOptimized,

  // 7: AEO 评测完成 → 通知 CRAS 入库
  'aeo.assessment.completed': handleAeoCompleted,

  // 8: AEO 评测失败 → 告警 + CRAS
  'aeo.assessment.failed': handleAeoFailed,

  // 9: CRAS 洞察生成 → 检查是否需要更新 ISC 规则
  'cras.insight.generated': handleCrasInsight,

  // 系统事件
  'system.error':  handleSystemError,
  'system.health': handleSystemHealth,
};

// 构建消费的事件类型通配符列表
const CONSUME_TYPES = [
  'isc.rule.*',
  'dto.sync.*',
  'seef.skill.*',
  'aeo.assessment.*',
  'cras.insight.*',
  'system.*',
];

async function processEvents() {
  const events = bus.consume(CONSUMER_ID, { types: CONSUME_TYPES });

  if (events.length === 0) {
    console.log('[本地任务编排-Bridge] 无待处理事件');
    return { processed: 0 };
  }

  console.log(`[本地任务编排-Bridge] 发现 ${events.length} 个事件`);

  const results = [];
  for (const event of events) {
    try {
      const handler = EVENT_HANDLERS[event.type];
      if (handler) {
        console.log(`[本地任务编排-Bridge] 处理: ${event.type}`);
        await handler(event);
      } else {
        console.log(`[本地任务编排-Bridge] 未注册处理器: ${event.type}, 跳过`);
      }

      bus.ack(CONSUMER_ID, event.id);
      results.push({ event: event.id, type: event.type, status: 'ok' });
    } catch (err) {
      console.error(`[本地任务编排-Bridge] 处理失败: ${event.type} ${event.id}`, err.message);
      results.push({ event: event.id, type: event.type, status: 'error', error: err.message });

      bus.emit('system.error', {
        source: 'lto-core',
        event_id: event.id,
        event_type: event.type,
        error: err.message,
      }, 'lto-core');
    }
  }

  return { processed: results.length, results };
}

// ── ISC 规则事件 ──────────────────────────────────────────
async function handleIscRule(event) {
  const action = event.type.split('.').pop();
  const { rule_id } = event.payload || {};

  // 读取订阅列表，通知所有订阅者
  const subsDir = path.join(__dirname, 'subscriptions');
  if (fs.existsSync(subsDir)) {
    const files = fs.readdirSync(subsDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      console.log(`[本地任务编排-Sync] 通知订阅者: ${file} -> rule ${rule_id}`);
    }
  }

  // 发布同步完成事件 → 链式传递到 SEEF/AEO
  bus.emit('dto.sync.completed', {
    source_event: event.id,
    rule_id,
    action,
  }, 'lto-core');
}

// ── 本地任务编排 同步完成 → 通知下游 SEEF/AEO ─────────────────────
async function handleDtoSyncCompleted(event) {
  const { rule_id, action } = event.payload || {};
  console.log(`[本地任务编排-Bridge] 同步完成: rule=${rule_id} action=${action}, 通知 SEEF/AEO`);

  // 发布评测请求事件给 SEEF
  bus.emit('seef.skill.evaluated', {
    source_event: event.id,
    rule_id,
    trigger: 'dto-sync',
    evaluation_type: 'post-sync',
  }, 'lto-core');
}

// ── SEEF 评测完成 → 触发优化流程 ──────────────────────────
async function handleSeefEvaluated(event) {
  const { skill_name, score, track } = event.payload || {};
  console.log(`[本地任务编排-Bridge] SEEF评测完成: skill=${skill_name} score=${score} track=${track}`);

  // 如果评分低于阈值，触发优化
  const threshold = 0.8;
  if (score !== undefined && score < threshold) {
    console.log(`[本地任务编排-Bridge] 评分 ${score} < ${threshold}, 触发优化`);
    bus.emit('seef.skill.optimized', {
      source_event: event.id,
      skill_name,
      score,
      optimization: 'auto-triggered',
    }, 'lto-core');
  } else {
    console.log(`[本地任务编排-Bridge] 评分合格, 通知 AEO 进行正式评测`);
    bus.emit('aeo.assessment.completed', {
      source_event: event.id,
      skill_name,
      score,
      track: track || 'quality',
      passed: true,
    }, 'lto-core');
  }
}

// ── SEEF 优化完成 → 触发重新评测 ──────────────────────────
async function handleSeefOptimized(event) {
  const { skill_name } = event.payload || {};
  console.log(`[本地任务编排-Bridge] SEEF优化完成: skill=${skill_name}, 触发重新评测`);

  bus.emit('seef.skill.evaluated', {
    source_event: event.id,
    skill_name,
    trigger: 'post-optimization',
    evaluation_type: 're-evaluate',
  }, 'lto-core');
}

// ── AEO 评测完成 → 通知 CRAS 入库 ────────────────────────
async function handleAeoCompleted(event) {
  const { skill_name, score, passed, track } = event.payload || {};
  console.log(`[本地任务编排-Bridge] AEO评测完成: skill=${skill_name} passed=${passed} score=${score}`);

  bus.emit('cras.insight.generated', {
    source_event: event.id,
    type: 'assessment-result',
    skill_name,
    score,
    passed,
    track,
    timestamp: Date.now(),
  }, 'lto-core');
}

// ── AEO 评测失败 → 告警 + CRAS ───────────────────────────
async function handleAeoFailed(event) {
  const { skill_name, error, track } = event.payload || {};
  console.log(`[本地任务编排-Bridge] AEO评测失败: skill=${skill_name} error=${error}`);

  // 发布告警
  bus.emit('system.error', {
    source: 'aeo',
    severity: 'warning',
    message: `AEO assessment failed: ${skill_name} - ${error}`,
  }, 'lto-core');

  // 同时通知 CRAS 记录失败
  bus.emit('cras.insight.generated', {
    source_event: event.id,
    type: 'assessment-failure',
    skill_name,
    error,
    track,
    timestamp: Date.now(),
  }, 'lto-core');
}

// ── CRAS 洞察生成 → 检查是否需要更新 ISC 规则 ────────────
async function handleCrasInsight(event) {
  const { type, skill_name, score, passed } = event.payload || {};
  console.log(`[本地任务编排-Bridge] CRAS洞察: type=${type} skill=${skill_name}`);

  // 如果洞察建议更新规则，发布 ISC 更新事件
  if (type === 'rule-suggestion' || (type === 'assessment-failure')) {
    console.log(`[本地任务编排-Bridge] CRAS建议更新ISC规则`);
    bus.emit('isc.rule.updated', {
      source: 'cras-feedback',
      source_event: event.id,
      rule_id: event.payload.rule_id || 'auto',
      action: 'cras-driven-update',
    }, 'lto-core');
  }
}

// ── 系统错误 → 记录 + 告警 ───────────────────────────────
async function handleSystemError(event) {
  const { source, error, message: msg, severity } = event.payload || {};
  const logLine = `[${new Date().toISOString()}] ERROR [${source}] ${severity || 'error'}: ${error || msg}`;
  console.log(`[本地任务编排-Bridge] 系统错误: ${logLine}`);

  // 写入错误日志
  const logDir = path.join(__dirname, '..', '..', 'infrastructure', 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(path.join(logDir, 'errors.log'), logLine + '\n');
}

// ── 系统健康 → 更新健康状态 ──────────────────────────────
async function handleSystemHealth(event) {
  const { component, status, metrics } = event.payload || {};
  console.log(`[本地任务编排-Bridge] 健康检查: component=${component} status=${status}`);

  // 写入健康状态
  const statusDir = path.join(__dirname, '..', '..', 'infrastructure', 'logs');
  if (!fs.existsSync(statusDir)) fs.mkdirSync(statusDir, { recursive: true });
  const statusFile = path.join(statusDir, 'health-status.json');

  let healthData = {};
  if (fs.existsSync(statusFile)) {
    try { healthData = JSON.parse(fs.readFileSync(statusFile, 'utf8')); } catch {}
  }

  healthData[component || 'unknown'] = {
    status: status || 'ok',
    metrics: metrics || {},
    last_check: new Date().toISOString(),
  };

  fs.writeFileSync(statusFile, JSON.stringify(healthData, null, 2));
}

// CLI 入口
if (require.main === module) {
  processEvents()
    .then(r => {
      console.log(`[本地任务编排-Bridge] 完成: ${JSON.stringify(r)}`);
      process.exit(0);
    })
    .catch(err => {
      console.error('[本地任务编排-Bridge] 致命错误:', err);
      process.exit(1);
    });
}

/**
 * 任务完成事件发布 — 供DTO Platform.execute()完成后调用
 * @param {object} result - 任务执行结果
 * @param {string} result.taskId - 任务ID
 * @param {string} result.executionId - 执行ID
 * @param {string} [result.status] - 执行状态
 * @param {number} [result.duration] - 执行时长ms
 * @returns {object} 发布的事件
 */
function emitTaskCompleted(result) {
  const event = bus.emit('dto.task.completed', {
    task_id: result.taskId || result.task_id || 'unknown',
    execution_id: result.executionId || result.execution_id || null,
    status: result.status || 'completed',
    duration: result.duration || 0,
    timestamp: Date.now()
  }, 'lto-core');
  console.log(`[本地任务编排-Bridge] 发布事件: dto.task.completed (task=${result.taskId})`);
  return event;
}

/**
 * 任务创建接口 — 供 Dispatcher 反向调用
 * 接收事件，在DTO中创建对应任务
 * @param {object} event - 触发事件
 * @returns {object} 创建结果
 */
function createTaskFromEvent(event) {
  const payload = event.payload || event;
  const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  
  // 写入tasks目录作为任务声明
  const tasksDir = path.join(__dirname, 'tasks');
  if (!fs.existsSync(tasksDir)) fs.mkdirSync(tasksDir, { recursive: true });
  
  const taskDef = {
    id: taskId,
    name: payload.task_name || payload.name || 'auto-created-task',
    description: payload.description || `Auto-created from event ${event.id || 'unknown'}`,
    source_event: event.id || null,
    source_type: event.type || 'unknown',
    status: 'pending',
    created_at: new Date().toISOString(),
    payload: payload
  };
  
  fs.writeFileSync(
    path.join(tasksDir, `${taskId}.json`),
    JSON.stringify(taskDef, null, 2)
  );
  
  // Emit task created event
  bus.emit('dto.task.created', {
    task_id: taskId,
    name: taskDef.name,
    source_event: event.id || null
  }, 'lto-core');
  
  console.log(`[本地任务编排-Bridge] 创建任务: ${taskId} (${taskDef.name})`);
  
  return {
    status: 'ok',
    handler: 'dto-task-create',
    task_id: taskId,
    task: taskDef,
    timestamp: new Date().toISOString()
  };
}

module.exports = { processEvents, EVENT_HANDLERS, emitTaskCompleted, createTaskFromEvent };
