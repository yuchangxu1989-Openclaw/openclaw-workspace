#!/usr/bin/env node
/**
 * parallel-subagent 韧性核心导出模块
 * 为 LEP-executor 提供统一的韧性组件接口
 */

const path = require('path');

// 从 parallel-subagent 根模块导入
const {
  CircuitBreaker,
  PriorityQueue,
  RetryPolicy,
  AgentPool
} = require('../../parallel-subagent/index.js');

// 适配器：RetryPolicy → RetryHandler 接口
class RetryHandler {
  constructor(options = {}) {
    this.policy = new RetryPolicy({
      maxRetries: options.maxRetries || 3,
      baseDelay: options.baseDelay || 1000,
      maxDelay: options.maxDelay || 30000,
      backoffMultiplier: options.backoffMultiplier || 2
    });
  }

  async execute(fn, context = {}) {
    return this.policy.execute(fn, context);
  }
}

// 适配器：AgentPool → ConnectionPool 接口
class ConnectionPool {
  constructor(options = {}) {
    this.pool = new AgentPool({
      minSize: options.minSize || 2,
      maxSize: options.maxSize || 10,
      maxUses: options.maxUses || 100
    });
  }

  async acquire() {
    return this.pool.acquire();
  }

  release(agent) {
    return this.pool.release(agent);
  }

  getStats() {
    return this.pool.getStats();
  }
}

// 超时管理器（独立实现，parallel-subagent 中没有直接对应）
class TimeoutManager {
  constructor(options = {}) {
    this.defaultTimeout = options.default || 60000;
  }

  async withTimeout(promise, timeoutMs) {
    const timeout = timeoutMs || this.defaultTimeout;
    return Promise.race([
      promise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
      )
    ]);
  }
}

module.exports = {
  RetryHandler,
  CircuitBreaker,
  TimeoutManager,
  ConnectionPool
};