/**
 * AEO Phase 3 - 告警通知模块
 * 支持多级告警、飞书推送、静默规则和恢复通知
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

/**
 * 告警级别枚举
 */
const AlertLevel = {
  INFO: 'info',         // 信息
  WARNING: 'warning',   // 警告
  CRITICAL: 'critical', // 严重
  EMERGENCY: 'emergency' // 紧急
};

/**
 * 告警状态枚举
 */
const AlertStatus = {
  ACTIVE: 'active',     // 活跃
  ACKNOWLEDGED: 'acknowledged', // 已确认
  RESOLVED: 'resolved', // 已解决
  SUPPRESSED: 'suppressed' // 已静默
};

/**
 * 告警规则类
 */
class AlertRule {
  constructor(config) {
    this.id = config.id || `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name || '未命名规则';
    this.description = config.description || '';
    this.metric = config.metric; // 监控指标: cpu, memory, disk, responseTime, errorRate
    this.operator = config.operator || '>'; // 比较操作符: >, <, >=, <=, ==, !=
    this.threshold = config.threshold; // 阈值
    this.level = config.level || AlertLevel.WARNING; // 告警级别
    this.duration = config.duration || 0; // 持续时间阈值(毫秒)，0表示立即触发
    this.enabled = config.enabled !== false;
    this.labels = config.labels || {}; // 标签，用于筛选
    
    // 通知配置
    this.notifications = {
      feishu: config.feishu !== false, // 是否发送飞书通知
      channels: config.channels || [], // 飞书频道/群组
      mentions: config.mentions || [], // @提醒用户
      ...config.notifications
    };

    // 静默规则
    this.silence = {
      enabled: config.silence?.enabled || false,
      startTime: config.silence?.startTime || null,
      endTime: config.silence?.endTime || null,
      weekdays: config.silence?.weekdays || [], // 0-6, 0是周日
      ...config.silence
    };

    // 状态跟踪
    this.state = {
      lastTriggered: null,
      triggerCount: 0,
      consecutiveCount: 0,
      firstTriggeredAt: null
    };
  }

  /**
   * 评估是否触发告警
   */
  evaluate(value, labels = {}) {
    if (!this.enabled) return null;

    // 检查标签匹配
    if (!this._matchLabels(labels)) return null;

    // 检查静默规则
    if (this._isSilenced()) return null;

    const triggered = this._compare(value);
    const now = Date.now();

    if (triggered) {
      this.state.consecutiveCount++;
      
      // 检查是否满足持续时间要求
      if (this.duration > 0) {
        if (!this.state.firstTriggeredAt) {
          this.state.firstTriggeredAt = now;
          return null; // 首次触发，等待持续时间
        }
        
        const elapsed = now - this.state.firstTriggeredAt;
        if (elapsed < this.duration) {
          return null; // 持续时间不足
        }
      }

      // 生成告警
      this.state.lastTriggered = now;
      this.state.triggerCount++;
      
      return this._createAlert(value, now);
    } else {
      // 重置连续计数
      this.state.consecutiveCount = 0;
      this.state.firstTriggeredAt = null;
      return null;
    }
  }

  /**
   * 重置状态
   */
  reset() {
    this.state = {
      lastTriggered: null,
      triggerCount: 0,
      consecutiveCount: 0,
      firstTriggeredAt: null
    };
  }

  _compare(value) {
    switch (this.operator) {
      case '>': return value > this.threshold;
      case '<': return value < this.threshold;
      case '>=': return value >= this.threshold;
      case '<=': return value <= this.threshold;
      case '==': return value === this.threshold;
      case '!=': return value !== this.threshold;
      default: return false;
    }
  }

  _matchLabels(labels) {
    if (Object.keys(this.labels).length === 0) return true;
    
    for (const [key, value] of Object.entries(this.labels)) {
      if (labels[key] !== value) return false;
    }
    return true;
  }

  _isSilenced() {
    if (!this.silence.enabled) return false;

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;
    const currentWeekday = now.getDay();

    // 检查星期
    if (this.silence.weekdays.length > 0) {
      if (!this.silence.weekdays.includes(currentWeekday)) return false;
    }

    // 检查时间范围
    if (this.silence.startTime && this.silence.endTime) {
      const [startHour, startMin] = this.silence.startTime.split(':').map(Number);
      const [endHour, endMin] = this.silence.endTime.split(':').map(Number);
      const start = startHour * 60 + startMin;
      const end = endHour * 60 + endMin;

      if (start <= end) {
        if (currentTime >= start && currentTime <= end) return true;
      } else {
        // 跨天的情况
        if (currentTime >= start || currentTime <= end) return true;
      }
    }

    return false;
  }

  _createAlert(value, timestamp) {
    return {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ruleId: this.id,
      ruleName: this.name,
      level: this.level,
      metric: this.metric,
      value: value,
      threshold: this.threshold,
      operator: this.operator,
      timestamp: timestamp,
      status: AlertStatus.ACTIVE,
      notifications: this.notifications
    };
  }
}

/**
 * 告警通知器主类
 */
class AlertNotifier extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      historyLimit: options.historyLimit || 1000,
      dedupWindow: options.dedupWindow || 300000, // 5分钟内相同告警去重
      autoResolve: options.autoResolve !== false,
      resolveInterval: options.resolveInterval || 60000, // 每分钟检查恢复
      storagePath: options.storagePath || './alert-history.json',
      feishuWebhook: options.feishuWebhook || null,
      ...options
    };

    this.rules = new Map();
    this.activeAlerts = new Map();
    this.alertHistory = [];
    this.silenceRules = new Map(); // 全局静默规则

    this.resolveTimer = null;
    this.isRunning = false;

    this._loadHistory();
  }

  /**
   * 启动告警通知器
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('[AlertNotifier] 告警通知器已启动');

    // 启动自动恢复检查
    if (this.options.autoResolve) {
      this.resolveTimer = setInterval(() => {
        this._checkAutoResolve();
      }, this.options.resolveInterval);
    }

    this.emit('started');
  }

  /**
   * 停止告警通知器
   */
  stop() {
    this.isRunning = false;
    
    if (this.resolveTimer) {
      clearInterval(this.resolveTimer);
      this.resolveTimer = null;
    }

    this._saveHistory();
    console.log('[AlertNotifier] 告警通知器已停止');
    this.emit('stopped');
  }

  /**
   * 添加告警规则
   */
  addRule(config) {
    const rule = new AlertRule(config);
    this.rules.set(rule.id, rule);
    console.log(`[AlertNotifier] 添加规则: ${rule.name} (${rule.id})`);
    return rule.id;
  }

  /**
   * 删除告警规则
   */
  removeRule(ruleId) {
    const rule = this.rules.get(ruleId);
    if (rule) {
      this.rules.delete(ruleId);
      console.log(`[AlertNotifier] 删除规则: ${rule.name}`);
      return true;
    }
    return false;
  }

  /**
   * 启用/禁用规则
   */
  toggleRule(ruleId, enabled) {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * 评估指标并触发告警
   */
  evaluate(metric, value, labels = {}) {
    const triggeredAlerts = [];

    for (const rule of this.rules.values()) {
      if (rule.metric === metric) {
        const alert = rule.evaluate(value, labels);
        if (alert) {
          // 检查去重
          if (!this._isDuplicate(alert)) {
            this._processAlert(alert);
            triggeredAlerts.push(alert);
          }
        }
      }
    }

    return triggeredAlerts;
  }

  /**
   * 批量评估多个指标
   */
  evaluateBatch(metrics) {
    const allAlerts = [];
    
    for (const { metric, value, labels } of metrics) {
      const alerts = this.evaluate(metric, value, labels);
      allAlerts.push(...alerts);
    }

    return allAlerts;
  }

  /**
   * 确认告警
   */
  acknowledgeAlert(alertId, acknowledgedBy = null) {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.status = AlertStatus.ACKNOWLEDGED;
      alert.acknowledgedBy = acknowledgedBy;
      alert.acknowledgedAt = Date.now();
      
      this.emit('acknowledged', alert);
      console.log(`[AlertNotifier] 告警已确认: ${alert.ruleName}`);
      return true;
    }
    return false;
  }

  /**
   * 解决告警
   */
  resolveAlert(alertId, resolvedBy = null, message = null) {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.status = AlertStatus.RESOLVED;
      alert.resolvedBy = resolvedBy;
      alert.resolvedAt = Date.now();
      alert.resolveMessage = message;

      this.activeAlerts.delete(alertId);
      this.alertHistory.push(alert);
      this._trimHistory();

      // 发送恢复通知
      this._sendRecoveryNotification(alert);

      this.emit('resolved', alert);
      console.log(`[AlertNotifier] 告警已解决: ${alert.ruleName}`);
      
      this._saveHistory();
      return true;
    }
    return false;
  }

  /**
   * 添加全局静默规则
   */
  addSilenceRule(config) {
    const silenceId = `silence_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const silenceRule = {
      id: silenceId,
      name: config.name || '静默规则',
      matchers: config.matchers || {}, // 匹配条件 { metric, level, labels }
      startTime: config.startTime || Date.now(),
      endTime: config.endTime || Date.now() + 3600000, // 默认1小时
      comment: config.comment || '',
      createdBy: config.createdBy || null,
      enabled: true
    };

    this.silenceRules.set(silenceId, silenceRule);
    console.log(`[AlertNotifier] 添加静默规则: ${silenceRule.name}`);
    return silenceId;
  }

