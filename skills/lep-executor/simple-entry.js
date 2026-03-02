/**
 * LEP Executor - Simplified Entry Point
 * 简化入口，避免运行时依赖问题
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * 执行ISC规则（通过CLI调用）
 * @param {string} ruleId - 规则ID (N016, N017, N018)
 * @param {Object} context - 执行上下文
 * @returns {Promise<Object>}
 */
async function executeRule(ruleId, context = {}) {
  const lepPath = path.join(__dirname, 'index.js');
  const contextJson = JSON.stringify(context);
  
  try {
    const result = execSync(
      `node "${lepPath}" execute-rule ${ruleId} '${contextJson}'`,
      { 
        encoding: 'utf-8',
        cwd: __dirname,
        maxBuffer: 10 * 1024 * 1024
      }
    );
    
    return JSON.parse(result);
  } catch (error) {
    console.error(`LEP executeRule failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      ruleId,
      context
    };
  }
}

/**
 * 执行通用任务
 * @param {Object} task - 任务配置
 * @returns {Promise<Object>}
 */
async function execute(task) {
  // 简化实现：直接执行任务
  const { type, script, args, retryPolicy } = task;
  
  if (type === 'python') {
    return await executePythonScript(script, args);
  } else if (type === 'shell') {
    return await executeShellCommand(script, args);
  } else {
    throw new Error(`Unsupported task type: ${type}`);
  }
}

/**
 * 执行Python脚本
 */
async function executePythonScript(script, args = {}) {
  const argsJson = JSON.stringify(args);
  
  try {
    const result = execSync(
      `python3 "${script}" '${argsJson}'`,
      { 
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024
      }
    );
    
    return {
      success: true,
      output: result,
      script
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      script
    };
  }
}

/**
 * 执行Shell命令
 */
async function executeShellCommand(command, args = {}) {
  try {
    const result = execSync(command, { 
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024
    });
    
    return {
      success: true,
      output: result,
      command
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      command
    };
  }
}

/**
 * 健康检查
 */
async function health() {
  return {
    healthy: true,
    version: '1.0.0',
    mode: 'simplified',
    timestamp: Date.now()
  };
}

/**
 * 获取执行统计（简化版）
 */
function getStats(filters = {}) {
  return {
    mode: 'simplified',
    message: 'Stats not available in simplified mode'
  };
}

module.exports = {
  executeRule,
  execute,
  health,
  getStats
};
