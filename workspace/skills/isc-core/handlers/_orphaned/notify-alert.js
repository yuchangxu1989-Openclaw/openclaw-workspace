/**
 * notify-alert handler
 * 
 * 触发规则: failure-pattern-alert-001
 * 职责: 检测到故障模式时触发告警通知
 */
const fs = require('fs');
const path = require('path');
const { writeReport, emitEvent } = require('../lib/handler-utils');

const LOG_PATH = path.join(__dirname, '..', 'logs', 'notify-alert.jsonl');

module.exports = {
  name: 'notify-alert',

  /**
   * @param {Object} context
   * @param {string} context.pattern - 故障模式标识
   * @param {string} context.severity - 严重级别: critical|high|medium|low
   * @param {string} [context.message] - 告警消息
   * @param {Object} [context.details] - 详细信息
   * @param {Object} [context.bus] - 事件总线
   */
  async execute(context = {}) {
    const {
      pattern = 'unknown',
      severity = 'high',
      message = '',
      details = {},
      bus = null,
    } = context;

    const alert = {
      timestamp: new Date().toISOString(),
      pattern,
      severity,
      message: message || `故障模式告警: ${pattern}`,
      details,
      acknowledged: false,
    };

    console.log(`[notify-alert] [${severity.toUpperCase()}] ${alert.message}`);

    // 写告警报告
    const reportDir = path.join(__dirname, '..', 'reports', 'alerts');
    const reportPath = path.join(reportDir, `alert-${Date.now()}.json`);
    writeReport(reportPath, alert);

    // 发射告警事件
    await emitEvent(bus, 'system.alert.fired', {
      pattern,
      severity,
      message: alert.message,
    });

    // 日志
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, JSON.stringify(alert) + '\n');

    return { alerted: true, severity, pattern, reportPath };
  },
};
