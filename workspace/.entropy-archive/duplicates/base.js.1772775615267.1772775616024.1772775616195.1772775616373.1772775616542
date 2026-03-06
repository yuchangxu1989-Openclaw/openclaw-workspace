/**
 * Base Executor - 所有N规则执行器的基类
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

/**
 * 基础执行器类
 */
class BaseExecutor {
  constructor(lepExecutor) {
    this.lep = lepExecutor;
    this.logger = new Logger(this.constructor.name);
  }

  /**
   * 执行入口（子类必须实现）
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>}
   */
  async execute(context) {
    throw new Error('execute() must be implemented by subclass');
  }

  /**
   * 加载ISC规则
   * @param {string} ruleId - 规则ID
   * @returns {Promise<Object>}
   */
  async loadRule(ruleId) {
    const rulePattern = path.join(__dirname, '../../../isc-core/rules', `*${ruleId}*.json`);
    const files = glob.sync(rulePattern);
    
    if (files.length === 0) {
      throw new Error(`ISC rule not found: ${ruleId}`);
    }
    
    // 选择最匹配的文件
    const ruleFile = files.find(f => f.includes(ruleId.toLowerCase())) || files[0];
    
    try {
      const content = fs.readFileSync(ruleFile, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to load rule ${ruleId}: ${error.message}`);
    }
  }

  /**
   * 检查触发条件
   * @param {Object} trigger - 触发条件配置
   * @param {Object} context - 执行上下文
   * @returns {boolean}
   */
  checkTrigger(trigger, context) {
    // 事件触发
    if (trigger.event) {
      return context.event === trigger.event;
    }
    
    // 定时触发（cron）
    if (trigger.schedule) {
      // 由调度器处理，执行时已经满足
      return true;
    }
    
    // 条件触发
    if (trigger.condition) {
      try {
        // 安全地评估条件表达式
        const conditionFn = new Function('context', `return ${trigger.condition}`);
        return conditionFn(context);
      } catch (e) {
        this.logger.warn(`Failed to evaluate condition: ${trigger.condition}`);
        return false;
      }
    }
    
    return true;
  }

  /**
   * 检查治理策略
   * @param {Object} governance - 治理配置
   * @param {Object} context - 执行上下文
   * @returns {boolean}
   */
  checkGovernance(governance, context) {
    // 检查是否允许自动执行
    if (governance.auto_execute === false) {
      this.logger.info('Auto-execution disabled by governance');
      return false;
    }
    
    // 检查优先级
    if (governance.priority) {
      context.priority = governance.priority;
    }
    
    // 检查风险等级
    if (governance.risk_level === 'high') {
      this.logger.warn('High risk rule, additional verification required');
      // 可以在这里添加额外的确认逻辑
    }
    
    return true;
  }

  /**
   * 发送通知
   * @param {string} channel - 通知渠道
   * @param {Object} message - 消息内容
   */
  async notify(channel, message) {
    switch (channel) {
      case 'feishu':
        await this._notifyFeishu(message);
        break;
        
      case 'log':
      default:
        this.logger.info(`[NOTIFY] ${message.content || message}`);
    }
  }

  async _notifyFeishu(message) {
    try {
      const { sendMessage } = require('../../feishu-chat-backup');
      await sendMessage({
        level: message.level || 'info',
        content: message.content
      });
    } catch (error) {
      this.logger.error(`Failed to send Feishu notification: ${error.message}`);
    }
  }

  /**
   * 执行子任务（带LEP韧性保障）
   * @param {Object} task - 任务配置
   * @returns {Promise<Object>}
   */
  async executeSubTask(task) {
    return await this.lep.execute(task);
  }

  /**
   * 安全解析JSON
   * @param {string} content - JSON内容
   * @param {Object} defaultValue - 默认值
   * @returns {Object}
   */
  safeParseJSON(content, defaultValue = {}) {
    try {
      return JSON.parse(content);
    } catch (e) {
      return defaultValue;
    }
  }

  /**
   * 生成唯一ID
   * @param {string} prefix - 前缀
   * @returns {string}
   */
  generateId(prefix = 'exec') {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * 延迟执行
   * @param {number} ms - 毫秒
   * @returns {Promise}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 批量执行
   * @param {Array} items - 待处理项
   * @param {Function} processor - 处理函数
   * @param {Object} options - 选项
   * @returns {Promise<Array>}
   */
  async batchProcess(items, processor, options = {}) {
    const { concurrency = 5, stopOnError = false } = options;
    const results = [];
    
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      
      const batchResults = await Promise.all(
        batch.map(async (item, idx) => {
          try {
            const result = await processor(item, i + idx);
            return { success: true, item, result };
          } catch (error) {
            if (stopOnError) throw error;
            return { success: false, item, error: error.message };
          }
        })
      );
      
      results.push(...batchResults);
    }
    
    return results;
  }
}

/**
 * 简单日志器
 */
class Logger {
  constructor(name) {
    this.name = name;
    this.levels = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3
    };
    this.level = process.env.LEP_LOG_LEVEL || 'INFO';
  }

  _log(level, message, ...args) {
    if (this.levels[level] >= this.levels[this.level]) {
      const timestamp = new Date().toISOString();
      const prefix = `[${timestamp}] [${level}] [${this.name}]`;
      
      if (args.length > 0) {
        console.log(prefix, message, ...args);
      } else {
        console.log(prefix, message);
      }
    }
  }

  debug(message, ...args) {
    this._log('DEBUG', message, ...args);
  }

  info(message, ...args) {
    this._log('INFO', message, ...args);
  }

  warn(message, ...args) {
    this._log('WARN', message, ...args);
  }

  error(message, ...args) {
    this._log('ERROR', message, ...args);
  }
}

module.exports = { BaseExecutor, Logger };
