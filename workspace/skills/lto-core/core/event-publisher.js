/**
 * 本地任务编排 Event Publisher
 * 事件发布机制 - 配合SEEF Evaluator订阅
 */

const fs = require('fs');
const path = require('path');
const EventBus = require('../lib/event-bus');

class EventPublisher {
  constructor(eventBus) {
    this.eventBus = eventBus || new EventBus();
    this.subscriptions = new Map();
    this.loadSubscriptions();
  }

  /**
   * 加载订阅配置
   */
  loadSubscriptions() {
    const subscriptionsDir = path.join(__dirname, '../subscriptions');
    
    if (!fs.existsSync(subscriptionsDir)) {
      console.log('[EventPublisher] 订阅目录不存在，跳过加载');
      return;
    }

    const files = fs.readdirSync(subscriptionsDir).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      try {
        const config = JSON.parse(
          fs.readFileSync(path.join(subscriptionsDir, file), 'utf8')
        );
        
        if (config.enabled !== false) {
          this.registerSubscription(config);
        }
      } catch (e) {
        console.error(`[EventPublisher] 加载订阅失败: ${file}`, e.message);
      }
    }
    
    console.log(`[EventPublisher] 已加载 ${this.subscriptions.size} 个订阅`);
  }

  /**
   * 注册订阅
   */
  registerSubscription(config) {
    for (const eventType of config.events || []) {
      if (!this.subscriptions.has(eventType)) {
        this.subscriptions.set(eventType, []);
      }
      
      this.subscriptions.get(eventType).push({
        id: config.id,
        name: config.name,
        handler: config.handler,
        filters: config.filters || {},
        priority: config.priority || 'normal'
      });
      
      console.log(`[EventPublisher] 注册订阅: ${config.id} -> ${eventType}`);
    }
  }

  /**
   * 发布事件
   * @param {string} eventType - 事件类型 (skill.registered, skill.updated)
   * @param {Object} payload - 事件负载
   */
  async publishEvent(eventType, payload) {
    const timestamp = new Date().toISOString();
    
    const event = {
      type: eventType,
      payload,
      timestamp,
      source: 'lto-core'
    };

    console.log(`[EventPublisher] 发布事件: ${eventType}`);
    console.log(`  Payload:`, JSON.stringify(payload, null, 2));

    // 发布到EventBus
    this.eventBus.publish(eventType, event);

    // 触发订阅处理器
    const subscribers = this.subscriptions.get(eventType) || [];
    
    for (const sub of subscribers) {
      try {
        // 应用过滤器
        if (!this.passesFilters(payload, sub.filters)) {
          console.log(`[EventPublisher] 跳过订阅 ${sub.id} (过滤器不匹配)`);
          continue;
        }

        await this.invokeHandler(sub, event);
      } catch (e) {
        console.error(`[EventPublisher] 订阅处理失败: ${sub.id}`, e.message);
      }
    }

    return event;
  }

  /**
   * 检查过滤器
   */
  passesFilters(payload, filters) {
    // 排除特定技能
    if (filters.excludeSkills && filters.excludeSkills.includes(payload.skillName)) {
      return false;
    }

    // 最小版本检查
    if (filters.minVersion && payload.version) {
      if (this.compareVersions(payload.version, filters.minVersion) < 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * 版本比较
   */
  compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    
    return 0;
  }

  /**
   * 调用处理器
   */
  async invokeHandler(subscription, event) {
    const { handler } = subscription;

    if (handler.type === 'skill') {
      await this.invokeSkillHandler(handler, event);
    } else if (handler.type === 'webhook') {
      await this.invokeWebhookHandler(handler, event);
    } else {
      console.warn(`[EventPublisher] 未知处理器类型: ${handler.type}`);
    }
  }

  /**
   * 调用技能处理器
   */
  async invokeSkillHandler(handler, event) {
    const { skill, subskill, input } = handler;
    
    // 替换模板变量
    const resolvedInput = this.resolveTemplate(input, event);
    
    console.log(`[EventPublisher] 调用技能: ${skill}/${subskill}`);
    console.log(`  Input:`, JSON.stringify(resolvedInput, null, 2));

    // 构造技能调用命令
    const skillPath = path.join(__dirname, '../../', skill);
    
    if (!fs.existsSync(skillPath)) {
      throw new Error(`技能不存在: ${skillPath}`);
    }

    // 根据技能类型调用
    if (fs.existsSync(path.join(skillPath, 'index.js'))) {
      // Node.js 技能
      const SkillModule = require(skillPath);
      if (typeof SkillModule[subskill] === 'function') {
        await SkillModule[subskill](resolvedInput);
      }
    } else if (fs.existsSync(path.join(skillPath, 'subskills', `${subskill}.py`))) {
      // Python 技能
      const { exec } = require('child_process');
      const util = require('util');
      const execPromise = util.promisify(exec);
      
      const cmd = `cd ${skillPath} && python3 subskills/${subskill}.py '${JSON.stringify(resolvedInput)}'`;
      const { stdout, stderr } = await execPromise(cmd);
      
      if (stderr) {
        console.error(`[EventPublisher] 技能执行错误:`, stderr);
      }
      
      console.log(`[EventPublisher] 技能输出:`, stdout);
    }
  }

  /**
   * 调用Webhook处理器
   */
  async invokeWebhookHandler(handler, event) {
    const { url, method = 'POST' } = handler;
    
    console.log(`[EventPublisher] 调用Webhook: ${url}`);
    
    // 这里可以使用 fetch 或 axios
    // 简化实现，实际需要添加 HTTP 客户端
    console.log(`[EventPublisher] Webhook调用暂未实现`);
  }

  /**
   * 解析模板变量
   */
  resolveTemplate(template, event) {
    const resolved = {};
    
    for (const [key, value] of Object.entries(template)) {
      if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
        const path = value.slice(2, -2).trim();
        resolved[key] = this.getNestedValue(event, path);
      } else {
        resolved[key] = value;
      }
    }
    
    return resolved;
  }

  /**
   * 获取嵌套值
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * 获取订阅列表
   */
  getSubscriptions(eventType) {
    if (eventType) {
      return this.subscriptions.get(eventType) || [];
    }
    return Array.from(this.subscriptions.entries());
  }
}

module.exports = EventPublisher;
