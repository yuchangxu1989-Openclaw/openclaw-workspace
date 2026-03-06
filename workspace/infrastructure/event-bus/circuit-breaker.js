'use strict';

/**
 * 事件总线熔断器（模块F）
 *
 * 设计来源：reports/day2-architecture-design-v2.md §2.6
 * 三层保护：
 *   1) 单类型速率限制（perTypePerMinute）
 *   2) 事件链深度限制（maxChainDepth）
 *   3) 全局速率限制 + 熔断冷却（globalPerMinute + cooldownMs）
 */

const DEFAULT_LIMITS = {
  perTypePerMinute: 50,
  maxChainDepth: 10,
  globalPerMinute: 200,
  cooldownMs: 60 * 1000,
};

let _limits = Object.assign({}, DEFAULT_LIMITS);

/** @type {Map<string, number[]>} */
const _typeCounters = new Map();
/** @type {number[]} */
let _globalCounter = [];
/** @type {boolean} */
let _tripped = false;
let _trippedAt = 0;

function configure(nextLimits = {}) {
  _limits = Object.assign({}, _limits, nextLimits || {});
  return getState();
}

function reset() {
  _typeCounters.clear();
  _globalCounter = [];
  _tripped = false;
  _trippedAt = 0;
}

function _prune(now) {
  for (const [type, timestamps] of _typeCounters.entries()) {
    const kept = timestamps.filter(t => now - t < 60 * 1000);
    if (kept.length > 0) _typeCounters.set(type, kept);
    else _typeCounters.delete(type);
  }
  _globalCounter = _globalCounter.filter(t => now - t < 60 * 1000);
}

function check(type, metadata = {}) {
  const now = Date.now();

  if (_tripped) {
    if (now - _trippedAt > _limits.cooldownMs) {
      _tripped = false;
    } else {
      return { allowed: false, reason: 'circuit breaker tripped' };
    }
  }

  const chainDepth = Number(metadata.chain_depth || 0);
  if (chainDepth >= _limits.maxChainDepth) {
    return { allowed: false, reason: `chain depth ${chainDepth} >= ${_limits.maxChainDepth}` };
  }

  _prune(now);

  const typeTs = _typeCounters.get(type) || [];
  if (typeTs.length >= _limits.perTypePerMinute) {
    return {
      allowed: false,
      reason: `type ${type} rate ${typeTs.length}/${_limits.perTypePerMinute}/min`,
    };
  }

  if (_globalCounter.length >= _limits.globalPerMinute) {
    _tripped = true;
    _trippedAt = now;
    return {
      allowed: false,
      reason: `global rate ${_globalCounter.length}/${_limits.globalPerMinute}/min, tripped!`,
    };
  }

  typeTs.push(now);
  _typeCounters.set(type, typeTs);
  _globalCounter.push(now);

  return { allowed: true };
}

function getState() {
  return {
    limits: Object.assign({}, _limits),
    tripped: _tripped,
    trippedAt: _trippedAt,
    globalRecent: _globalCounter.length,
    typesTracked: _typeCounters.size,
  };
}

module.exports = {
  DEFAULT_LIMITS,
  configure,
  reset,
  check,
  getState,
};
