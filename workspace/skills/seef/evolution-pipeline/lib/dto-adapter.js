/**
 * @file lib/dto-adapter.js
 * @description DTO订阅适配器 - SEEF-DTO集成层
 * @module DTOAdapter
 * @version 1.0.0
 * 
 * 功能：
 * 1. 创建ISC规则：skill.evolution.auto-trigger
 * 2. DTO订阅配置管理
 * 3. 事件处理器：接收DTO事件，启动进化流程
 * 4. 与DTO-core系统对接
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const { SKILLS_DIR } = _require('../../../shared/paths');
import { EventEmitter } from 'events';

/**
 * DTO订阅适配器
 * @class
 * @extends EventEmitter
 */
class DTOAdapter extends EventEmitter {
  /**
   * @constructor
   * @param {Object} config - 配置对象
   * @param {Array<string>} config.subscriptionRules - 订阅的规则列表
   * @param {Array<string>} config.eventTypes - 监听的事件类型
   * @param {boolean} config.autoTrigger - 是否自动触发进化流程
   * @param {string} config.dtoCorePath - DTO核心路径
   * @param {string} config.iscRulesPath - ISC规则路径
   */
  constructor(config = {}) {
    super();
    
    this.config = {
      subscriptionRules: config.subscriptionRules || ['skill.evolution.auto-trigger'],
      eventTypes: config.eventTypes || ['skill.changed', 'skill.created', 'skill.published'],
      autoTrigger: config.autoTrigger !== false,
      dtoCorePath: config.dtoCorePath || path.join(SKILLS_DIR, 'lto-core'),
      iscRulesPath: config.iscRulesPath || path.join(SKILLS_DIR, 'isc-core/rules'),
      ...config
    };

    // 状态
    this.isSubscribed = false;
    this.dtoCore = null;
    this.subscriptions = new Map();
    this.eventHandlers = new Map();

    // 统计
    this.stats = {
      eventsReceived: 0,
      eventsProcessed: 0,
      eventsDropped: 0,
      errors: 0
    };

    // ISC规则定义
    this.iscRuleDefinition = {
      id: "skill.evolution.auto-trigger",
      name: "技能进化自动触发",
      description: "技能变更时自动触发SEEF进化流水线",
      version: "1.0.0",
      status: "active",
      trigger: {
        type: "event",
        sources: ["skill.changed", "skill.created", "skill.published"]
      },
      condition: {
        autoTrigger: true,
        minISCScore: 50,
        excludePatterns: [
          "**/node_modules/**",
          "**/.git/**",
          "**/*.log"
        ]
      },
      action: {
        type: "pipeline.trigger",
        target: "seef.evolution-pipeline",
        parameters: {
          immediate: false,
          queueIfRunning: true
        }
      },
      priority: 5,
      createdAt: "2026-03-01T00:00:00Z",
      updatedAt: "2026-03-01T00:00:00Z"
    };
  }

  /**
   * 初始化适配器
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    this._log('info', '初始化DTO适配器...');

    try {
      // 1. 检查DTO核心系统
      await this._checkDTOCore();

      // 2. 创建ISC规则
      await this._createISCRule();

      // 3. 注册事件处理器
      this._registerEventHandlers();

      this._log('info', 'DTO适配器初始化完成');

    } catch (error) {
      this._log('error', '初始化失败:', error.message);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * 启动DTO订阅
   * @async
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isSubscribed) {
      this._log('warning', 'DTO订阅已在运行');
      return;
    }

    try {
      this._log('info', '启动DTO订阅...');

      // 订阅DTO事件
      for (const eventType of this.config.eventTypes) {
        await this._subscribeEvent(eventType);
      }

      this.isSubscribed = true;
      this._log('info', `已订阅 ${this.config.eventTypes.length} 个事件类型`);
      this.emit('subscribed', { eventTypes: this.config.eventTypes });

    } catch (error) {
      this._log('error', '启动订阅失败:', error.message);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * 停止DTO订阅
   * @async
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isSubscribed) {
      return;
    }

    this._log('info', '停止DTO订阅...');

    // 取消所有订阅
    for (const [eventType, unsubscribe] of this.subscriptions) {
      try {
        await unsubscribe();
        this._log('debug', `已取消订阅: ${eventType}`);
      } catch (error) {
        this._log('warning', `取消订阅失败: ${eventType}`, error.message);
      }
    }

    this.subscriptions.clear();
    this.isSubscribed = false;
    
    this._log('info', 'DTO订阅已停止');
    this.emit('unsubscribed');
  }

  /**
   * 检查DTO核心系统
   * @private
   * @async
   */
  async _checkDTOCore() {
    const dtoCoreIndex = path.join(this.config.dtoCorePath, 'index.js');
    
    if (!fs.existsSync(dtoCoreIndex)) {
      this._log('warning', 'DTO核心未找到，使用模拟模式');
      this.dtoCore = null;
      return;
    }

    try {
      // 动态导入DTO核心
      const dtoModule = await import(dtoCoreIndex);
      this.dtoCore = dtoModule.default || dtoModule;
      this._log('info', 'DTO核心已加载');
    } catch (error) {
      this._log('warning', 'DTO核心加载失败，使用模拟模式:', error.message);
      this.dtoCore = null;
    }
  }

