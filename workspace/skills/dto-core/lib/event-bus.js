/**
 * DTO - 事件总线
 * Pub/Sub 机制，支持模块间通信
 */

const EventEmitter = require('events');

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.subscribers = new Map();
    this.eventHistory = [];
    this.maxHistory = 1000;
  }

  /**
   * 订阅事件
   * @param {string} event - 事件类型
   * @param {Function} handler - 处理函数
   * @param {Object} options - 选项
   */
  subscribe(event, handler, options = {}) {
    console.log(`[DTO-EventBus] 订阅事件: ${event}`);

    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, []);
    }

    const subscription = {
      handler,
      options,
      id: Math.random().toString(36).substr(2, 9)
    };

    this.subscribers.get(event).push(subscription);

    // 使用 EventEmitter
    this.on(event, handler);

    return subscription.id;
  }

  /**
   * 取消订阅
   */
  unsubscribe(event, subscriptionId) {
    console.log(`[DTO-EventBus] 取消订阅: ${event}`);

    const subs = this.subscribers.get(event);
    if (subs) {
      const index = subs.findIndex(s => s.id === subscriptionId);
      if (index > -1) {
        const sub = subs[index];
        this.off(event, sub.handler);
        subs.splice(index, 1);
        return true;
      }
    }

    return false;
  }

  /**
   * 发布事件
   * @param {string} event - 事件类型
   * @param {Object} data - 事件数据
   */
  publish(event, data) {
    console.log(`[DTO-EventBus] 发布事件: ${event}`);

    const eventRecord = {
      event,
      data,
      timestamp: new Date().toISOString(),
      subscribers: this.subscribers.get(event)?.length || 0
    };

    // 记录历史
    this.eventHistory.push(eventRecord);
    if (this.eventHistory.length > this.maxHistory) {
      this.eventHistory.shift();
    }

    // 触发事件
    this.emit(event, data);

    return eventRecord;
  }

  /**
   * 获取事件历史
   */
  getHistory(eventType, limit = 100) {
    let history = this.eventHistory;
    
    if (eventType) {
      history = history.filter(h => h.event === eventType);
    }

    return history.slice(-limit);
  }

  /**
   * 获取订阅列表
   */
  getSubscribers(event) {
    if (event) {
      return this.subscribers.get(event) || [];
    }
    
    return Array.from(this.subscribers.entries());
  }

  /**
   * 清空历史
   */
  clearHistory() {
    this.eventHistory = [];
  }

  /**
   * 标准事件类型
   */
  static Events = {
    // 任务相关
    TASK_CREATED: 'task.created',
    TASK_STARTED: 'task.started',
    TASK_COMPLETED: 'task.completed',
    TASK_FAILED: 'task.failed',
    
    // 标准相关
    STANDARD_UPDATED: 'standard.updated',
    STANDARD_VIOLATION: 'standard.violation',
    
    // 洞察相关
    INSIGHT_GENERATED: 'insight.generated',
    INSIGHT_CRITICAL: 'insight.critical',
    
    // 系统相关
    SYSTEM_ERROR: 'system.error',
    SYSTEM_RECOVERY: 'system.recovery'
  };
}

module.exports = EventBus;
