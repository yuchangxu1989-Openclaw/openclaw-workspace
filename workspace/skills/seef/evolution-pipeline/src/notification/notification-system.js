/**
 * @file notification/notification-system.js
 * @description 通知系统 - 统一消息管理和多渠道分发
 * @module EvolutionPipeline/Notification
 * @version 1.0.0
 * @license ISC
 * @copyright (c) 2026 SEEF (技能生态进化工厂)
 * @author SEEF Core Team
 */

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import { NotificationType, NotificationChannel, EventType } from '../types/index.js';

/**
 * 通知消息类
 * @class Notification
 * @description 封装单个通知消息
 */
export class Notification {
  /**
   * @constructor
   * @param {Object} config - 通知配置
   * @param {NotificationType} config.type - 通知类型
   * @param {string} config.title - 标题
   * @param {string} config.message - 消息内容
   * @param {Object} [config.data] - 附加数据
   * @param {number} [config.ttl=86400] - 存活时间(秒)
   * @param {string} [config.source] - 消息来源
   */
  constructor(config) {
    this.id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.type = config.type || NotificationType.INFO;
    this.title = config.title || 'Notification';
    this.message = config.message || '';
    this.data = config.data || {};
    this.ttl = config.ttl ?? 86400; // 默认24小时
    this.source = config.source || 'system';
    this.createdAt = new Date();
    this.read = false;
    this.readAt = null;
    this.delivered = false;
    this.deliveredAt = null;
    this.channels = [];
  }

  /**
   * 获取消息摘要
   * @returns {string}
   */
  get summary() {
    const maxLength = 100;
    if (this.message.length <= maxLength) return this.message;
    return this.message.substring(0, maxLength) + '...';
  }

  /**
   * 检查是否过期
   * @returns {boolean}
   */
  get isExpired() {
    const age = (Date.now() - this.createdAt.getTime()) / 1000;
    return age > this.ttl;
  }

  /**
   * 标记为已读
   */
  markAsRead() {
    this.read = true;
    this.readAt = new Date();
  }

  /**
   * 标记为已送达
   * @param {NotificationChannel[]} channels - 送达渠道
   */
  markAsDelivered(channels) {
    this.delivered = true;
    this.deliveredAt = new Date();
    this.channels = channels;
  }

  /**
   * 转换为JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      title: this.title,
      message: this.message,
      data: this.data,
      ttl: this.ttl,
      source: this.source,
      createdAt: this.createdAt,
      read: this.read,
      readAt: this.readAt,
      delivered: this.delivered,
      deliveredAt: this.deliveredAt,
      channels: this.channels
    };
  }
}

/**
 * 通知处理器接口
 * @typedef {Object} NotificationHandler
 * @property {NotificationChannel} channel - 处理渠道
 * @property {Function} send - 发送函数
 * @property {Function} [initialize] - 初始化函数
 * @property {Function} [destroy] - 销毁函数
 */

/**
 * 控制台通知处理器
 * @class ConsoleHandler
 */
class ConsoleHandler {
  constructor() {
    this.channel = NotificationChannel.CONSOLE;
  }

  /**
   * 发送通知到控制台
   * @param {Notification} notification - 通知对象
   * @returns {Promise<{success: boolean}>}
   */
  async send(notification) {
    const icons = {
      [NotificationType.INFO]: 'ℹ️',
      [NotificationType.SUCCESS]: '✅',
      [NotificationType.WARNING]: '⚠️',
      [NotificationType.ERROR]: '❌',
      [NotificationType.CRITICAL]: '🚨',
      [NotificationType.PROGRESS]: '📊'
    };

    const icon = icons[notification.type] || 'ℹ️';
    const timestamp = notification.createdAt.toISOString();

    console.log(`\n${icon} [${notification.type.toUpperCase()}] ${notification.title}`);
    console.log(`   ${notification.message}`);
    if (Object.keys(notification.data).length > 0) {
      console.log(`   Data:`, JSON.stringify(notification.data, null, 2));
    }
    console.log(`   Source: ${notification.source} | ${timestamp}\n`);

    return { success: true };
  }
}

/**
 * 文件通知处理器
 * @class FileHandler
 */
class FileHandler {
  constructor(options = {}) {
    this.channel = NotificationChannel.FILE;
    this.logDir = options.logDir || './logs/notifications';
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
  }

  /**
   * 初始化
   * @async
   */
  async initialize() {
    await fs.mkdir(this.logDir, { recursive: true });
  }