  /**
   * 创建ISC规则
   * @private
   * @async
   */
  async _createISCRule() {
    const ruleId = 'skill.evolution.auto-trigger';
    const rulePath = path.join(this.config.iscRulesPath, `rule.${ruleId}.json`);

    try {
      // 确保规则目录存在
      if (!fs.existsSync(this.config.iscRulesPath)) {
        fs.mkdirSync(this.config.iscRulesPath, { recursive: true });
      }

      // 检查规则是否已存在
      if (fs.existsSync(rulePath)) {
        this._log('info', `ISC规则已存在: ${ruleId}`);
        
        // 验证规则内容
        const existingRule = JSON.parse(fs.readFileSync(rulePath, 'utf-8'));
        if (existingRule.version !== this.iscRuleDefinition.version) {
          this._log('info', `更新ISC规则: ${ruleId} (${existingRule.version} -> ${this.iscRuleDefinition.version})`);
          fs.writeFileSync(rulePath, JSON.stringify(this.iscRuleDefinition, null, 2));
        }
      } else {
        // 创建新规则
        fs.writeFileSync(rulePath, JSON.stringify(this.iscRuleDefinition, null, 2));
        this._log('info', `创建ISC规则: ${ruleId}`);
      }

      this.emit('rule.created', { ruleId, path: rulePath });

    } catch (error) {
      this._log('error', '创建ISC规则失败:', error.message);
      throw error;
    }
  }

  /**
   * 注册事件处理器
   * @private
   */
  _registerEventHandlers() {
    // skill.changed 事件处理器
    this.eventHandlers.set('skill.changed', async (event) => {
      this._log('debug', '处理 skill.changed 事件:', event.skillId);
      
      if (!this._shouldProcessEvent(event)) {
        this.stats.eventsDropped++;
        return;
      }

      this.stats.eventsProcessed++;
      this.emit('skill.changed', {
        skillId: event.skillId,
        skillName: event.skillName,
        changeType: event.changeType,
        changedFiles: event.changedFiles || [],
        timestamp: event.timestamp || new Date().toISOString(),
        metadata: event.metadata || {}
      });
    });

    // skill.created 事件处理器
    this.eventHandlers.set('skill.created', async (event) => {
      this._log('debug', '处理 skill.created 事件:', event.skillId);
      
      this.stats.eventsProcessed++;
      this.emit('skill.created', {
        skillId: event.skillId,
        skillName: event.skillName,
        skillPath: event.skillPath,
        timestamp: event.timestamp || new Date().toISOString(),
        metadata: event.metadata || {}
      });
    });

    // skill.published 事件处理器
    this.eventHandlers.set('skill.published', async (event) => {
      this._log('debug', '处理 skill.published 事件:', event.skillId);
      
      this.stats.eventsProcessed++;
      this.emit('skill.published', {
        skillId: event.skillId,
        skillName: event.skillName,
        version: event.version,
        geneId: event.geneId,
        timestamp: event.timestamp || new Date().toISOString(),
        metadata: event.metadata || {}
      });
    });

    this._log('debug', `已注册 ${this.eventHandlers.size} 个事件处理器`);
  }

  /**
   * 订阅事件
   * @private
   * @async
   * @param {string} eventType - 事件类型
   */
  async _subscribeEvent(eventType) {
    if (this.subscriptions.has(eventType)) {
      return;
    }

    const handler = this.eventHandlers.get(eventType);
    if (!handler) {
      this._log('warning', `未找到事件处理器: ${eventType}`);
      return;
    }

    // 如果有DTO核心，使用其订阅机制
    if (this.dtoCore && this.dtoCore.subscribe) {
      try {
        const unsubscribe = await this.dtoCore.subscribe(eventType, (event) => {
          this.stats.eventsReceived++;
          handler(event);
        });

        this.subscriptions.set(eventType, unsubscribe);
        this._log('debug', `已订阅DTO事件: ${eventType}`);
      } catch (error) {
        this._log('warning', `DTO订阅失败: ${eventType}`, error.message);
        // 降级到模拟模式
        this._subscribeMock(eventType, handler);
      }
    } else {
      // 模拟模式
      this._subscribeMock(eventType, handler);
    }
  }

