/**
 * LEP Executor - Main Entry Point
 * Local Execution Protocol 韧性执行中心主入口
 * @version 1.0.0
 */

const { LEPExecutor } = require('./src/core/LEPExecutor');

// 单例实例
let instance = null;

/**
 * 获取LEP执行器实例（单例模式）
 * @returns {LEPExecutor}
 */
function getInstance() {
  if (!instance) {
    instance = new LEPExecutor({
      retryPolicy: {
        maxRetries: 3,
        backoff: 'exponential',
        baseDelay: 1000,
        maxDelay: 30000
      },
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeout: 60000
      },
      timeout: {
        default: 60000
      }
    });
  }
  return instance;
}

/**
 * 执行ISC规则
 * @param {string} ruleId - 规则ID (N016, N017, N018)
 * @param {Object} context - 执行上下文
 * @returns {Promise<Object>}
 */
async function executeRule(ruleId, context = {}) {
  const lep = getInstance();
  return await lep.executeRule(ruleId, context);
}

/**
 * 执行通用任务
 * @param {Object} task - 任务配置
 * @returns {Promise<Object>}
 */
async function execute(task) {
  const lep = getInstance();
  return await lep.execute(task);
}

/**
 * 健康检查
 * @returns {Promise<Object>}
 */
async function health() {
  const lep = getInstance();
  return await lep.health();
}

/**
 * 获取执行统计
 * @param {Object} filters - 过滤条件
 * @returns {Object}
 */
function getStats(filters = {}) {
  const lep = getInstance();
  return lep.getStats(filters);
}

// CLI支持
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  (async () => {
    switch (command) {
      case 'execute-rule':
      case 'rule': {
        const ruleId = args[1];
        const context = args[2] ? JSON.parse(args[2]) : {};
        
        if (!ruleId) {
          console.error('Usage: node index.js execute-rule <ruleId> [context]');
          process.exit(1);
        }
        
        try {
          const result = await executeRule(ruleId, context);
          console.log(JSON.stringify(result, null, 2));
          process.exit(0);
        } catch (error) {
          console.error('Execution failed:', error.message);
          process.exit(1);
        }
        break;
      }

      case 'health':
      case 'status': {
        const result = await health();
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.healthy ? 0 : 1);
        break;
      }

      case 'stats': {
        const filters = args[1] ? JSON.parse(args[1]) : {};
        const result = getStats(filters);
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
        break;
      }

      case 'test-n016': {
        // 测试N016修复循环
        console.log('Testing N016: Repair Loop');
        const result = await executeRule('N016', {
          fixableIssues: [
            { id: 1, type: 'file_not_found', path: '/tmp/test-file.txt' }
          ]
        });
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
        break;
      }

      case 'test-n017': {
        // 测试N017重复模式
        console.log('Testing N017: Recurring Pattern');
        const result = await executeRule('N017', {});
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
        break;
      }

      case 'test-n018': {
        // 测试N018全局对齐
        console.log('Testing N018: Global Alignment');
        const result = await executeRule('N018', {
          oldName: 'old-skill-name',
          newName: 'new-skill-name'
        });
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
        break;
      }

      default:
        console.log(`
LEP Executor - Local Execution Protocol

Usage:
  node index.js <command> [options]

Commands:
  execute-rule <ruleId> [context]  Execute an ISC rule (N016, N017, N018)
  health                          Check LEP health status
  stats [filters]                 Get execution statistics
  test-n016                       Test N016 repair loop
  test-n017                       Test N017 recurring pattern
  test-n018                       Test N018 global alignment

Examples:
  node index.js execute-rule N016
  node index.js execute-rule N017 '{"time_window": "24h"}'
  node index.js execute-rule N018 '{"oldName": "foo", "newName": "bar"}'
  node index.js health
        `);
        process.exit(0);
    }
  })();
}

module.exports = {
  getInstance,
  executeRule,
  execute,
  health,
  getStats,
  LEPExecutor
};