  /**
   * 发送通知到文件
   * @param {Notification} notification - 通知对象
   * @returns {Promise<{success: boolean, filePath?: string}>}
   */
  async send(notification) {
    try {
      const date = notification.createdAt.toISOString().split('T')[0];
      const fileName = `notifications-${date}.jsonl`;
      const filePath = path.join(this.logDir, fileName);

      const line = JSON.stringify(notification.toJSON()) + '\n';
      await fs.appendFile(filePath, line, 'utf-8');

      return { success: true, filePath };
    } catch (error) {
      console.error('[FileHandler] Failed to write notification:', error.message);
      return { success: false, error: error.message };
    }
  }
}

/**
 * Webhook通知处理器
 * @class WebhookHandler
 */
class WebhookHandler {
  constructor(options = {}) {
    this.channel = NotificationChannel.WEBHOOK;
    this.webhookUrl = options.webhookUrl;
    this.headers = options.headers || { 'Content-Type': 'application/json' };
    this.timeout = options.timeout || 10000;
  }

  /**
   * 发送通知到Webhook
   * @param {Notification} notification - 通知对象
   * @returns {Promise<{success: boolean}>}
   */
  async send(notification) {
    if (!this.webhookUrl) {
      return { success: false, error: 'Webhook URL not configured' };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(notification.toJSON()),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return { success: true };
    } catch (error) {
      console.error('[WebhookHandler] Failed to send webhook:', error.message);
      return { success: false, error: error.message };
    }
  }
}

/**
 * 事件通知处理器（内部事件总线）
 * @class EventHandler
 */
class EventHandler {
  constructor(eventEmitter) {
    this.channel = NotificationChannel.EVENT;
    this.eventEmitter = eventEmitter;
  }

