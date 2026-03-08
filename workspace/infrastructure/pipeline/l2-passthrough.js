'use strict';

const fs = require('fs');
const path = require('path');

/**
 * L2 直通模式 (L2 Passthrough Mode)
 * 
 * 凌霄阁裁决：任何单点故障可在30秒内降级为L2直通模式
 * 
 * 当 L3_PIPELINE_ENABLED=false 时，事件绕过 L3 闭环流水线，
 * 直接走 L2 逻辑：event → 简单路由 → 直接执行
 * 
 * 设计原则：
 *   - 零依赖L3模块（不 require 任何 L3 组件）
 *   - 切换时间 < 30 秒（实测目标 < 100ms）
 *   - 降级后核心功能可用（用户消息响应、基础规则执行）
 */

const FLAGS_PATH = path.resolve(__dirname, '../config/flags.json');
const PASSTHROUGH_LOG = path.join(__dirname, 'l2-passthrough.log');

// ═══════════════════════════════════════════════════════════
// L2 直通路由表（硬编码，不依赖L3的routes.json）
// ═══════════════════════════════════════════════════════════
const L2_ROUTES = {
  'user.message': {
    action: 'direct-respond',
    description: 'Direct user message handling without L3 intent analysis',
  },
  'isc.rule.*': {
    action: 'log-and-skip',
    description: 'ISC rule changes logged but not processed in L2 mode',
  },
  'dto.task.*': {
    action: 'log-and-skip',
    description: '本地任务编排 tasks logged but not dispatched in L2 mode',
  },
  'cras.*': {
    action: 'log-and-skip',
    description: 'CRAS events logged but not processed in L2 mode',
  },
  'system.error': {
    action: 'log-alert',
    description: 'System errors always logged even in L2',
  },
  'system.health': {
    action: 'log-only',
    description: 'Health checks passthrough',
  },
};

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function readFlags() {
  try {
    return JSON.parse(fs.readFileSync(FLAGS_PATH, 'utf-8'));
  } catch (_) {
    return { L3_PIPELINE_ENABLED: false }; // 读取失败 = 安全降级
  }
}

function isL3Enabled() {
  // 环境变量优先
  const envVal = process.env.L3_PIPELINE_ENABLED;
  if (envVal !== undefined) {
    return envVal !== 'false' && envVal !== '0';
  }
  const flags = readFlags();
  return flags.L3_PIPELINE_ENABLED === true;
}

function appendLog(entry) {
  try {
    const line = JSON.stringify({ ...entry, timestamp: new Date().toISOString() }) + '\n';
    fs.appendFileSync(PASSTHROUGH_LOG, line, 'utf-8');
  } catch (_) {
    // 日志写入失败不阻塞
  }
}

/**
 * 匹配 L2 路由（支持 * 通配符）
 */
function matchL2Route(eventType) {
  // 精确匹配优先
  if (L2_ROUTES[eventType]) return L2_ROUTES[eventType];
  
  // 通配符匹配
  for (const pattern of Object.keys(L2_ROUTES)) {
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      if (eventType.startsWith(prefix + '.') || eventType === prefix) {
        return L2_ROUTES[pattern];
      }
    }
  }
  
  return { action: 'log-and-skip', description: 'Unmatched event in L2 mode' };
}

// ═══════════════════════════════════════════════════════════
// L2 Passthrough 核心
// ═══════════════════════════════════════════════════════════

class L2Passthrough {
  constructor() {
    this._stats = {
      totalProcessed: 0,
      byAction: {},
      activatedAt: null,
      lastEventAt: null,
    };
  }

  /**
   * 检查是否应该走 L2 直通模式
   * @returns {boolean} true = 使用L2直通，false = 使用L3 Pipeline
   */
  shouldPassthrough() {
    return !isL3Enabled();
  }

  /**
   * L2 直通处理单个事件
   * @param {object} event - 事件对象 { type, payload, source, timestamp, ... }
   * @returns {{ handled: boolean, action: string, duration: number }}
   */
  process(event) {
    const start = Date.now();

    if (!this._stats.activatedAt) {
      this._stats.activatedAt = new Date().toISOString();
    }

    const eventType = event && event.type ? event.type : 'unknown';
    const route = matchL2Route(eventType);
    
    let result;
    switch (route.action) {
      case 'direct-respond':
        result = this._handleDirectRespond(event);
        break;
      case 'log-alert':
        result = this._handleLogAlert(event);
        break;
      case 'log-only':
        result = this._handleLogOnly(event);
        break;
      case 'log-and-skip':
      default:
        result = this._handleLogAndSkip(event);
        break;
    }

    const duration = Date.now() - start;
    this._stats.totalProcessed++;
    this._stats.byAction[route.action] = (this._stats.byAction[route.action] || 0) + 1;
    this._stats.lastEventAt = new Date().toISOString();

    appendLog({
      mode: 'l2-passthrough',
      event_type: eventType,
      event_id: event && event.id,
      action: route.action,
      duration_ms: duration,
      success: result.success,
    });

    return {
      handled: true,
      action: route.action,
      duration,
      success: result.success,
      mode: 'l2-passthrough',
    };
  }

