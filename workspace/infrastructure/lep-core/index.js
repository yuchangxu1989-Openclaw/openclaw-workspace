/**
 * LEP Core - Local Execution Protocol Infrastructure
 * 基础设施层核心模块，全局可require
 */

const { LEPExecutor } = require('./core/LEPExecutor');
const { SubAgentExecutionManager } = require('./core/SubAgentExecutionManager');
const { ModelRegistry } = require('./core/ModelRegistry');
const { TaskRouter } = require('./core/TaskRouter');
const { ExecutionPool } = require('./core/ExecutionPool');
const { RetryManager, CircuitBreaker } = require('./core/RetryManager');
const { HealthMonitor } = require('./core/HealthMonitor');
const { ConfigLoader } = require('./config/ConfigLoader');

// 全局单例实例
let globalLEP = null;

/**
 * 获取LEP全局实例（基础设施层直接访问）
 * @returns {LEPExecutor}
 */
function getLEP() {
  if (!globalLEP) {
    globalLEP = new LEPExecutor();
  }
  return globalLEP;
}

/**
 * 初始化LEP基础设施
 * @param {Object} config - 配置对象
 */
function initLEP(config = {}) {
  globalLEP = new LEPExecutor(config);
  return globalLEP;
}

module.exports = {
  // 核心执行器
  getLEP,
  initLEP,
  
  // 子Agent管理
  SubAgentExecutionManager,
  
  // 底层组件（供高级使用）
  LEPExecutor,
  ModelRegistry,
  TaskRouter,
  ExecutionPool,
  RetryManager,
  CircuitBreaker,
  HealthMonitor,
  ConfigLoader,
  
  // 版本
  VERSION: '1.0.0'
};