  /**
   * 模拟订阅（用于DTO不可用时）
   * @private
   * @param {string} eventType - 事件类型
   * @param {Function} handler - 处理器
   */
  _subscribeMock(eventType, handler) {
    this._log('debug', `使用模拟订阅: ${eventType}`);
    
    // 模拟取消订阅函数
    const unsubscribe = () => {
      this._log('debug', `模拟取消订阅: ${eventType}`);
    };

    this.subscriptions.set(eventType, unsubscribe);

    // 设置文件系统监视（可选）
    if (eventType === 'skill.changed') {
      this._setupFileWatcher(handler);
    }
  }

  /**
   * 设置文件系统监视
   * @private
   * @param {Function} handler - 处理器
   */
  _setupFileWatcher(handler) {
    // 简化的文件监视实现
    // 实际实现可以使用 chokidar 或 fs.watch
    this._log('debug', '文件系统监视已设置（模拟模式）');
  }

  /**
   * 检查是否应该处理事件
   * @private
   * @param {Object} event - 事件对象
   * @returns {boolean}
   */
  _shouldProcessEvent(event) {
    // 检查自动触发配置
    if (!this.config.autoTrigger) {
      return false;
    }

    // 检查排除模式
    if (event.changedFiles) {
      for (const file of event.changedFiles) {
        for (const pattern of this.iscRuleDefinition.condition.excludePatterns) {
          if (this._matchPattern(file, pattern)) {
            return false;
          }
        }
      }
    }

    // 检查ISC分数
    if (event.metadata?.iscScore !== undefined) {
      if (event.metadata.iscScore < this.iscRuleDefinition.condition.minISCScore) {
        this._log('debug', `ISC分数过低: ${event.metadata.iscScore}`);
        return false;
      }
    }

    return true;
  }

  /**
   * 匹配模式
   * @private
   * @param {string} str - 字符串
   * @param {string} pattern - 模式
   * @returns {boolean}
   */
  _matchPattern(str, pattern) {
    // 简化的glob匹配
    const regex = pattern
      .replace(/\*\*/g, '###GLOBSTAR###')
      .replace(/\*/g, '[^/]*')
      .replace(/###GLOBSTAR###/g, '.*')
      .replace(/\?/g, '.');
    
    return new RegExp(regex).test(str);
  }

  /**
   * 手动触发事件（用于测试或手动触发）
   * @param {string} eventType - 事件类型
   * @param {Object} eventData - 事件数据
   */
  async triggerEvent(eventType, eventData) {
    const handler = this.eventHandlers.get(eventType);
    if (!handler) {
      throw new Error(`未知的事件类型: ${eventType}`);
    }

    this._log('info', `手动触发事件: ${eventType}`);
    await handler(eventData);
  }

  /**
   * 获取ISC规则定义
   * @returns {Object}
   */
  getISCRule() {
    return { ...this.iscRuleDefinition };
  }

  /**
   * 更新ISC规则
   * @param {Object} updates - 更新内容
   */
  async updateISCRule(updates) {
    this.iscRuleDefinition = {
      ...this.iscRuleDefinition,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    // 保存到文件
    const rulePath = path.join(
      this.config.iscRulesPath, 
      `rule.${this.iscRuleDefinition.id}.json`
    );
    
    fs.writeFileSync(rulePath, JSON.stringify(this.iscRuleDefinition, null, 2));
    this._log('info', `ISC规则已更新: ${this.iscRuleDefinition.id}`);
    
    this.emit('rule.updated', { ruleId: this.iscRuleDefinition.id });
  }

  /**
   * 获取订阅统计
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      isSubscribed: this.isSubscribed,
      subscribedEvents: Array.from(this.subscriptions.keys()),
      autoTrigger: this.config.autoTrigger
    };
  }

  /**
   * 日志记录
   * @private
   */
  _log(level, ...args) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [DTOAdapter] [${level.toUpperCase()}]`, ...args);
  }
}

/**
 * 创建DTO适配器的工厂函数
 * @param {Object} config - 配置对象
 * @returns {DTOAdapter}
 */
export function createDTOAdapter(config = {}) {
  return new DTOAdapter(config);
}

export { DTOAdapter };
export default DTOAdapter;