  /**
   * 删除静默规则
   */
  removeSilenceRule(silenceId) {
    return this.silenceRules.delete(silenceId);
  }

  /**
   * 获取活跃告警
   */
  getActiveAlerts(filters = {}) {
    let alerts = Array.from(this.activeAlerts.values());

    if (filters.level) {
      alerts = alerts.filter(a => a.level === filters.level);
    }
    if (filters.metric) {
      alerts = alerts.filter(a => a.metric === filters.metric);
    }
    if (filters.status) {
      alerts = alerts.filter(a => a.status === filters.status);
    }

    return alerts;
  }

  /**
   * 获取告警历史
   */
  getAlertHistory(filters = {}, limit = 100) {
    let history = [...this.alertHistory];

    if (filters.level) {
      history = history.filter(a => a.level === filters.level);
    }
    if (filters.metric) {
      history = history.filter(a => a.metric === filters.metric);
    }
    if (filters.startTime) {
      history = history.filter(a => a.timestamp >= filters.startTime);
    }
    if (filters.endTime) {
      history = history.filter(a => a.timestamp <= filters.endTime);
    }

    return history.slice(-limit);
  }

  /**
   * 生成飞书告警卡片
   */
  generateFeishuAlertCard(alert, type = 'alert') {
    const levelConfig = this._getLevelConfig(alert.level);
    
    const card = {
      config: { wide_screen_mode: true },
      header: {
        template: levelConfig.color,
        title: { 
          tag: "plain_text", 
          content: type === 'recovery' ? '✅ 告警恢复' : `${levelConfig.emoji} ${levelConfig.label}告警` 
        },
        subtitle: { 
          tag: "plain_text", 
          content: alert.ruleName 
        }
      },
      elements: [
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**告警规则**: ${alert.ruleName}\n**监控指标**: ${alert.metric}\n**当前值**: ${this._formatValue(alert.value)} ${alert.operator} ${this._formatValue(alert.threshold)}`
          }
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**触发时间**: ${this._formatTime(alert.timestamp)}`
          }
        }
      ]
    };

    if (type === 'alert') {
      card.elements.push({
        tag: "action",
        actions: [
          {
            tag: "button",
            text: { tag: "plain_text", content: "确认告警" },
            type: "primary",
            value: { action: "ack_alert", alertId: alert.id }
          },
          {
            tag: "button",
            text: { tag: "plain_text", content: "查看详情" },
            type: "default",
            value: { action: "view_alert", alertId: alert.id }
          }
        ]
      });

      // 添加 @提醒
      if (alert.notifications?.mentions?.length > 0) {
        const mentions = alert.notifications.mentions.map(m => `<at id=${m}></at>`).join(' ');
        card.elements.push({
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**提醒**: ${mentions}`
          }
        });
      }
    } else if (type === 'recovery') {
      card.elements.push({
        tag: "div",
        text: {
          tag: "lark_md",
          content: `**恢复时间**: ${this._formatTime(alert.resolvedAt)}\n**持续时间**: ${this._formatDuration(alert.resolvedAt - alert.timestamp)}`
        }
      });
    }

    return card;
  }

  /**
   * 生成告警统计卡片
   */
  generateFeishuSummaryCard(period = '24h') {
    const now = Date.now();
    const periodMs = period === '24h' ? 86400000 : period === '7d' ? 604800000 : 86400000;
    const startTime = now - periodMs;

    const periodAlerts = this.alertHistory.filter(a => a.timestamp >= startTime);
    const activeCount = this.activeAlerts.size;
    
    const stats = {
      total: periodAlerts.length + activeCount,
      active: activeCount,
      resolved: periodAlerts.filter(a => a.status === AlertStatus.RESOLVED).length,
      byLevel: {
        emergency: periodAlerts.filter(a => a.level === AlertLevel.EMERGENCY).length,
        critical: periodAlerts.filter(a => a.level === AlertLevel.CRITICAL).length,
        warning: periodAlerts.filter(a => a.level === AlertLevel.WARNING).length,
        info: periodAlerts.filter(a => a.level === AlertLevel.INFO).length
      }
    };

    return {
      config: { wide_screen_mode: true },
      header: {
        template: stats.active > 0 ? 'red' : 'green',
        title: { tag: "plain_text", content: "📊 告警统计" },
        subtitle: { tag: "plain_text", content: `最近${period}` }
      },
      elements: [
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**总告警数**: ${stats.total} | **活跃告警**: ${stats.active} | **已解决**: ${stats.resolved}`
          }
        },
        {
          tag: "hr"
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**按级别分布**:\n🚨 紧急: ${stats.byLevel.emergency}\n🔴 严重: ${stats.byLevel.critical}\n🟡 警告: ${stats.byLevel.warning}\n🔵 信息: ${stats.byLevel.info}`
          }
        },
        {
          tag: "note",
          elements: [
            { tag: "plain_text", content: `统计时间: ${this._formatTime(now)}` }
          ]
        }
      ]
    };
  }

  /**
   * 发送飞书通知（模拟，实际实现需要调用飞书API）
   */
  async sendFeishuNotification(card, webhook = null) {
    const targetWebhook = webhook || this.options.feishuWebhook;
    
    if (!targetWebhook) {
      console.log('[AlertNotifier] 未配置飞书Webhook，跳过发送');
      return { success: false, error: 'No webhook configured' };
    }

    // 模拟发送
    console.log('[AlertNotifier] 发送飞书通知:', JSON.stringify(card.header.title, null, 2));
    
    // 实际实现:
    // const response = await fetch(targetWebhook, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ msg_type: 'interactive', card })
    // });
    // return response.json();

    return { success: true, message: 'Notification sent (mock)' };
  }

  /**
   * 导出告警报告
   */
  exportReport(filepath, filters = {}) {
    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        activeAlerts: this.activeAlerts.size,
        totalHistory: this.alertHistory.length,
        rulesCount: this.rules.size,
        silenceRulesCount: this.silenceRules.size
      },
      activeAlerts: Array.from(this.activeAlerts.values()),
      history: this.getAlertHistory(filters),
      rules: Array.from(this.rules.values()).map(r => ({
        id: r.id,
        name: r.name,
        enabled: r.enabled,
        metric: r.metric,
        threshold: r.threshold,
        level: r.level
      }))
    };

    if (filepath) {
      fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
    }

    return report;
  }

  // ============ 私有方法 ============

  _processAlert(alert) {
    // 检查全局静默规则
    if (this._isGloballySilenced(alert)) {
      alert.status = AlertStatus.SUPPRESSED;
      console.log(`[AlertNotifier] 告警被静默规则抑制: ${alert.ruleName}`);
      return;
    }

    this.activeAlerts.set(alert.id, alert);
    
    // 发送通知
    if (alert.notifications?.feishu) {
      const card = this.generateFeishuAlertCard(alert, 'alert');
      this.sendFeishuNotification(card, alert.notifications.channels?.[0]);
    }

    this.emit('alert', alert);
    console.log(`[AlertNotifier] 告警触发: [${alert.level.toUpperCase()}] ${alert.ruleName}`);
  }

  _isDuplicate(alert) {
    // 检查是否在短时间内已有相同规则的告警
    const window = this.options.dedupWindow;
    const now = Date.now();

    for (const activeAlert of this.activeAlerts.values()) {
      if (activeAlert.ruleId === alert.ruleId && 
          now - activeAlert.timestamp < window) {
        return true;
      }
    }

    return false;
  }

  _isGloballySilenced(alert) {
    const now = Date.now();

    for (const silence of this.silenceRules.values()) {
      if (!silence.enabled) continue;
      if (now < silence.startTime || now > silence.endTime) continue;

      // 检查匹配条件
      const matchers = silence.matchers;
      if (matchers.metric && matchers.metric !== alert.metric) continue;
      if (matchers.level && matchers.level !== alert.level) continue;
      if (matchers.labels) {
        let labelsMatch = true;
        for (const [key, value] of Object.entries(matchers.labels)) {
          if (alert.labels?.[key] !== value) {
            labelsMatch = false;
            break;
          }
        }
        if (!labelsMatch) continue;
      }

      return true;
    }

    return false;
  }

  _checkAutoResolve() {
    // 自动检查并恢复已解决的告警
    // 实际实现中，这里会查询当前指标值，如果恢复正常则自动解决告警
  }

  _sendRecoveryNotification(alert) {
    if (alert.notifications?.feishu) {
      const card = this.generateFeishuAlertCard(alert, 'recovery');
      this.sendFeishuNotification(card, alert.notifications.channels?.[0]);
    }
  }

  _getLevelConfig(level) {
    const configs = {
      [AlertLevel.INFO]: { color: 'blue', emoji: '🔵', label: '信息' },
      [AlertLevel.WARNING]: { color: 'orange', emoji: '🟡', label: '警告' },
      [AlertLevel.CRITICAL]: { color: 'red', emoji: '🔴', label: '严重' },
      [AlertLevel.EMERGENCY]: { color: 'red', emoji: '🚨', label: '紧急' }
    };
    return configs[level] || configs[AlertLevel.INFO];
  }

  _formatValue(value) {
    if (typeof value === 'number') {
      return value.toFixed(2);
    }
    return String(value);
  }

  _formatTime(timestamp) {
    return new Date(timestamp).toLocaleString('zh-CN');
  }

  _formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}天${hours % 24}小时`;
    if (hours > 0) return `${hours}小时${minutes % 60}分钟`;
    if (minutes > 0) return `${minutes}分钟${seconds % 60}秒`;
    return `${seconds}秒`;
  }

  _trimHistory() {
    if (this.alertHistory.length > this.options.historyLimit) {
      this.alertHistory = this.alertHistory.slice(-this.options.historyLimit);
    }
  }

  _saveHistory() {
    try {
      const data = {
        history: this.alertHistory,
        savedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.options.storagePath, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('[AlertNotifier] 保存历史失败:', e.message);
    }
  }

  _loadHistory() {
    try {
      if (fs.existsSync(this.options.storagePath)) {
        const data = JSON.parse(fs.readFileSync(this.options.storagePath, 'utf8'));
        this.alertHistory = data.history || [];
        console.log(`[AlertNotifier] 加载历史: ${this.alertHistory.length} 条记录`);
      }
    } catch (e) {
      console.error('[AlertNotifier] 加载历史失败:', e.message);
    }
  }
}

// ============ 快捷函数 ============

function createNotifier(options = {}) {
  return new AlertNotifier(options);
}

function createAlertRule(config) {
  return new AlertRule(config);
}

function evaluateMetric(metric, value, threshold, operator = '>') {
  const rule = new AlertRule({
    metric,
    threshold,
    operator,
    level: AlertLevel.WARNING
  });
  return rule.evaluate(value);
}

// ============ 导出 ============

module.exports = {
  AlertNotifier,
  AlertRule,
  AlertLevel,
  AlertStatus,
  createNotifier,
  createAlertRule,
  evaluateMetric
};

// CLI测试
if (require.main === module) {
  console.log('=== AEO 告警通知模块测试 ===\n');

  const notifier = new AlertNotifier({
    dedupWindow: 5000,
    storagePath: '/tmp/alert-history.json'
  });

  // 添加告警规则
  const rule1 = notifier.addRule({
    name: 'CPU使用率过高',
    metric: 'cpu',
    operator: '>',
    threshold: 0.8,
    level: AlertLevel.WARNING,
    duration: 0,
    notifications: {
      feishu: true,
      mentions: ['user_001']
    }
  });

  const rule2 = notifier.addRule({
    name: '内存使用率过高',
    metric: 'memory',
    operator: '>',
    threshold: 0.9,
    level: AlertLevel.CRITICAL,
    duration: 30000, // 持续30秒
    notifications: {
      feishu: true
    }
  });

  const rule3 = notifier.addRule({
    name: '响应时间过长',
    metric: 'responseTime',
    operator: '>',
    threshold: 5000,
    level: AlertLevel.WARNING,
    silence: {
      enabled: true,
      startTime: '22:00',
      endTime: '08:00',
      weekdays: [1, 2, 3, 4, 5] // 工作日夜间静默
    }
  });

  // 监听事件
  notifier.on('alert', (alert) => {
    console.log('\n📢 收到告警事件:', alert.ruleName, `[${alert.level}]`);
  });

  notifier.on('resolved', (alert) => {
    console.log('\n✅ 告警已解决:', alert.ruleName);
  });

  // 启动
  notifier.start();

  // 测试场景
  console.log('\n--- 测试1: 触发CPU告警 ---');
  const alerts1 = notifier.evaluate('cpu', 0.85);
  console.log('触发告警数:', alerts1.length);

  console.log('\n--- 测试2: 再次触发（应该被去重）---');
  const alerts2 = notifier.evaluate('cpu', 0.87);
  console.log('触发告警数:', alerts2.length);

  console.log('\n--- 测试3: 触发内存告警 ---');
  const alerts3 = notifier.evaluate('memory', 0.95);
  console.log('触发告警数:', alerts3.length);

  console.log('\n--- 活跃告警列表 ---');
  const activeAlerts = notifier.getActiveAlerts();
  console.log(`共 ${activeAlerts.length} 个活跃告警`);
  activeAlerts.forEach(a => {
    console.log(`  - ${a.ruleName}: ${a.value} ${a.operator} ${a.threshold}`);
  });

  console.log('\n--- 飞书告警卡片 ---');
  if (activeAlerts.length > 0) {
    const card = notifier.generateFeishuAlertCard(activeAlerts[0]);
    console.log(JSON.stringify(card, null, 2));
  }

  console.log('\n--- 告警统计卡片 ---');
  const summaryCard = notifier.generateFeishuSummaryCard('24h');
  console.log(JSON.stringify(summaryCard, null, 2));

  console.log('\n--- 测试4: 确认告警 ---');
  if (activeAlerts.length > 0) {
    notifier.acknowledgeAlert(activeAlerts[0].id, 'admin');
  }

  console.log('\n--- 测试5: 解决告警 ---');
  activeAlerts.forEach(a => {
    notifier.resolveAlert(a.id, 'admin', '问题已修复');
  });

  console.log('\n--- 告警历史 ---');
  const history = notifier.getAlertHistory({}, 10);
  console.log(`共 ${history.length} 条历史记录`);

  // 停止
  setTimeout(() => {
    notifier.stop();
    console.log('\n=== 测试结束 ===');
    process.exit(0);
  }, 1000);
}