  /**
   * 批量处理事件（L2模式下简单串行）
   */
  processBatch(events) {
    const start = Date.now();
    const results = [];
    for (const event of events) {
      results.push(this.process(event));
    }
    return {
      total: events.length,
      results,
      duration: Date.now() - start,
      mode: 'l2-passthrough',
    };
  }

  // ─── Action Handlers ───

  _handleDirectRespond(event) {
    // L2 直接响应：不做意图分析，直接将消息标记为已接收
    // 实际执行由上层 event-bridge 处理
    return {
      success: true,
      action: 'direct-respond',
      note: 'Event routed directly without L3 intent analysis',
    };
  }

  _handleLogAlert(event) {
    // 系统错误始终记录
    appendLog({
      level: 'alert',
      event_type: event.type,
      payload: event.payload,
      source: event.source,
    });
    return { success: true, action: 'log-alert' };
  }

  _handleLogOnly(event) {
    return { success: true, action: 'log-only' };
  }

  _handleLogAndSkip(event) {
    return { success: true, action: 'log-and-skip' };
  }

  // ─── 统计 ───

  getStats() {
    return { ...this._stats };
  }

  resetStats() {
    this._stats = {
      totalProcessed: 0,
      byAction: {},
      activatedAt: null,
      lastEventAt: null,
    };
  }
}

// ═══════════════════════════════════════════════════════════
// 智能路由器：自动选择 L2 或 L3
// ═══════════════════════════════════════════════════════════

const _passthrough = new L2Passthrough();

/**
 * 统一入口：根据 feature flag 自动路由到 L2 或 L3
 * @param {object} event
 * @param {Function} l3Handler - L3 Pipeline 的 run() 方法
 * @returns {Promise<object>}
 */
async function routeEvent(event, l3Handler) {
  if (_passthrough.shouldPassthrough()) {
    return _passthrough.process(event);
  }
  // L3 模式
  if (typeof l3Handler === 'function') {
    return l3Handler(event);
  }
  // L3 handler 不可用 → 降级到 L2
  return _passthrough.process(event);
}

/**
 * 强制切换到 L2 直通模式
 * @returns {{ success: boolean, switchTime: number }}
 */
function switchToL2() {
  const start = Date.now();
  try {
    const flags = readFlags();
    flags.L3_PIPELINE_ENABLED = false;
    fs.writeFileSync(FLAGS_PATH, JSON.stringify(flags, null, 2) + '\n', 'utf-8');
    const switchTime = Date.now() - start;
    appendLog({ action: 'switch-to-l2', switchTime, success: true });
    return { success: true, switchTime };
  } catch (err) {
    return { success: false, switchTime: Date.now() - start, error: err.message };
  }
}

/**
 * 恢复 L3 Pipeline
 * @returns {{ success: boolean, switchTime: number }}
 */
function switchToL3() {
  const start = Date.now();
  try {
    const flags = readFlags();
    flags.L3_PIPELINE_ENABLED = true;
    fs.writeFileSync(FLAGS_PATH, JSON.stringify(flags, null, 2) + '\n', 'utf-8');
    const switchTime = Date.now() - start;
    appendLog({ action: 'switch-to-l3', switchTime, success: true });
    return { success: true, switchTime };
  } catch (err) {
    return { success: false, switchTime: Date.now() - start, error: err.message };
  }
}

/**
 * 获取当前模式
 * @returns {'l2-passthrough' | 'l3-pipeline'}
 */
function getCurrentMode() {
  return isL3Enabled() ? 'l3-pipeline' : 'l2-passthrough';
}

// ═══════════════════════════════════════════════════════════
// 导出
// ═══════════════════════════════════════════════════════════
module.exports = {
  L2Passthrough,
  routeEvent,
  switchToL2,
  switchToL3,
  getCurrentMode,
  isL3Enabled,
  // 内部导出（测试用）
  _internals: {
    L2_ROUTES,
    matchL2Route,
    readFlags,
    appendLog,
    FLAGS_PATH,
    PASSTHROUGH_LOG,
  },
};

