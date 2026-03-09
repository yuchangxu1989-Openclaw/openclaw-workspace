/**
 * failure-pattern-alert handler
 *
 * 触发规则: rule.failure-pattern-alert-001
 * 职责: 检测到系统故障模式时触发告警通知
 */
'use strict';

const path = require('path');
const { writeReport, emitEvent, gateResult } = require('../lib/handler-utils');

const LOG_DIR = path.join(__dirname, '..', 'logs');

module.exports = {
  name: 'failure-pattern-alert',

  /**
   * @param {Object} context - 规则触发上下文
   * @param {string} context.pattern - 故障模式标识
   * @param {string} [context.severity] - 严重级别 (critical|high|medium|low)
   * @param {string} [context.component] - 故障组件
   * @param {string} [context.description] - 故障描述
   * @param {Object} [context.bus] - 事件总线
   */
  async execute(context = {}) {
    const {
      pattern = 'unknown',
      severity = 'high',
      component = 'unknown',
      description = '',
      bus
    } = context;
    const checks = [];
    const timestamp = new Date().toISOString();

    // 构建告警
    const alert = {
      id: `alert-${Date.now()}`,
      timestamp,
      pattern,
      severity,
      component,
      description,
      status: 'fired'
    };

    checks.push({
      name: 'pattern_detected',
      ok: true,
      message: `故障模式: ${pattern} (${severity}) - ${component}`
    });

    // 写入告警日志
    try {
      const logPath = path.join(LOG_DIR, 'failure-alerts.jsonl');
      const fs = require('fs');
      fs.mkdirSync(LOG_DIR, { recursive: true });
      fs.appendFileSync(logPath, JSON.stringify(alert) + '\n');
      checks.push({ name: 'alert_logged', ok: true, message: '告警已记录' });
    } catch (err) {
      checks.push({ name: 'alert_logged', ok: false, message: err.message });
    }

    // 发送事件通知
    const emitted = await emitEvent(bus, 'alert.failure.fired', alert);
    checks.push({
      name: 'alert_emitted',
      ok: true,
      message: emitted ? '事件已发送' : '无事件总线，跳过事件发送'
    });

    console.log(`[failure-pattern-alert] ${severity}告警: ${pattern} @ ${component}`);
    return gateResult('failure-pattern-alert', checks, { failClosed: false });
  }
};