  /**
   * 发送通知作为事件
   * @param {Notification} notification - 通知对象
   * @returns {Promise<{success: boolean}>}
   */
  async send(notification) {
    try {
      this.eventEmitter.emit(EventType.NOTIFICATION_SENT, notification);

      // 根据类型发送特定事件
      const eventMap = {
        [NotificationType.ERROR]: 'notification:error',
        [NotificationType.CRITICAL]: 'notification:critical',
        [NotificationType.SUCCESS]: 'notification:success',
        [NotificationType.WARNING]: 'notification:warning'
      };

      const eventName = eventMap[notification.type];
      if (eventName) {
        this.eventEmitter.emit(eventName, notification);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * 飞书通知处理器
 * @class FeishuHandler
 */
class FeishuHandler {
  constructor(options = {}) {
    this.channel = NotificationChannel.FEISHU;
    this.webhookUrl = options.webhookUrl;
    this.timeout = options.timeout || 10000;
  }

  /**
   * 发送通知到飞书
   * @param {Notification} notification - 通知对象
   * @returns {Promise<{success: boolean}>}
   */
  async send(notification) {
    if (!this.webhookUrl) {
      return { success: false, error: 'Feishu webhook URL not configured' };
    }

    try {
      const colorMap = {
        [NotificationType.INFO]: 'blue',
        [NotificationType.SUCCESS]: 'green',
        [NotificationType.WARNING]: 'orange',
        [NotificationType.ERROR]: 'red',
        [NotificationType.CRITICAL]: 'red',
        [NotificationType.PROGRESS]: 'blue'
      };

      const payload = {
        msg_type: 'interactive',
        card: {
          header: {
            title: {
              tag: 'plain_text',
              content: notification.title
            },
            template: colorMap[notification.type] || 'blue'
          },
          elements: [
            {
              tag: 'div',
              text: {
                tag: 'lark_md',
                content: notification.message
              }
            },
            {
              tag: 'div',
              text: {
                tag: 'lark_md',
                content: `**Source:** ${notification.source}\n**Time:** ${notification.createdAt.toISOString()}`
              }
            }
          ]
        }
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return { success: true };
    } catch (error) {
      console.error('[FeishuHandler] Failed to send notification:', error.message);
      return { success: false, error: error.message };
    }
  }
}

/**
 * 通知管理器
 * @class NotificationManager
 * @extends EventEmitter
 * @description 统一通知管理和多渠道分发
 */
export class NotificationManager extends EventEmitter {
  /**
   * @constructor
   * @param {Object} options - 配置选项
   * @param {NotificationChannel[]} [options.defaultChannels=[NotificationChannel.CONSOLE]] - 默认渠道
   * @param {boolean} [options.enablePersistence=true] - 启用持久化
   * @param {string} [options.persistencePath] - 持久化路径
   * @param {number} [options.maxHistory=1000] - 最大历史记录数
   * @param {Object} [options.channelConfig] - 渠道配置
   */
  constructor(options = {}) {
    super();

    this.config = {
      defaultChannels: options.defaultChannels || [NotificationChannel.CONSOLE],
      enablePersistence: options.enablePersistence !== false,
      persistencePath: options.persistencePath,
      maxHistory: options.maxHistory || 1000,
      ...options
    };

    /** @private @type {Map<NotificationChannel, NotificationHandler>} */
    this.handlers = new Map();

    /** @private @type {Notification[]} */
    this.history = [];

    /** @private @type {boolean} */
    this.initialized = false;

    /** @private @type {Object} */
    this.stats = {
      total: 0,
      byType: {},
      byChannel: {},
      failed: 0
    };
  }

  /**
   * 初始化通知管理器
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;

    // 注册默认处理器
    this.registerHandler(NotificationChannel.CONSOLE, new ConsoleHandler());
    this.registerHandler(NotificationChannel.FILE, new FileHandler({
      logDir: this.config.persistencePath
    }));
    this.registerHandler(NotificationChannel.EVENT, new EventHandler(this));
    this.registerHandler(NotificationChannel.WEBHOOK, new WebhookHandler(
      this.config.channelConfig?.webhook
    ));
    this.registerHandler(NotificationChannel.FEISHU, new FeishuHandler(
      this.config.channelConfig?.feishu
    ));

    // 初始化所有处理器
    for (const handler of this.handlers.values()) {
      if (handler.initialize) {
        await handler.initialize();
      }
    }

    this.initialized = true;
    this.emit('initialized');
    this._log('info', 'NotificationManager initialized');
  }

  /**
   * 注册通知处理器
   * @param {NotificationChannel} channel - 渠道
   * @param {NotificationHandler} handler - 处理器
   */
  registerHandler(channel, handler) {
    this.handlers.set(channel, handler);
    this._log('debug', `Handler registered for channel: ${channel}`);
  }

  /**
   * 发送通知
   * @async
   * @param {Object} config - 通知配置
   * @param {NotificationType} config.type - 通知类型
   * @param {string} config.title - 标题
   * @param {string} config.message - 消息内容
   * @param {Object} [config.data] - 附加数据
   * @param {NotificationChannel[]} [config.channels] - 指定渠道（覆盖默认）
   * @returns {Promise<Notification>}
   */
  async notify(config) {
    if (!this.initialized) {
      await this.initialize();
    }

    const notification = new Notification(config);
    const channels = config.channels || this.config.defaultChannels;

    this.emit('notification:created', notification);

    const deliveredChannels = [];
    const failures = [];

    // 发送到所有指定渠道
    for (const channel of channels) {
      const handler = this.handlers.get(channel);
      if (!handler) {
        failures.push({ channel, error: 'Handler not found' });
        continue;
      }

      try {
        const result = await handler.send(notification);
        if (result.success) {
          deliveredChannels.push(channel);
          this.stats.byChannel[channel] = (this.stats.byChannel[channel] || 0) + 1;
        } else {
          failures.push({ channel, error: result.error });
        }
      } catch (error) {
        failures.push({ channel, error: error.message });
      }
    }

    // 更新通知状态
    notification.markAsDelivered(deliveredChannels);

    // 更新统计
    this.stats.total++;
    this.stats.byType[notification.type] = (this.stats.byType[notification.type] || 0) + 1;
    if (failures.length > 0) {
      this.stats.failed++;
    }

    // 添加到历史
    this._addToHistory(notification);

    // 触发事件
    if (deliveredChannels.length > 0) {
      this.emit(EventType.NOTIFICATION_SENT, notification);
    }
    if (failures.length > 0) {
      this.emit(EventType.NOTIFICATION_FAILED, { notification, failures });
    }

    this._log('debug', `Notification sent: ${notification.title} to [${deliveredChannels.join(', ')}]`);

    return notification;
  }

  /**
   * 发送信息通知
   * @async
   * @param {string} title - 标题
   * @param {string} message - 消息
   * @param {Object} [data] - 附加数据
   * @returns {Promise<Notification>}
   */
  async info(title, message, data) {
    return this.notify({ type: NotificationType.INFO, title, message, data });
  }

  /**
   * 发送成功通知
   * @async
   * @param {string} title - 标题
   * @param {string} message - 消息
   * @param {Object} [data] - 附加数据
   * @returns {Promise<Notification>}
   */
  async success(title, message, data) {
    return this.notify({ type: NotificationType.SUCCESS, title, message, data });
  }

  /**
   * 发送警告通知
   * @async
   * @param {string} title - 标题
   * @param {string} message - 消息
   * @param {Object} [data] - 附加数据
   * @returns {Promise<Notification>}
   */
  async warning(title, message, data) {
    return this.notify({ type: NotificationType.WARNING, title, message, data });
  }

  /**
   * 发送错误通知
   * @async
   * @param {string} title - 标题
   * @param {string} message - 消息
   * @param {Object} [data] - 附加数据
   * @returns {Promise<Notification>}
   */
  async error(title, message, data) {
    return this.notify({ type: NotificationType.ERROR, title, message, data });
  }

  /**
   * 发送严重错误通知
   * @async
   * @param {string} title - 标题
   * @param {string} message - 消息
   * @param {Object} [data] - 附加数据
   * @returns {Promise<Notification>}
   */
  async critical(title, message, data) {
    return this.notify({ type: NotificationType.CRITICAL, title, message, data });
  }

  /**
   * 发送进度通知
   * @async
   * @param {string} title - 标题
   * @param {string} message - 消息
   * @param {Object} [data] - 附加数据（应包含 progress: 0-100）
   * @returns {Promise<Notification>}
   */
  async progress(title, message, data) {
    return this.notify({ type: NotificationType.PROGRESS, title, message, data });
  }

  /**
   * 获取历史记录
   * @param {Object} options - 筛选选项
   * @param {NotificationType[]} [options.types] - 类型筛选
   * @param {boolean} [options.unreadOnly=false] - 仅未读
   * @param {number} [options.limit=100] - 数量限制
   * @returns {Notification[]}
   */
  getHistory(options = {}) {
    let filtered = [...this.history];

    if (options.types?.length) {
      filtered = filtered.filter(n => options.types.includes(n.type));
    }

    if (options.unreadOnly) {
      filtered = filtered.filter(n => !n.read);
    }

    // 过滤已过期
    filtered = filtered.filter(n => !n.isExpired);

    // 排序（最新的在前）
    filtered.sort((a, b) => b.createdAt - a.createdAt);

    return options.limit ? filtered.slice(0, options.limit) : filtered;
  }

  /**
   * 标记为已读
   * @param {string} notificationId - 通知ID
   * @returns {boolean}
   */
  markAsRead(notificationId) {
    const notification = this.history.find(n => n.id === notificationId);
    if (notification) {
      notification.markAsRead();
      this.emit('notification:read', notification);
      return true;
    }
    return false;
  }

  /**
   * 标记所有为已读
   * @returns {number}
   */
  markAllAsRead() {
    let count = 0;
    for (const notification of this.history) {
      if (!notification.read) {
        notification.markAsRead();
        count++;
      }
    }
    this.emit('notification:allread', { count });
    return count;
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      historySize: this.history.length,
      unreadCount: this.history.filter(n => !n.read).length
    };
  }

  /**
   * 清空历史
   * @param {boolean} [onlyExpired=false] - 仅清空过期
   * @returns {number}
   */
  clearHistory(onlyExpired = false) {
    let cleared;
    if (onlyExpired) {
      const before = this.history.length;
      this.history = this.history.filter(n => !n.isExpired);
      cleared = before - this.history.length;
    } else {
      cleared = this.history.length;
      this.history = [];
    }
    return cleared;
  }

  /**
   * 添加到历史
   * @private
   * @param {Notification} notification - 通知对象
   */
  _addToHistory(notification) {
    this.history.push(notification);

    // 限制历史记录数量
    if (this.history.length > this.config.maxHistory) {
      this.history = this.history.slice(-this.config.maxHistory);
    }
  }

  /**
   * 记录日志
   * @private
   * @param {string} level - 日志级别
   * @param {string} message - 消息
   */
  _log(level, message) {
    const logEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      module: 'NotificationManager'
    };

    const logFn = level === 'error' ? console.error :
                  level === 'warn' ? console.warn : console.log;
    logFn(`[NotificationManager] ${message}`);

    this.emit('log', logEntry);
  }
}

/**
 * 创建通知管理器的工厂函数
 * @param {Object} options - 配置选项
 * @returns {NotificationManager}
 */
export function createNotificationManager(options = {}) {
  return new NotificationManager(options);
}

export default NotificationManager;
