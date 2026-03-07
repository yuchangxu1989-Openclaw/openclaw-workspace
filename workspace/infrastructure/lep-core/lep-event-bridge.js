/**
 * LEP → L3 EventBus Bridge
 * [Gap4] 将 LEP 执行结果发布到 L3 事件总线，实现 LEP 与全局调度链路的连通
 * 
 * 在 LEP 执行器实例上绑定监听器，把 LEP 内部事件转换为标准 L3 事件格式
 * 并发布到 event-bus（bus-adapter）。
 */

'use strict';

const path = require('path');
let bus = null;

function getBus() {
  if (!bus) {
    try {
      bus = require(path.join(__dirname, '..', 'event-bus', 'bus-adapter.js'));
    } catch (err) {
      console.warn('[LEP-Bridge] bus-adapter not available:', err.message);
    }
  }
  return bus;
}

/**
 * 将 LEP 执行器实例的事件桥接到 L3 EventBus
 * @param {LEPExecutor} lepInstance - LEP 执行器实例
 */
function attachLEPBridge(lepInstance) {
  const b = getBus();
  if (!b) return;

  // 执行成功
  lepInstance.on('execution:success', ({ executionId, result, duration }) => {
    b.emit('lep.task.completed', {
      execution_id: executionId,
      duration_ms: duration,
      result_summary: typeof result === 'string' ? result.slice(0, 200) : JSON.stringify(result || {}).slice(0, 200),
    }, 'lep-executor');
  });

  // 执行失败
  lepInstance.on('execution:failure', ({ executionId, error, duration }) => {
    b.emit('lep.task.failed', {
      execution_id: executionId,
      duration_ms: duration,
      error: error && error.message ? error.message : String(error),
    }, 'lep-executor');
  });

  // 熔断器触发
  lepInstance.on('circuit:open', ({ executionId, circuitId }) => {
    b.emit('lep.circuit.opened', {
      execution_id: executionId,
      circuit_id: circuitId || 'default',
    }, 'lep-executor');
  });

  // 恢复触发
  lepInstance.on('recovery:triggered', ({ executionId }) => {
    b.emit('lep.task.recovery_triggered', {
      execution_id: executionId,
    }, 'lep-executor');
  });

  console.log('[LEP-Bridge] ✅ 已将 LEP 事件桥接到 L3 EventBus');
  return lepInstance;
}

/**
 * 直接发布 LEP 任务完成事件（无执行器实例时使用）
 */
function emitLEPCompleted(executionId, result) {
  const b = getBus();
  if (!b) return null;
  return b.emit('lep.task.completed', {
    execution_id: executionId,
    result_summary: typeof result === 'string' ? result.slice(0, 200) : JSON.stringify(result || {}).slice(0, 200),
  }, 'lep-executor');
}

/**
 * 直接发布 LEP 任务失败事件
 */
function emitLEPFailed(executionId, error) {
  const b = getBus();
  if (!b) return null;
  return b.emit('lep.task.failed', {
    execution_id: executionId,
    error: error && error.message ? error.message : String(error),
  }, 'lep-executor');
}

module.exports = { attachLEPBridge, emitLEPCompleted, emitLEPFailed };