// ═══════════════════════════════════════════════════════════
// 内置测试 — node l2-passthrough.js
// ═══════════════════════════════════════════════════════════
if (require.main === module) {
  const passed = [];
  const failed = [];

  function assert(cond, name) {
    if (cond) { passed.push(name); }
    else { failed.push(name); console.error(`  ✗ ${name}`); }
  }

  console.log('═══ L2 Passthrough — Unit Tests ═══\n');

  // T1: shouldPassthrough 检测
  {
    const pt = new L2Passthrough();
    const origEnv = process.env.L3_PIPELINE_ENABLED;
    
    process.env.L3_PIPELINE_ENABLED = 'false';
    assert(pt.shouldPassthrough() === true, 'T1.1: shouldPassthrough=true when disabled');
    
    process.env.L3_PIPELINE_ENABLED = 'true';
    assert(pt.shouldPassthrough() === false, 'T1.2: shouldPassthrough=false when enabled');
    
    if (origEnv !== undefined) process.env.L3_PIPELINE_ENABLED = origEnv;
    else delete process.env.L3_PIPELINE_ENABLED;
  }

  // T2: process 返回结构
  {
    const pt = new L2Passthrough();
    const origEnv = process.env.L3_PIPELINE_ENABLED;
    process.env.L3_PIPELINE_ENABLED = 'false';
    
    const result = pt.process({ type: 'user.message', id: 'test1', payload: { text: 'hello' } });
    assert(result.handled === true, 'T2.1: handled=true');
    assert(result.action === 'direct-respond', 'T2.2: user.message → direct-respond');
    assert(result.mode === 'l2-passthrough', 'T2.3: mode=l2-passthrough');
    assert(typeof result.duration === 'number', 'T2.4: duration is number');
    
    if (origEnv !== undefined) process.env.L3_PIPELINE_ENABLED = origEnv;
    else delete process.env.L3_PIPELINE_ENABLED;
  }

  // T3: 路由匹配（通配符）
  {
    const pt = new L2Passthrough();
    
    const r1 = matchL2Route('isc.rule.changed');
    assert(r1.action === 'log-and-skip', 'T3.1: isc.rule.* matches isc.rule.changed');
    
    const r2 = matchL2Route('dto.task.completed');
    assert(r2.action === 'log-and-skip', 'T3.2: dto.task.* matches dto.task.completed');
    
    const r3 = matchL2Route('system.error');
    assert(r3.action === 'log-alert', 'T3.3: system.error → log-alert');
    
    const r4 = matchL2Route('unknown.event.type');
    assert(r4.action === 'log-and-skip', 'T3.4: unmatched → log-and-skip');
  }

  // T4: 批量处理
  {
    const pt = new L2Passthrough();
    const events = [
      { type: 'user.message', id: 'b1', payload: {} },
      { type: 'system.health', id: 'b2', payload: {} },
      { type: 'cras.insight.generated', id: 'b3', payload: {} },
    ];
    const batch = pt.processBatch(events);
    assert(batch.total === 3, 'T4.1: batch total=3');
    assert(batch.results.length === 3, 'T4.2: 3 results');
    assert(batch.mode === 'l2-passthrough', 'T4.3: batch mode correct');
  }

  // T5: 切换速度测试
  {
    const origEnv = process.env.L3_PIPELINE_ENABLED;
    delete process.env.L3_PIPELINE_ENABLED;

    // 备份当前 flags
    let origFlags;
    try { origFlags = fs.readFileSync(FLAGS_PATH, 'utf-8'); } catch (_) {}

    const toL2 = switchToL2();
    assert(toL2.success === true, 'T5.1: switchToL2 succeeds');
    assert(toL2.switchTime < 30000, 'T5.2: switchToL2 < 30s');
    assert(toL2.switchTime < 1000, 'T5.3: switchToL2 < 1s (target: <100ms)');
    assert(getCurrentMode() === 'l2-passthrough', 'T5.4: mode is l2-passthrough');

    const toL3 = switchToL3();
    assert(toL3.success === true, 'T5.5: switchToL3 succeeds');
    assert(toL3.switchTime < 30000, 'T5.6: switchToL3 < 30s');
    assert(getCurrentMode() === 'l3-pipeline', 'T5.7: mode is l3-pipeline');

    // 恢复
    if (origFlags) fs.writeFileSync(FLAGS_PATH, origFlags, 'utf-8');
    if (origEnv !== undefined) process.env.L3_PIPELINE_ENABLED = origEnv;
    else delete process.env.L3_PIPELINE_ENABLED;
  }

  // T6: 统计
  {
    const pt = new L2Passthrough();
    pt.process({ type: 'user.message', id: 's1' });
    pt.process({ type: 'user.message', id: 's2' });
    pt.process({ type: 'system.error', id: 's3' });
    const stats = pt.getStats();
    assert(stats.totalProcessed === 3, 'T6.1: stats total=3');
    assert(stats.byAction['direct-respond'] === 2, 'T6.2: 2 direct-respond');
    assert(stats.byAction['log-alert'] === 1, 'T6.3: 1 log-alert');
  }

  // ── 结果 ──
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  通过: ${passed.length}  |  失败: ${failed.length}`);
  if (failed.length > 0) {
    console.log(`\n  失败用例:`);
    failed.forEach(f => console.log(`    ✗ ${f}`));
  }
  console.log(`${'─'.repeat(50)}\n`);
  process.exit(failed.length > 0 ? 1 : 0);
}
